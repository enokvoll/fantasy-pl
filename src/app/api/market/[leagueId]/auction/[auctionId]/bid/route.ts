import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { placeBid } from "@/lib/transfer-market"
import { z } from "zod"

const schema = z.object({
  amount: z.number().int().min(1),
  dropPlayerId: z.number().int().nullable().optional(),
})

// POST — place a bid on an open auction.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; auctionId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId, auctionId } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  // Ensure the auction belongs to this league.
  const auction = await prisma.transferAuction.findUnique({ where: { id: auctionId } })
  if (!auction || auction.leagueId !== leagueId) {
    return Response.json({ error: "Auction not found" }, { status: 404 })
  }

  const { amount, dropPlayerId } = parsed.data
  try {
    const result = await placeBid(auctionId, myTeam.id, amount, dropPlayerId ?? undefined)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
