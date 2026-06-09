import { syncPlayers, syncGameweeks } from "@/lib/fpl-sync"
import { NextRequest } from "next/server"

function isCronAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization")
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [{ teams, players }, gameweeks] = await Promise.all([
      syncPlayers(),
      syncGameweeks(),
    ])
    return Response.json({ synced: true, teams, players, gameweeks })
  } catch (error) {
    console.error("Player sync error:", error)
    return Response.json({ synced: false, reason: String(error) })
  }
}
