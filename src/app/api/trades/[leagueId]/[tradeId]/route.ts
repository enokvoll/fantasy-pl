import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { respondToTrade, cancelTrade, commissionerAction } from "@/lib/trade-engine"
import { z } from "zod"

const actionSchema = z.object({ action: z.enum(["accept", "reject", "cancel"]) })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; tradeId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId, tradeId } = await params
  const body = await req.json()
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  try {
    if (parsed.data.action === "cancel") {
      await cancelTrade(tradeId, myTeam.id)
      return Response.json({ ok: true, status: "CANCELLED" })
    }
    const result = await respondToTrade(tradeId, myTeam.id, parsed.data.action === "accept")
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 })
  }
}

// Commissioner cancel
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; tradeId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId, tradeId } = await params
  const commish = await prisma.team.findFirst({ where: { leagueId }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  if (commish?.userId !== session.user.id) return Response.json({ error: "Commissioner only" }, { status: 403 })

  try {
    await commissionerAction(tradeId, "cancel")
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 })
  }
}
