import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { settleDueAuctions } from "@/lib/transfer-market"

// POST — settle every past-deadline auction in the league (cron/admin).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  // Any team member may trigger settlement; only past-deadline auctions act.
  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  const result = await settleDueAuctions(leagueId)
  return Response.json({ ok: true, ...result })
}
