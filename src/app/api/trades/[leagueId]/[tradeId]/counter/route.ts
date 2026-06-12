import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { counterTrade } from "@/lib/trade-engine"
import { z } from "zod"

const assetSchema = z.object({
  fromTeamId: z.string(),
  toTeamId: z.string(),
  playerId: z.number().int().nullable().optional(),
  draftPickSlotId: z.string().nullable().optional(),
})

const counterSchema = z.object({
  participantTeamIds: z.array(z.string()).min(1),
  assets: z.array(assetSchema).min(1),
  notes: z.string().max(500).optional(),
})

// POST — counter a pending trade with a revised offer.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; tradeId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId, tradeId } = await params
  const body = await req.json()
  const parsed = counterSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid counter data" }, { status: 400 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  try {
    const assets = parsed.data.assets.map((a) => ({
      fromTeamId: a.fromTeamId,
      toTeamId: a.toTeamId,
      playerId: a.playerId ?? undefined,
      draftPickSlotId: a.draftPickSlotId ?? undefined,
    }))
    const newTradeId = await counterTrade(
      tradeId,
      myTeam.id,
      parsed.data.participantTeamIds,
      assets,
      parsed.data.notes
    )
    return Response.json({ ok: true, tradeId: newTradeId }, { status: 201 })
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 })
  }
}
