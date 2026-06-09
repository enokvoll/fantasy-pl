import { prisma } from "@/lib/prisma"
import type { RosterConfig } from "@/types/draft"
import type { Position } from "@/generated/prisma/client"

/** Returns the team IDs in pick order for a given overall pick number (0-indexed). */
export function getPickOrder(teamIds: string[], totalRounds: number): string[] {
  const order: string[] = []
  for (let round = 1; round <= totalRounds; round++) {
    const roundOrder = round % 2 === 0 ? [...teamIds].reverse() : [...teamIds]
    order.push(...roundOrder)
  }
  return order
}

/** Returns the teamId whose turn it is for a given overall pick index (0-indexed). */
export function getTeamForPick(teamIds: string[], pickIndex: number): string {
  const n = teamIds.length
  const round = Math.floor(pickIndex / n)
  const posInRound = pickIndex % n
  return round % 2 === 0 ? teamIds[posInRound] : teamIds[n - 1 - posInRound]
}

export async function makePick(
  draftId: string,
  teamId: string,
  playerId: number,
  isAutoPick: boolean
): Promise<{ pick: import("@/generated/prisma/client").DraftPick; leagueId: string; nextTeamId: string | null; pickTimeSeconds: number }> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.draft.findUniqueOrThrow({
      where: { id: draftId },
      include: {
        league: { include: { teams: { orderBy: { draftOrder: "asc" } } } },
        picks: true,
      },
    })

    if (draft.status !== "IN_PROGRESS") throw new Error("Draft is not in progress")

    const teamIds = draft.league.teams.map((t) => t.id)
    const expectedTeamId = getTeamForPick(teamIds, draft.currentPick)
    if (expectedTeamId !== teamId) throw new Error("It is not your turn to pick")

    // Check player not already taken
    const alreadyPicked = await tx.draftPick.findFirst({
      where: { draftId, playerId },
    })
    if (alreadyPicked) throw new Error("Player already drafted")

    const n = teamIds.length
    const round = Math.floor(draft.currentPick / n) + 1
    const pickInRound = (draft.currentPick % n) + 1

    const pick = await tx.draftPick.create({
      data: {
        draftId,
        round,
        pickInRound,
        overallPick: draft.currentPick + 1,
        ownerTeamId: teamId,
        originalTeamId: teamId,
        playerId,
        isAutoPick,
        pickedAt: new Date(),
      },
    })

    // Add player to team's roster
    const rosterConfig = draft.league.rosterConfig as unknown as RosterConfig
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } })
    const existingStarters = await tx.rosterSlot.count({
      where: { teamId, slotType: "STARTER", isStarting: true },
    })
    const isStarting = existingStarters < totalStarterSlots(rosterConfig)

    await tx.rosterSlot.create({
      data: {
        teamId,
        playerId,
        slotType: isStarting ? "STARTER" : "BENCH",
        position: player.position,
        isStarting,
        acquireType: "DRAFT",
      },
    })

    // Advance draft
    const nextPick = draft.currentPick + 1
    const totalPicks = n * totalRounds(rosterConfig)
    const isComplete = nextPick >= totalPicks
    const nextTeamId = isComplete ? null : getTeamForPick(teamIds, nextPick)

    await tx.draft.update({
      where: { id: draftId },
      data: {
        currentPick: nextPick,
        currentRound: Math.floor(nextPick / n) + 1,
        status: isComplete ? "COMPLETED" : "IN_PROGRESS",
        completedAt: isComplete ? new Date() : undefined,
      },
    })

    return {
      pick,
      leagueId: draft.leagueId,
      nextTeamId,
      pickTimeSeconds: draft.league.draftPickTimeSeconds,
    }
  })
}

export async function getAutoPickPlayer(
  teamId: string,
  draftId: string,
  rosterConfig: RosterConfig
): Promise<number> {
  const draft = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } })

  // Get already drafted player IDs in this league
  const pickedPlayerIds = (
    await prisma.draftPick.findMany({
      where: { draftId, playerId: { not: null } },
      select: { playerId: true },
    })
  ).map((p) => p.playerId as number)

  // Check team's queue first
  const queue = await prisma.draftQueue.findMany({
    where: { draftId, teamId },
    orderBy: { priority: "asc" },
    include: { draft: true },
  })

  for (const item of queue) {
    if (!pickedPlayerIds.includes(item.playerId)) {
      return item.playerId
    }
  }

  // Determine roster needs
  const currentRoster = await prisma.rosterSlot.findMany({
    where: { teamId },
    include: { player: true },
  })
  const positionCounts = countPositions(currentRoster)
  const neededPosition = getMostNeededPosition(positionCounts, rosterConfig)

  // Best available player by totalPoints
  const bpa = await prisma.player.findFirst({
    where: {
      id: { notIn: pickedPlayerIds },
      ...(neededPosition ? { position: neededPosition } : {}),
    },
    orderBy: { totalPoints: "desc" },
  })

  if (!bpa) throw new Error("No available players for auto-pick")
  return bpa.id
}

function totalStarterSlots(rc: RosterConfig): number {
  return rc.GK + rc.DEF + rc.MID + rc.FWD + rc.FLEX
}

function totalRounds(rc: RosterConfig): number {
  return totalStarterSlots(rc) + rc.BENCH
}

function countPositions(
  slots: Array<{ player: { position: Position } | null }>
): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const s of slots) {
    if (s.player) counts[s.player.position]++
  }
  return counts
}

function getMostNeededPosition(
  counts: Record<Position, number>,
  rc: RosterConfig
): Position | null {
  const needs: [Position, number][] = [
    ["GK", rc.GK + 1 - counts.GK],
    ["DEF", rc.DEF + 1 - counts.DEF],
    ["MID", rc.MID + 1 - counts.MID],
    ["FWD", rc.FWD + 1 - counts.FWD],
  ]
  const needed = needs.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return needed[0]?.[0] ?? null
}
