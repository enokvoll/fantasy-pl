import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { setTradeBlock } from "@/lib/trade-engine"
import { z } from "zod"

const schema = z.object({ playerId: z.number().int(), on: z.boolean() })

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

  // Ensure the player is on my roster
  const slot = await prisma.rosterSlot.findFirst({ where: { teamId: myTeam.id, playerId: parsed.data.playerId } })
  if (!slot) return Response.json({ error: "Player not on your roster" }, { status: 400 })

  await setTradeBlock(myTeam.id, parsed.data.playerId, parsed.data.on)
  return Response.json({ ok: true })
}
