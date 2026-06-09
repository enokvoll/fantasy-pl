import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { processWaiverRun } from "@/lib/waiver-engine"

// POST — process pending waivers for a gameweek.
// Authorised either by the commissioner (session) or a cron job (CRON_SECRET).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params

  const cronHeader = req.headers.get("authorization")
  const isCron = cronHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const session = await auth()
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { teams: { orderBy: { createdAt: "asc" }, take: 1 } },
    })
    if (!league) return Response.json({ error: "Not found" }, { status: 404 })
    if (league.teams[0]?.userId !== session.user.id) {
      return Response.json({ error: "Only the commissioner can process waivers" }, { status: 403 })
    }
  }

  // Determine target gameweek: explicit body, else current, else latest finished
  const body = await req.json().catch(() => ({}))
  let gameweekId: number | undefined = body?.gameweekId

  if (!gameweekId) {
    const gw = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
      ?? await prisma.gameWeek.findFirst({ where: { finished: true }, orderBy: { id: "desc" } })
    gameweekId = gw?.id
  }

  if (!gameweekId) return Response.json({ error: "No gameweek available" }, { status: 400 })

  // Attach pending claims (with no run yet) to a run for this GW
  let run = await prisma.waiverRun.findFirst({
    where: { leagueId, gameweekId, status: { in: ["PENDING", "PROCESSING"] } },
  })
  if (!run) {
    run = await prisma.waiverRun.create({ data: { leagueId, gameweekId } })
  }
  await prisma.waiverClaim.updateMany({
    where: { leagueId, status: "PENDING", waiverRunId: null },
    data: { waiverRunId: run.id },
  })

  try {
    const result = await processWaiverRun(leagueId, gameweekId)
    return Response.json({ ok: true, gameweekId, ...result })
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 })
  }
}
