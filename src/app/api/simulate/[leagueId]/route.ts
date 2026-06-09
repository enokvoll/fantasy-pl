import { runFullSimulation, updateStandings } from "@/lib/sim-runner"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  try {
    const summary = await runFullSimulation(leagueId)
    return Response.json({ ok: true, ...summary })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  const [completedGws, totalGws, standings, teams] = await Promise.all([
    prisma.matchup.groupBy({
      by: ["gameweekId"],
      where: { leagueId, isCompleted: true },
      _count: true,
    }),
    prisma.gameWeek.count({ where: { finished: true } }),
    updateStandings(leagueId),
    prisma.team.count({ where: { leagueId } }),
  ])

  const draftStatus = await prisma.draft.findFirst({
    where: { leagueId },
    select: { status: true, currentPick: true },
  })

  return Response.json({
    completedGameweeks: completedGws.length,
    totalFinishedGameweeks: totalGws,
    teamsInLeague: teams,
    draftStatus: draftStatus?.status ?? "NONE",
    standings,
  })
}
