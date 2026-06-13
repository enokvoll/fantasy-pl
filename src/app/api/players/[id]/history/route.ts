import { auth } from "@/auth"
import { getElementSummary } from "@/lib/fpl-api"

/**
 * A player's prior Premier League seasons (from FPL `element-summary`), fetched
 * on demand for the draft-room history drawer. Read-only public data.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const playerId = Number(id)
  if (!Number.isFinite(playerId)) return Response.json({ error: "Bad id" }, { status: 400 })

  try {
    const summary = await getElementSummary(playerId)
    const pastSeasons = summary.history_past.map((s) => ({
      seasonName: s.season_name,
      totalPoints: s.total_points,
      minutes: s.minutes,
      goalsScored: s.goals_scored,
      assists: s.assists,
      cleanSheets: s.clean_sheets,
      goalsConceded: s.goals_conceded,
      bonus: s.bonus,
    }))
    return Response.json({ pastSeasons })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}
