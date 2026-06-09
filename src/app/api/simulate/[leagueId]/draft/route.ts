import { runAutoDraft } from "@/lib/sim-runner"
import { auth } from "@/auth"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  try {
    const result = await runAutoDraft(leagueId)
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
