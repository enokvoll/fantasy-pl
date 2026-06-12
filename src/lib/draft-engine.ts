import { prisma } from "@/lib/prisma"
import { isProspectEligible, PROSPECT_MAX_MINUTES } from "@/lib/prospects"
import type { RosterConfig } from "@/types/draft"
import type { Position } from "@/generated/prisma/client"

/**
 * Fisher–Yates shuffle returning a new array. Kept in this module (not inline in
 * a component) so the `Math.random` call stays out of React render.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Returns the team IDs in pick order for a given overall pick number (0-indexed). */
export function getPickOrder(teamIds: string[], totalRounds: number): string[] {
  const order: string[] = []
  for (let round = 1; round <= totalRounds; round++) {
    const roundOrder = round % 2 === 0 ? [...teamIds].reverse() : [...teamIds]
    order.push(...roundOrder)
  }
  return order
}

/**
 * Returns the teamId whose turn it is for a given overall pick index (0-indexed).
 * `snake` (default) reverses order each round; pass `false` for a linear order
 * (used by dynasty rookie drafts with REVERSE_STANDINGS).
 */
export function getTeamForPick(teamIds: string[], pickIndex: number, snake = true): string {
  const n = teamIds.length
  const round = Math.floor(pickIndex / n)
  const posInRound = pickIndex % n
  if (snake && round % 2 === 1) return teamIds[n - 1 - posInRound]
  return teamIds[posInRound]
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

    const isRookie = draft.isRookieDraft
    const isYouth = draft.isYouthDraft
    // Offseason drafts (rookie/youth) with REVERSE_STANDINGS use a linear order.
    const snake = !((isRookie || isYouth) && draft.league.rookieDraftOrder === "REVERSE_STANDINGS")

    const teamIds = draft.league.teams.map((t) => t.id)
    const expectedTeamId = getTeamForPick(teamIds, draft.currentPick, snake)
    if (expectedTeamId !== teamId) throw new Error("It is not your turn to pick")

    // Check player not already taken in this draft
    const alreadyPicked = await tx.draftPick.findFirst({
      where: { draftId, playerId },
    })
    if (alreadyPicked) throw new Error("Player already drafted")

    // In a rookie draft, rosters carry over — reject players already on a roster
    // in this league, and enforce the roster cap (team must cut to make room).
    const rosterConfig = draft.league.rosterConfig as unknown as RosterConfig
    if (isRookie) {
      const onRoster = await tx.rosterSlot.findFirst({
        where: { playerId, team: { leagueId: draft.leagueId } },
      })
      if (onRoster) throw new Error("Player is already on a roster")

      const rosterCount = await tx.rosterSlot.count({
        where: { teamId, playerId: { not: null }, slotType: { not: "YOUTH" } },
      })
      if (rosterCount >= totalRounds(rosterConfig)) {
        if (!isAutoPick) {
          throw new Error("Roster is full — cut a player before drafting")
        }
        // Auto-pick: make room by cutting the lowest-scoring rostered player.
        const lowest = await tx.rosterSlot.findFirst({
          where: { teamId, playerId: { not: null }, slotType: { not: "YOUTH" } },
          orderBy: { player: { totalPoints: "asc" } },
        })
        if (lowest) await tx.rosterSlot.delete({ where: { id: lowest.id } })
      }
    }

    // Youth draft: picks must be prospect-eligible, unowned, and fit the youth cap.
    if (isYouth) {
      const onRoster = await tx.rosterSlot.findFirst({
        where: { playerId, team: { leagueId: draft.leagueId } },
      })
      if (onRoster) throw new Error("Player is already on a roster")

      const prospect = await tx.player.findUniqueOrThrow({ where: { id: playerId } })
      if (!isProspectEligible({ birthDate: prospect.birthDate, minutes: prospect.minutes })) {
        throw new Error("Player is not youth-prospect eligible")
      }

      const youthCount = await tx.rosterSlot.count({
        where: { teamId, slotType: "YOUTH", playerId: { not: null } },
      })
      if (youthCount >= draft.league.youthSlots) throw new Error("Youth squad is full")
    }

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

    // Add player to team's roster. Rookie picks always land on the bench
    // (starters carried over from last season).
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } })
    const existingStarters = await tx.rosterSlot.count({
      where: { teamId, slotType: "STARTER", isStarting: true },
    })
    const isStarting = !isRookie && !isYouth && existingStarters < totalStarterSlots(rosterConfig)

    await tx.rosterSlot.create({
      data: {
        teamId,
        playerId,
        slotType: isYouth ? "YOUTH" : isStarting ? "STARTER" : "BENCH",
        position: player.position,
        isStarting,
        acquireType: "DRAFT",
        developedByTeamId: isYouth ? teamId : null,
      },
    })

    // Advance draft
    const nextPick = draft.currentPick + 1
    const roundsThisDraft = isYouth
      ? draft.league.youthDraftRounds
      : isRookie
        ? draft.league.rookieDraftRounds
        : totalRounds(rosterConfig)
    const totalPicks = n * roundsThisDraft
    const isComplete = nextPick >= totalPicks
    const nextTeamId = isComplete ? null : getTeamForPick(teamIds, nextPick, snake)

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
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
    include: { league: { select: { id: true } } },
  })

  // Get already drafted player IDs in this draft
  const pickedPlayerIds = (
    await prisma.draftPick.findMany({
      where: { draftId, playerId: { not: null } },
      select: { playerId: true },
    })
  ).map((p) => p.playerId as number)

  // In a rookie or youth draft, also exclude every player already on a roster.
  if (draft.isRookieDraft || draft.isYouthDraft) {
    const rostered = await prisma.rosterSlot.findMany({
      where: { playerId: { not: null }, team: { leagueId: draft.league.id } },
      select: { playerId: true },
    })
    for (const r of rostered) if (r.playerId != null) pickedPlayerIds.push(r.playerId)
  }

  // Youth draft: best available prospect-eligible player (ignores queue/needs).
  if (draft.isYouthDraft) {
    const candidates = await prisma.player.findMany({
      where: {
        id: { notIn: pickedPlayerIds.length ? pickedPlayerIds : [-1] },
        birthDate: { not: null },
        minutes: { lt: PROSPECT_MAX_MINUTES },
      },
      orderBy: { totalPoints: "desc" },
      take: 100,
    })
    const pick = candidates.find((c) => isProspectEligible({ birthDate: c.birthDate, minutes: c.minutes }))
    if (!pick) throw new Error("No eligible prospects for auto-pick")
    return pick.id
  }

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
