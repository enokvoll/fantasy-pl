import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { RosterConfig } from "@/types/draft"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { orderBy: { draftOrder: "asc" }, include: { user: { select: { name: true } } } } },
  })
  if (!league) return Response.json({ error: "Not found" }, { status: 404 })

  // Ensure a Draft row exists
  let draft = await prisma.draft.findFirst({ where: { leagueId } })
  if (!draft) {
    // Assign random draft order if not set
    const shuffled = [...league.teams].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      await prisma.team.update({ where: { id: shuffled[i].id }, data: { draftOrder: i + 1 } })
    }
    draft = await prisma.draft.create({ data: { leagueId } })
  }

  const myTeam = league.teams.find(t => t.userId === session.user!.id)

  return Response.json({
    draft,
    league: { ...league, rosterConfig: league.rosterConfig as unknown as RosterConfig },
    teams: league.teams,
    myTeamId: myTeam?.id ?? null,
    isCommissioner: league.teams[0]?.userId === session.user!.id,
  })
}
