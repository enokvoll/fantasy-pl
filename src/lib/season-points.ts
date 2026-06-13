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

/**
 * Season-to-date FPL points per player, summed over the gameweeks the league has
 * played. An **empty map means preseason** (no gameweeks played yet) — callers
 * should render "—" rather than `Player.totalPoints`, which is the FPL-bootstrap
 * value (last season's total before the season starts).
 */
export async function getSeasonPlayerPoints(
  leagueId: string,
  playerIds?: number[]
): Promise<Map<number, number>> {
  const playedGwIds = await getLeaguePlayedGameweekIds(leagueId)
  if (playedGwIds.length === 0) return new Map()

  const grouped = await prisma.playerGameweekStat.groupBy({
    by: ["playerId"],
    where: {
      gameweekId: { in: playedGwIds },
      ...(playerIds && playerIds.length ? { playerId: { in: playerIds } } : {}),
    },
    _sum: { totalPoints: true },
  })

  return new Map(grouped.map((g) => [g.playerId, g._sum.totalPoints ?? 0]))
}
