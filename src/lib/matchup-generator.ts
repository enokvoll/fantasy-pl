import { prisma } from "@/lib/prisma"

/**
 * Generates a round-robin H2H schedule for a league.
 * Creates one Matchup row per team per gameweek.
 * If odd number of teams, one team gets a bye each week.
 */
export async function generateMatchupSchedule(leagueId: string): Promise<number> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      teams: true,
    },
  })

  const gameweeks = await prisma.gameWeek.findMany({
    where: { finished: false },
    orderBy: { id: "asc" },
    take: 38,
  })

  if (gameweeks.length === 0) throw new Error("No gameweeks found — run FPL sync first")

  const teams = league.teams
  const n = teams.length
  const byeTeam = n % 2 !== 0 ? teams[n - 1] : null
  const rotatingTeams = n % 2 !== 0 ? teams.slice(0, n - 1) : [...teams]
  const half = rotatingTeams.length / 2

  const matchupsData: Array<{
    leagueId: string
    gameweekId: number
    homeTeamId: string
    awayTeamId: string | null
  }> = []

  for (let gw = 0; gw < gameweeks.length; gw++) {
    const gwId = gameweeks[gw].id
    const rotation = gw % (rotatingTeams.length - 1)

    // Rotate teams (keep first team fixed)
    const rotated = [
      rotatingTeams[0],
      ...rotatingTeams.slice(1).map((_, i) => rotatingTeams[((i + rotation) % (rotatingTeams.length - 1)) + 1]),
    ]

    for (let i = 0; i < half; i++) {
      matchupsData.push({
        leagueId,
        gameweekId: gwId,
        homeTeamId: rotated[i].id,
        awayTeamId: rotated[rotatingTeams.length - 1 - i].id,
      })
    }

    // Bye week
    if (byeTeam) {
      matchupsData.push({
        leagueId,
        gameweekId: gwId,
        homeTeamId: byeTeam.id,
        awayTeamId: null,
      })
    }
  }

  // Bulk insert
  await prisma.matchup.createMany({ data: matchupsData, skipDuplicates: true })
  return matchupsData.length
}
