import { prisma } from "@/lib/prisma"
import type { Position } from "@/generated/prisma/client"
import {
  getFormationKey,
  resolveFormationBoost,
  type ScoringAction,
} from "@/lib/formation-boosts"
import { DEVELOPMENT_BONUS_PCT } from "@/lib/prospects"

interface ScoringRules {
  minutesPlayed1to59: number
  minutesPlayed60plus: number
  goalScoredByPosition: Record<Position, number>
  assist: number
  cleanSheetByPosition: Record<Position, number>
  goalsConceded2PerGkDef: number
  ownGoal: number
  penaltySaved: number
  penaltyMissed: number
  yellowCard: number
  redCard: number
  savesEvery3: number
  bonus: number
}

export const DEFAULT_SCORING: ScoringRules = {
  minutesPlayed1to59: 1,
  minutesPlayed60plus: 2,
  goalScoredByPosition: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheetByPosition: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  goalsConceded2PerGkDef: -1,
  ownGoal: -2,
  penaltySaved: 5,
  penaltyMissed: -2,
  yellowCard: -1,
  redCard: -3,
  savesEvery3: 1,
  bonus: 1,
}

export function calculatePlayerPoints(
  stats: {
    minutes: number
    goalsScored: number
    assists: number
    cleanSheets: number
    goalsConceded: number
    ownGoals: number
    penaltiesSaved: number
    penaltiesMissed: number
    yellowCards: number
    redCards: number
    saves: number
    bonus: number
  },
  position: Position,
  rules: ScoringRules = DEFAULT_SCORING,
  /** Position-resolved formation multipliers for boostable actions. */
  actionMultipliers?: Partial<Record<ScoringAction, number>>
): number {
  // Scale a boostable action's points by its formation multiplier (default 1).
  const m = (action: ScoringAction, value: number) =>
    value * (actionMultipliers?.[action] ?? 1)

  let pts = 0

  if (stats.minutes >= 60) pts += rules.minutesPlayed60plus
  else if (stats.minutes > 0) pts += rules.minutesPlayed1to59

  pts += m("goals", stats.goalsScored * rules.goalScoredByPosition[position])
  pts += m("assists", stats.assists * rules.assist)

  if (stats.cleanSheets > 0) {
    pts += m("cleanSheet", rules.cleanSheetByPosition[position])
  }

  if ((position === "GK" || position === "DEF") && stats.goalsConceded >= 2) {
    pts += Math.floor(stats.goalsConceded / 2) * rules.goalsConceded2PerGkDef
  }

  pts += stats.ownGoals * rules.ownGoal
  pts += stats.penaltiesSaved * rules.penaltySaved
  pts += stats.penaltiesMissed * rules.penaltyMissed
  pts += stats.yellowCards * rules.yellowCard
  pts += stats.redCards * rules.redCard

  if (position === "GK") {
    pts += m("saves", Math.floor(stats.saves / 3) * rules.savesEvery3)
  }

  pts += m("bonus", stats.bonus * rules.bonus)

  return pts
}

