import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { startAuction } from "@/lib/transfer-market"
import { z } from "zod"

const schema = z.object({
  playerId: z.number().int(),
  openingBid: z.number().int().min(1),
  dropPlayerId: z.number().int().nullable().optional(),
})

// POST — start a new free-agent auction.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  const { playerId, openingBid, dropPlayerId } = parsed.data
  try {
    const auctionId = await startAuction(leagueId, myTeam.id, playerId, openingBid, dropPlayerId ?? undefined)
    return Response.json({ ok: true, auctionId }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
