import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { z } from "zod"

const joinSchema = z.object({
  inviteCode: z.string().min(1),
  teamName: z.string().min(2).max(30),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params
  const body = await req.json()
  const parsed = joinSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const league = await prisma.league.findFirst({
    where: { id: leagueId, inviteCode: parsed.data.inviteCode },
    include: { _count: { select: { teams: true } } },
  })

  if (!league) return Response.json({ error: "Invalid invite code or league not found" }, { status: 404 })
  if (league._count.teams >= league.maxTeams) return Response.json({ error: "League is full" }, { status: 400 })
  if (league.status !== "SETUP") return Response.json({ error: "League is not accepting new teams" }, { status: 400 })

  const existingTeam = await prisma.team.findFirst({
    where: { leagueId, userId: session.user.id },
  })
  if (existingTeam) return Response.json({ error: "You already have a team in this league" }, { status: 409 })

  const teamCount = await prisma.team.count({ where: { leagueId } })

  const team = await prisma.team.create({
    data: {
      name: parsed.data.teamName,
      userId: session.user.id,
      leagueId,
      waiverPriority: teamCount + 1,
      faabBalance: league.waiverType === "FAAB" ? (league.faabBudget ?? 1000) : null,
    },
  })

  return Response.json({ team }, { status: 201 })
}
