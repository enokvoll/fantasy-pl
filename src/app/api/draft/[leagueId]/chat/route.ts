import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  const draft = await prisma.draft.findFirst({ where: { leagueId } })
  if (!draft) return Response.json({ messages: [] })

  const messages = await prisma.draftMessage.findMany({
    where: { draftId: draft.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  })

  // Get team names for each user
  const teams = await prisma.team.findMany({ where: { leagueId }, select: { userId: true, name: true } })
  const teamByUser = new Map(teams.map(t => [t.userId, t.name]))

  return Response.json({
    messages: messages.map(m => ({
      userId: m.userId,
      userName: m.user.name ?? "Unknown",
      teamName: teamByUser.get(m.userId) ?? m.user.name ?? "Unknown",
      content: m.content,
      timestamp: m.createdAt,
    })),
  })
}
