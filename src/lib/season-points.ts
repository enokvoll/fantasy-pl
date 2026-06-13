import { prisma } from "@/lib/prisma"

/**
 * Gameweek ids the league has actually played, i.e. has completed matchups for.
 * Decoupled from the global FPL `GameWeek.finished` flags so a league set up for a
 * future season reads as "preseason" until its own matchups start resolving.
 */
export async function getLeaguePlayedGameweekIds(leagueId: string): Promise<number[]> {
  const rows = await prisma.matchup.findMany({
    where: { leagueId, isCompleted: true },
    distinct: ["gameweekId"],
    select: { gameweekId: true },
  })
  return rows.map((r) => r.gameweekId)
}

export interface SeasonStatline {
  points: number
  minutes: number
  goals: number
  assists: number
  cleanSheets: number
}

/**
 * Season-to-date statlines per player, summed over the gameweeks the league has
 * played. An **empty map means preseason** (no gameweeks played yet) — callers
 * should render "—" rather than `Player.totalPoints`, which is the FPL-bootstrap
 * value (last season's total before the season starts).
 */
export async function getSeasonPlayerStatlines(
  leagueId: string,
  playerIds?: number[]
): Promise<Map<number, SeasonStatline>> {
  const playedGwIds = await getLeaguePlayedGameweekIds(leagueId)
  if (playedGwIds.length === 0) return new Map()

  const grouped = await prisma.playerGameweekStat.groupBy({
    by: ["playerId"],
    where: {
      gameweekId: { in: playedGwIds },
      ...(playerIds && playerIds.length ? { playerId: { in: playerIds } } : {}),
    },
    _sum: {
      totalPoints: true,
      minutes: true,
      goalsScored: true,
      assists: true,
      cleanSheets: true,
    },
  })

  return new Map(
    grouped.map((g) => [
      g.playerId,
      {
        points: g._sum.totalPoints ?? 0,
        minutes: g._sum.minutes ?? 0,
        goals: g._sum.goalsScored ?? 0,
        assists: g._sum.assists ?? 0,
        cleanSheets: g._sum.cleanSheets ?? 0,
      },
    ])
  )
}

/**
 * Season-to-date FPL points per player. Thin wrapper over the statline sum so the
 * players list and roster pages keep a simple points-only map.
 */
export async function getSeasonPlayerPoints(
  leagueId: string,
  playerIds?: number[]
): Promise<Map<number, number>> {
  const statlines = await getSeasonPlayerStatlines(leagueId, playerIds)
  return new Map(Array.from(statlines, ([id, s]) => [id, s.points]))
}
