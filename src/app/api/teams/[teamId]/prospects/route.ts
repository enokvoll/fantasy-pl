import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { isProspectEligible, signProspect, PROSPECT_MAX_AGE, PROSPECT_MAX_MINUTES } from "@/lib/prospects"
import { z } from "zod"

async function getOwnedTeam(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { league: true } })
  if (!team) return { error: "Team not found", status: 404 as const }
  if (team.userId !== userId) return { error: "Forbidden", status: 403 as const }
  return { team }
}

// GET — the team's youth squad plus the sign-eligible prospect pool.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params
  const res = await getOwnedTeam(teamId, session.user.id)
  if ("error" in res) return Response.json({ error: res.error }, { status: res.status })
  const { team } = res

  const youth = await prisma.rosterSlot.findMany({
    where: { teamId, slotType: "YOUTH", playerId: { not: null } },
    include: { player: { include: { fplTeam: { select: { shortName: true } } } } },
    orderBy: { acquiredAt: "asc" },
  })

  // Eligible pool = prospect-eligible players not owned by anyone in this league.
  const ownedIds = (
    await prisma.rosterSlot.findMany({
      where: { team: { leagueId: team.leagueId }, playerId: { not: null } },
      select: { playerId: true },
    })
  ).map((s) => s.playerId!)

  const candidates = await prisma.player.findMany({
    where: {
      id: { notIn: ownedIds.length ? ownedIds : [-1] },
      birthDate: { not: null },
      minutes: { lt: PROSPECT_MAX_MINUTES },
    },
    orderBy: { totalPoints: "desc" },
    take: 200,
    include: { fplTeam: { select: { shortName: true } } },
  })
  const pool = candidates
    .filter((p) => isProspectEligible({ birthDate: p.birthDate, minutes: p.minutes }))
    .slice(0, 100)

  return Response.json({
    youthSlots: team.league.youthSlots,
    youthEnabled: team.league.type === "DYNASTY" && team.league.youthSquadEnabled,
    eligibility: { maxAge: PROSPECT_MAX_AGE, maxMinutes: PROSPECT_MAX_MINUTES },
    youth: youth.map((s) => ({
      slotId: s.id,
      playerId: s.playerId,
      name: s.player!.webName,
      position: s.player!.position,
      club: s.player!.fplTeam.shortName,
      totalPoints: s.player!.totalPoints,
      developedHere: s.developedByTeamId === teamId,
      isOnTradeBlock: s.isOnTradeBlock,
    })),
    pool: pool.map((p) => ({
      id: p.id,
      name: p.webName,
      position: p.position,
      club: p.fplTeam.shortName,
      totalPoints: p.totalPoints,
      minutes: p.minutes,
    })),
  })
}

const signSchema = z.object({ playerId: z.number().int() })

// POST — sign a prospect from the pool into the youth squad.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params
  const res = await getOwnedTeam(teamId, session.user.id)
  if ("error" in res) return Response.json({ error: res.error }, { status: res.status })

  const parsed = signSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 })

  try {
    await signProspect(teamId, parsed.data.playerId)
    return Response.json({ ok: true }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
