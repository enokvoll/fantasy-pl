import { simulateGameweek } from "@/lib/sim-runner"
import { auth } from "@/auth"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; gwId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId, gwId } = await params
  const gameweekId = parseInt(gwId)

  if (isNaN(gameweekId)) return Response.json({ error: "Invalid gameweekId" }, { status: 400 })

  try {
    const result = await simulateGameweek(leagueId, gameweekId)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
