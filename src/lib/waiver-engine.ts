import { prisma } from "@/lib/prisma"
import type { WaiverType } from "@/generated/prisma/client"

export async function processWaiverRun(
  leagueId: string,
  gameweekId: number
): Promise<{ approved: number; rejected: number }> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: { orderBy: { waiverPriority: "asc" } } },
  })

  // Get or create waiver run
  let run = await prisma.waiverRun.findFirst({
    where: { leagueId, gameweekId, status: { in: ["PENDING", "PROCESSING"] } },
  })
  if (!run) {
    run = await prisma.waiverRun.create({
      data: { leagueId, gameweekId },
    })
  }

  await prisma.waiverRun.update({ where: { id: run.id }, data: { status: "PROCESSING" } })

  const claims = await prisma.waiverClaim.findMany({
    where: { leagueId, status: "PENDING", waiverRunId: run.id },
    include: { team: true },
  })

  // Sort by waiver type rules
  const sorted = sortClaims(claims, league.waiverType)

  // Track which players have been awarded this run
  const awardedPlayers = new Set<number>()
  // Track teams that already had a successful claim (ROLLING: one claim per run)
  const teamsWithSuccessfulClaim = new Set<string>()

  let approved = 0
  let rejected = 0

  for (const claim of sorted) {
    // Check player still available
    const isOwned = await prisma.rosterSlot.findFirst({
      where: {
        playerId: claim.targetPlayerId,
        team: { leagueId },
      },
    })

    if (isOwned || awardedPlayers.has(claim.targetPlayerId)) {
      await prisma.waiverClaim.update({
        where: { id: claim.id },
        data: { status: "REJECTED", failReason: "Player already owned", processedAt: new Date() },
      })
      rejected++
      continue
    }

    // Check roster space (youth-squad slots don't count against the senior cap)
    const rosterCount = await prisma.rosterSlot.count({
      where: { teamId: claim.teamId, playerId: { not: null }, slotType: { not: "YOUTH" } },
    })
    const rosterConfig = (league.rosterConfig as unknown as { GK: number; DEF: number; MID: number; FWD: number; BENCH: number; FLEX: number })
    const maxRoster = rosterConfig.GK + rosterConfig.DEF + rosterConfig.MID + rosterConfig.FWD + rosterConfig.BENCH + rosterConfig.FLEX

    if (rosterCount >= maxRoster && !claim.dropPlayerId) {
      await prisma.waiverClaim.update({
        where: { id: claim.id },
        data: { status: "REJECTED", failReason: "Roster full — must drop a player", processedAt: new Date() },
      })
      rejected++
      continue
    }

    // Execute the claim
    await prisma.$transaction(async (tx) => {
      // Drop player if specified
      if (claim.dropPlayerId) {
        await tx.rosterSlot.updateMany({
          where: { teamId: claim.teamId, playerId: claim.dropPlayerId },
          data: { playerId: null, isStarting: false },
        })
      }

      // Add player to roster
      const player = await tx.player.findUniqueOrThrow({ where: { id: claim.targetPlayerId } })
      await tx.rosterSlot.create({
        data: {
          teamId: claim.teamId,
          playerId: claim.targetPlayerId,
          slotType: "BENCH",
          position: player.position,
          isStarting: false,
          acquireType: "WAIVER",
        },
      })

      // Deduct FAAB
      if (league.waiverType === "FAAB" && claim.faabBid !== null) {
        await tx.team.update({
          where: { id: claim.teamId },
          data: { faabBalance: { decrement: claim.faabBid! } },
        })
      }

      await tx.waiverClaim.update({
        where: { id: claim.id },
        data: { status: "APPROVED", processedAt: new Date() },
      })
    })

    awardedPlayers.add(claim.targetPlayerId)
    teamsWithSuccessfulClaim.add(claim.teamId)

    // ROLLING: move team to last priority
    if (league.waiverType === "ROLLING" || league.waiverType === "REVERSE_STANDINGS") {
      const maxPriority = Math.max(...league.teams.map((t) => t.waiverPriority ?? 0))
      await prisma.team.update({
        where: { id: claim.teamId },
        data: { waiverPriority: maxPriority + 1 },
      })
    }

    approved++
  }

  await prisma.waiverRun.update({
    where: { id: run.id },
    data: { status: "COMPLETED", processedAt: new Date() },
  })

  return { approved, rejected }
}

function sortClaims(claims: { faabBid: number | null; priority: number | null; createdAt: Date; id: string; teamId: string; targetPlayerId: number; dropPlayerId: number | null; waiverRunId: string | null; status: string; processedAt: Date | null; failReason: string | null; leagueId: string; team: unknown }[], waiverType: WaiverType) {
  return [...claims].sort((a, b) => {
    if (waiverType === "FAAB") {
      const bidDiff = (b.faabBid ?? 0) - (a.faabBid ?? 0)
      if (bidDiff !== 0) return bidDiff
    }
    // Tiebreak by waiver priority then claim time
    const priDiff = (a.priority ?? 999) - (b.priority ?? 999)
    if (priDiff !== 0) return priDiff
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

export async function processInstantPickup(
  leagueId: string,
  teamId: string,
  targetPlayerId: number,
  dropPlayerId?: number
): Promise<void> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })
  if (league.waiverType !== "FREE_AGENT" && league.waiverType !== "CONTINUOUS") {
    throw new Error("Instant pickups only allowed in FREE_AGENT or CONTINUOUS leagues")
  }

  const isOwned = await prisma.rosterSlot.findFirst({
    where: { playerId: targetPlayerId, team: { leagueId } },
  })
  if (isOwned) throw new Error("Player already owned in this league")

  await prisma.$transaction(async (tx) => {
    if (dropPlayerId) {
      await tx.rosterSlot.updateMany({
        where: { teamId, playerId: dropPlayerId },
        data: { playerId: null, isStarting: false },
      })
    }
    const player = await tx.player.findUniqueOrThrow({ where: { id: targetPlayerId } })
    await tx.rosterSlot.create({
      data: {
        teamId,
        playerId: targetPlayerId,
        slotType: "BENCH",
        position: player.position,
        isStarting: false,
        acquireType: "FREE_AGENT",
      },
    })
  })
}
