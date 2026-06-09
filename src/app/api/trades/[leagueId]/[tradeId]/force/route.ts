import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { commissionerAction } from "@/lib/trade-engine"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; tradeId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId, tradeId } = await params
  const commish = await prisma.team.findFirst({ where: { leagueId }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  if (commish?.userId !== session.user.id) return Response.json({ error: "Commissioner only" }, { status: 403 })

  try {
    await commissionerAction(tradeId, "force")
    return Response.json({ ok: true, status: "COMPLETED" })
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 })
  }
}
