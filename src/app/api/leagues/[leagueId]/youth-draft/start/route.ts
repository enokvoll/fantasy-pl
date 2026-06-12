import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { startYouthDraft } from "@/lib/dynasty-engine"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  // Commissioner = the league's first-created team (matches league overview page).
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!league) return Response.json({ error: "League not found" }, { status: 404 })
  if (league.teams[0]?.userId !== session.user.id) {
    return Response.json({ error: "Only the commissioner can start the youth draft" }, { status: 403 })
  }

  try {
    const result = await startYouthDraft(leagueId)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not start youth draft" }, { status: 400 })
  }
}
