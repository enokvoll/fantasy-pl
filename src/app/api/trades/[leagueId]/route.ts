import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { proposeTrade } from "@/lib/trade-engine"
import { ensureDraftPickSlots } from "@/lib/draft-pick-slots"
import { z } from "zod"

const assetSchema = z.object({
  fromTeamId: z.string(),
  toTeamId: z.string(),
  playerId: z.number().int().nullable().optional(),
  draftPickSlotId: z.string().nullable().optional(),
})

const proposeSchema = z.object({
  participantTeamIds: z.array(z.string()).min(1),
  assets: z.array(assetSchema).min(1),
  notes: z.string().max(500).optional(),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) return Response.json({ error: "Not found" }, { status: 404 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  // Make sure tradeable future picks exist
  await ensureDraftPickSlots(leagueId)

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, isBot: true, userId: true },
    orderBy: { name: "asc" },
  })

  // Trades involving my team
  const trades = await prisma.trade.findMany({
    where: { leagueId, participants: { some: { teamId: myTeam.id } } },
    include: {
      participants: { include: { team: { select: { id: true, name: true } } } },
      assets: {
        include: {
          player: { include: { fplTeam: { select: { shortName: true } } } },
          draftPickSlot: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Trade block (whole league)
  const blockSlots = await prisma.rosterSlot.findMany({
    where: { team: { leagueId }, isOnTradeBlock: true, playerId: { not: null } },
    include: {
      player: { include: { fplTeam: { select: { shortName: true } } } },
      team: { select: { id: true, name: true } },
    },
  })

  // My roster (for the builder)
  const myRoster = await prisma.rosterSlot.findMany({
    where: { teamId: myTeam.id, playerId: { not: null } },
    include: { player: { include: { fplTeam: { select: { shortName: true } } } } },
  })

  return Response.json({
    myTeamId: myTeam.id,
    isCommissioner: teams.length > 0 && (await prisma.team.findFirst({ where: { leagueId }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId === session.user.id,
    teams,
    trades,
    tradeBlock: blockSlots.map(s => ({
      teamId: s.team.id,
      teamName: s.team.name,
      playerId: s.playerId,
      name: s.player!.webName,
      position: s.player!.position,
      club: s.player!.fplTeam.shortName,
      totalPoints: s.player!.totalPoints,
    })),
    myRoster: myRoster.map(s => ({
      playerId: s.playerId,
      isOnTradeBlock: s.isOnTradeBlock,
      name: s.player!.webName,
      position: s.player!.position,
      club: s.player!.fplTeam.shortName,
      totalPoints: s.player!.totalPoints,
    })),
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const body = await req.json()
  const parsed = proposeSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid trade data" }, { status: 400 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  try {
    const assets = parsed.data.assets.map(a => ({
      fromTeamId: a.fromTeamId,
      toTeamId: a.toTeamId,
      playerId: a.playerId ?? undefined,
      draftPickSlotId: a.draftPickSlotId ?? undefined,
    }))
    const tradeId = await proposeTrade(leagueId, myTeam.id, parsed.data.participantTeamIds, assets, parsed.data.notes)
    return Response.json({ ok: true, tradeId }, { status: 201 })
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 })
  }
}
