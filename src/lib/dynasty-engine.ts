import { prisma } from "@/lib/prisma"
import { nextSeason, ensureDraftPickSlots } from "@/lib/draft-pick-slots"
import type { RosterConfig } from "@/types/draft"

/** Senior roster cap = total starter slots + bench. Youth slots are separate. */
export function getRosterSize(rc: RosterConfig): number {
  return rc.GK + rc.DEF + rc.MID + rc.FWD + rc.FLEX + rc.BENCH
}

/** Youth-squad cap (number of extra U21 prospect slots). */
export function getYouthSize(youthSlots: number | null | undefined): number {
  return youthSlots ?? 0
}

export interface RolloverResult {
  leagueId: string
  previousSeason: string
  newSeason: string
  draftId: string
}

/**
 * Offseason rollover: turn a COMPLETED dynasty season into the next one.
 * Rosters carry over intact; only standings/matchups reset and a rookie draft
 * is set up. Idempotent-ish: requires status COMPLETED, leaves status SETUP.
 */
export async function rolloverSeason(leagueId: string): Promise<RolloverResult> {
  const result = await prisma.$transaction(async (tx) => {
    const league = await tx.league.findUniqueOrThrow({
      where: { id: leagueId },
      include: { teams: true },
    })

    if (league.type !== "DYNASTY") throw new Error("Season rollover is only available for dynasty leagues")
    if (league.status !== "COMPLETED") throw new Error("Season must be completed before rolling over")

    const previousSeason = league.season
    const newSeason = nextSeason(previousSeason)

    // 1. Capture final standings order (worst -> best) BEFORE resetting records.
    //    Worst = fewest wins, then fewest pointsFor.
    const standingsWorstFirst = [...league.teams].sort((a, b) => {
      if (a.wins !== b.wins) return a.wins - b.wins
      return a.pointsFor - b.pointsFor
    })

    // 2. Carry rosters over: bump years owned, clear last season's lineup.
    await tx.rosterSlot.updateMany({
      where: { teamId: { in: league.teams.map((t) => t.id) }, playerId: { not: null } },
      data: { isStarting: false, lineupPosition: null },
    })
    // dynastyYearsOwned increment can't use updateMany on a per-row basis with
    // a computed value, so increment in bulk via raw-safe loop on filled slots.
    const filledSlots = await tx.rosterSlot.findMany({
      where: { teamId: { in: league.teams.map((t) => t.id) }, playerId: { not: null } },
      select: { id: true, dynastyYearsOwned: true },
    })
    for (const slot of filledSlots) {
      await tx.rosterSlot.update({
        where: { id: slot.id },
        data: { dynastyYearsOwned: (slot.dynastyYearsOwned ?? 0) + 1 },
      })
    }

    // 3. Reset season state: delete matchups + gameweek scores, zero records.
    await tx.matchup.deleteMany({ where: { leagueId } })
    await tx.teamGameweekScore.deleteMany({
      where: { teamId: { in: league.teams.map((t) => t.id) } },
    })
    await tx.team.updateMany({
      where: { leagueId },
      data: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
    })

    // 4. Assign rookie-draft order.
    if (league.rookieDraftOrder !== "KEEP_ORDER") {
      for (let i = 0; i < standingsWorstFirst.length; i++) {
        await tx.team.update({
          where: { id: standingsWorstFirst[i].id },
          data: { draftOrder: i + 1 },
        })
      }
    }

    // 5. Advance the season and re-open the league for the rookie draft.
    await tx.league.update({
      where: { id: leagueId },
      data: { season: newSeason, status: "SETUP" },
    })

    // 6. Reset the league's draft row into a fresh rookie draft.
    let draft = await tx.draft.findFirst({ where: { leagueId } })
    if (draft) {
      await tx.draftQueue.deleteMany({ where: { draftId: draft.id } })
      await tx.draftPick.deleteMany({ where: { draftId: draft.id } })
      draft = await tx.draft.update({
        where: { id: draft.id },
        data: {
          status: "PENDING",
          isRookieDraft: true,
          currentPick: 0,
          currentRound: 1,
          startedAt: null,
          completedAt: null,
        },
      })
    } else {
      draft = await tx.draft.create({
        data: { leagueId, isRookieDraft: true },
      })
    }

    return {
      result: { leagueId, previousSeason, newSeason, draftId: draft.id },
      rookieRounds: league.rookieDraftRounds,
    }
  })

  // 7. Regenerate tradeable future-pick slots for the next season (rookie rounds).
  //    Done outside the transaction since ensureDraftPickSlots opens its own.
  await ensureDraftPickSlots(leagueId, result.rookieRounds).catch(() => {})

  return result.result
}

/**
 * Reset the league's single Draft row into a youth (prospect) draft. Runs as a
 * sequential phase after the startup/rookie draft has COMPLETED, so it respects
 * the one-Draft-row-per-league invariant. Leaves the draft PENDING for the
 * commissioner to start in the draft room.
 */
export async function startYouthDraft(leagueId: string): Promise<{ draftId: string }> {
  return prisma.$transaction(async (tx) => {
    const league = await tx.league.findUniqueOrThrow({ where: { id: leagueId } })
    if (league.type !== "DYNASTY" || !league.youthSquadEnabled) {
      throw new Error("This league does not have a youth squad")
    }

    const existing = await tx.draft.findFirst({ where: { leagueId } })
    if (existing && existing.status !== "COMPLETED" && existing.status !== "PENDING") {
      throw new Error("Finish the current draft before starting the youth draft")
    }

    let draft = existing
    if (draft) {
      await tx.draftQueue.deleteMany({ where: { draftId: draft.id } })
      await tx.draftPick.deleteMany({ where: { draftId: draft.id } })
      draft = await tx.draft.update({
        where: { id: draft.id },
        data: {
          status: "PENDING",
          isYouthDraft: true,
          isRookieDraft: false,
          currentPick: 0,
          currentRound: 1,
          startedAt: null,
          completedAt: null,
        },
      })
    } else {
      draft = await tx.draft.create({ data: { leagueId, isYouthDraft: true } })
    }

    return { draftId: draft.id }
  })
}

/** Drop a player to free agency by removing their roster slot. Owner-scoped. */
export async function cutPlayer(teamId: string, rosterSlotId: string): Promise<void> {
  const slot = await prisma.rosterSlot.findUnique({ where: { id: rosterSlotId } })
  if (!slot || slot.teamId !== teamId) throw new Error("Roster slot not found for this team")
  await prisma.rosterSlot.delete({ where: { id: rosterSlotId } })
}

/** Auto-cut the n lowest-scoring rostered players (bots / at-cap auto-pick). */
export async function autoCutLowest(teamId: string, n: number): Promise<void> {
  if (n <= 0) return
  const slots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null } },
    include: { player: { select: { totalPoints: true } } },
  })
  const lowest = slots
    .sort((a, b) => (a.player?.totalPoints ?? 0) - (b.player?.totalPoints ?? 0))
    .slice(0, n)
  for (const slot of lowest) {
    await prisma.rosterSlot.delete({ where: { id: slot.id } })
  }
}
