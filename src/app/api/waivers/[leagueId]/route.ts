import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { processInstantPickup } from "@/lib/waiver-engine"
import { z } from "zod"

const claimSchema = z.object({
  targetPlayerId: z.number().int(),
  dropPlayerId: z.number().int().nullable().optional(),
  faabBid: z.number().int().min(0).nullable().optional(),
})

// GET — current user's team waiver context: claims, FAAB balance, waiver priority, waiver type
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

  // Pending claims for my team
  const myClaims = await prisma.waiverClaim.findMany({
    where: { teamId: myTeam.id },
    include: {
      targetPlayer: { include: { fplTeam: { select: { shortName: true } } } },
      dropPlayer: { select: { webName: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
  })

  // Waiver order across the league
  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { waiverPriority: "asc" },
    select: { id: true, name: true, waiverPriority: true, faabBalance: true, isBot: true },
  })

  return Response.json({
    waiverType: league.waiverType,
    faabBudget: league.faabBudget,
    myTeam: { id: myTeam.id, faabBalance: myTeam.faabBalance, waiverPriority: myTeam.waiverPriority },
    claims: myClaims,
    waiverOrder: teams,
  })
}

// POST — submit a waiver claim, or instant pickup for FREE_AGENT/CONTINUOUS leagues
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const body = await req.json()
  const parsed = claimSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 })

  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) return Response.json({ error: "Not found" }, { status: 404 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  const { targetPlayerId, dropPlayerId, faabBid } = parsed.data

  // Free agency: process immediately
  if (league.waiverType === "FREE_AGENT" || league.waiverType === "CONTINUOUS") {
    try {
      await processInstantPickup(leagueId, myTeam.id, targetPlayerId, dropPlayerId ?? undefined)
      return Response.json({ ok: true, instant: true })
    } catch (e) {
      return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 })
    }
  }

  // FAAB validation
  if (league.waiverType === "FAAB") {
    if (faabBid == null) return Response.json({ error: "A FAAB bid is required" }, { status: 400 })
    if (myTeam.faabBalance != null && faabBid > myTeam.faabBalance) {
      return Response.json({ error: `Bid exceeds your remaining budget (£${myTeam.faabBalance})` }, { status: 400 })
    }
  }

  // Prevent duplicate pending claim for same player
  const existing = await prisma.waiverClaim.findFirst({
    where: { teamId: myTeam.id, targetPlayerId, status: "PENDING" },
  })
  if (existing) return Response.json({ error: "You already have a pending claim for this player" }, { status: 409 })

  const claim = await prisma.waiverClaim.create({
    data: {
      leagueId,
      teamId: myTeam.id,
      targetPlayerId,
      dropPlayerId: dropPlayerId ?? null,
      faabBid: league.waiverType === "FAAB" ? faabBid : null,
      priority: myTeam.waiverPriority,
      status: "PENDING",
    },
  })

  return Response.json({ ok: true, claim }, { status: 201 })
}

// DELETE — cancel a pending claim
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const claimId = searchParams.get("claimId")
  if (!claimId) return Response.json({ error: "Missing claimId" }, { status: 400 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  const claim = await prisma.waiverClaim.findUnique({ where: { id: claimId } })
  if (!claim || claim.teamId !== myTeam.id) return Response.json({ error: "Claim not found" }, { status: 404 })
  if (claim.status !== "PENDING") return Response.json({ error: "Only pending claims can be cancelled" }, { status: 400 })

  await prisma.waiverClaim.update({ where: { id: claimId }, data: { status: "CANCELLED" } })
  return Response.json({ ok: true })
}
