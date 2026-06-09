import { syncLiveScores } from "@/lib/fpl-sync"
import { calculateTeamScore } from "@/lib/scoring"
import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

function isCronAuthorized(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const currentGW = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
    if (!currentGW) return Response.json({ synced: false, reason: "No current gameweek" })

    const synced = await syncLiveScores(currentGW.id)
    if (synced === 0) return Response.json({ synced: false, reason: "No active fixtures" })

    // Recalculate scores for all active leagues
    const leagues = await prisma.league.findMany({
      where: { status: "IN_SEASON" },
      include: { teams: true },
    })

    let scoresUpdated = 0
    for (const league of leagues) {
      for (const team of league.teams) {
        await calculateTeamScore(team.id, currentGW.id, league.id)
        scoresUpdated++
      }

      // Update matchup scores
      const matchups = await prisma.matchup.findMany({
        where: { leagueId: league.id, gameweekId: currentGW.id },
      })
      for (const matchup of matchups) {
        const homeScore = await prisma.teamGameweekScore.findUnique({
          where: { teamId_gameweekId: { teamId: matchup.homeTeamId, gameweekId: currentGW.id } },
        })
        const awayScore = matchup.awayTeamId
          ? await prisma.teamGameweekScore.findUnique({
              where: { teamId_gameweekId: { teamId: matchup.awayTeamId, gameweekId: currentGW.id } },
            })
          : null

        await prisma.matchup.update({
          where: { id: matchup.id },
          data: {
            homeScore: homeScore?.totalPoints ?? 0,
            awayScore: awayScore?.totalPoints ?? 0,
          },
        })
      }
    }

    return Response.json({ synced: true, statsUpdated: synced, scoresUpdated })
  } catch (error) {
    console.error("Score sync error:", error)
    return Response.json({ synced: false, reason: String(error) })
  }
}
