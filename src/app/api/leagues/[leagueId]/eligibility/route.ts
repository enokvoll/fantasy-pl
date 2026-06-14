import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const putSchema = z.object({
  playerId: z.number().int(),
  positions: z.array(z.enum(["DEF", "MID", "FWD"])).max(3),
})

const deleteSchema = z.object({ playerId: z.number().int() })

async function requireCommissioner(leagueId: string, userId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!league) return { error: "League not found", status: 404 as const }
  if (league.teams[0]?.userId !== userId)
    return { error: "Only the commissioner can edit eligibility", status: 403 as const }
  return { league }
}

// List per-league eligibility overrides (members).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const member = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!member) return Response.json({ error: "Forbidden" }, { status: 403 })

  const playerId = new URL(req.url).searchParams.get("playerId")
  const overrides = await prisma.leaguePlayerEligibility.findMany({
    where: { leagueId, ...(playerId ? { playerId: Number(playerId) } : {}) },
  })
  return Response.json({ overrides })
}

// Upsert a commissioner override of a player's secondary eligibility.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const gate = await requireCommissioner(leagueId, session.user.id)
  if ("error" in gate) return Response.json({ error: gate.error }, { status: gate.status })

  const parsed = putSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  const { playerId, positions } = parsed.data

  const player = await prisma.player.findUnique({ where: { id: playerId } })
  if (!player) return Response.json({ error: "Player not found" }, { status: 404 })

  // A primary position is always implicitly eligible; don't store it as a "secondary".
  const cleaned = [...new Set(positions)].filter((p) => p !== player.position)

  const override = await prisma.leaguePlayerEligibility.upsert({
    where: { leagueId_playerId: { leagueId, playerId } },
    create: { leagueId, playerId, positions: cleaned },
    update: { positions: cleaned },
  })
  return Response.json({ override })
}

// Remove an override, reverting the player to auto-derived eligibility.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const gate = await requireCommissioner(leagueId, session.user.id)
  if ("error" in gate) return Response.json({ error: gate.error }, { status: gate.status })

  const parsed = deleteSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  await prisma.leaguePlayerEligibility.deleteMany({
    where: { leagueId, playerId: parsed.data.playerId },
  })
  return Response.json({ ok: true })
}