/** Round to one decimal to keep boosted (fractional) points tidy. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export async function calculateTeamScore(
  teamId: string,
  gameweekId: number,
  leagueId: string
): Promise<{ totalPoints: number; breakdown: unknown[] }> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })
  const rules = league.scoringConfig
    ? (league.scoringConfig as unknown as ScoringRules)
    : DEFAULT_SCORING

  const starters = await prisma.rosterSlot.findMany({
    where: { teamId, isStarting: true },
    include: { player: true },
  })

  const benchSlots = await prisma.rosterSlot.findMany({
    where: { teamId, slotType: "BENCH" },
    orderBy: { lineupPosition: "asc" },
    include: { player: true },
  })

  const playerIds = [
    ...starters.map((s) => s.playerId),
    ...benchSlots.map((s) => s.playerId),
  ].filter((id): id is number => id !== null)

  const gwStats = await prisma.playerGameweekStat.findMany({
    where: { gameweekId, playerId: { in: playerIds } },
  })
  const statsMap = new Map(gwStats.map((s) => [s.playerId, s]))

  // Formation boost is driven by the manager's chosen starting XI (the tactic),
  // independent of any later auto-subs.
  const formationKey = getFormationKey(
    starters
      .filter((s) => s.player)
      .map((s) => ({ position: s.player!.position }))
  )
  const boost = resolveFormationBoost(formationKey, league.formationBoostConfig)
  const actionMultipliersFor = (position: Position): Partial<Record<ScoringAction, number>> | undefined =>
    boost?.actionMultipliers?.[position]
  const starterMult = 1 + (boost?.starterTotalPct ?? 0)

  const breakdown: unknown[] = []
  let totalPoints = 0

  const usedBenchIds = new Set<number>()
  // Track counted players' goals + positions for the team-bonus condition.
  const countedScorers: { position: Position; goals: number }[] = []

  for (const slot of starters) {
    if (!slot.playerId || !slot.player) continue
    const stats = statsMap.get(slot.playerId)

    // Auto-sub: if starter didn't play, find first eligible bench player
    if (!stats || stats.minutes === 0) {
      const sub = benchSlots.find(
        (b) =>
          b.playerId !== null &&
          !usedBenchIds.has(b.playerId!) &&
          statsMap.get(b.playerId!)?.minutes &&
          (statsMap.get(b.playerId!)!.minutes ?? 0) > 0 &&
          (slot.position === null || slot.position === b.player?.position)
      )
      if (sub?.playerId && sub.player) {
        const subStats = statsMap.get(sub.playerId)!
        const devMult = sub.developmentBonus ? 1 + DEVELOPMENT_BONUS_PCT : 1
        const pts = round1(
          calculatePlayerPoints(subStats, sub.player.position, rules, actionMultipliersFor(sub.player.position)) * starterMult * devMult
        )
        usedBenchIds.add(sub.playerId)
        totalPoints += pts
        countedScorers.push({ position: sub.player.position, goals: subStats.goalsScored })
        breakdown.push({ playerId: sub.playerId, points: pts, isStarting: false, subFor: slot.playerId, homegrown: sub.developmentBonus })
      }
      continue
    }

    const devMult = slot.developmentBonus ? 1 + DEVELOPMENT_BONUS_PCT : 1
    const pts = round1(
      calculatePlayerPoints(stats, slot.player.position, rules, actionMultipliersFor(slot.player.position)) * starterMult * devMult
    )
    totalPoints += pts
    countedScorers.push({ position: slot.player.position, goals: stats.goalsScored })
    breakdown.push({ playerId: slot.playerId, points: pts, isStarting: true, homegrown: slot.developmentBonus })
  }

  // Team-level conditional bonus (e.g. +2% when 3+ attackers scored).
  let teamBonusApplied = false
  if (boost?.teamBonus) {
    const { positions, threshold, pct } = boost.teamBonus
    const qualifying = countedScorers.filter(
      (p) => positions.includes(p.position) && p.goals >= 1
    ).length
    if (qualifying >= threshold) {
      totalPoints = round1(totalPoints * (1 + pct))
      teamBonusApplied = true
    }
  }

  totalPoints = round1(totalPoints)
  breakdown.push({
    meta: true,
    formation: formationKey,
    boostLabel: boost?.label ?? null,
    teamBonusApplied,
  })

  await prisma.teamGameweekScore.upsert({
    where: { teamId_gameweekId: { teamId, gameweekId } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: { teamId, gameweekId, totalPoints, breakdown: breakdown as any },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: { totalPoints, breakdown: breakdown as any },
  })

  return { totalPoints, breakdown }
}

/** Shape of the meta entry appended to a TeamGameweekScore breakdown array. */
export interface ScoreBreakdownMeta {
  meta: true
  formation: string
  boostLabel: string | null
  teamBonusApplied: boolean
}
