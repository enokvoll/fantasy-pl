import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

// Returns a team's tradeable assets: rostered players + future draft-pick slots.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params
  const team = await prisma.team.findUnique({ where: { id: teamId } })
  if (!team) return Response.json({ error: "Not found" }, { status: 404 })

  const slots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null } },
    include: { player: { include: { fplTeam: { select: { shortName: true } } } } },
  })

  const picks = await prisma.draftPickSlot.findMany({
    where: { teamId },
    orderBy: [{ season: "asc" }, { round: "asc" }],
  })

  return Response.json({
    players: slots
      .filter(s => s.player)
      .map(s => ({
        playerId: s.playerId!,
        name: s.player!.webName,
        position: s.player!.position,
        club: s.player!.fplTeam.shortName,
        totalPoints: s.player!.totalPoints,
        form: s.player!.form,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints),
    picks: picks.map(p => ({
      id: p.id,
      label: `${p.season} R${p.round}`,
      season: p.season,
      round: p.round,
    })),
  })
}
