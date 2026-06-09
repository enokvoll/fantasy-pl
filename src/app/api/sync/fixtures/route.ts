import { syncFixtures } from "@/lib/fpl-sync"
import { NextRequest } from "next/server"

function isCronAuthorized(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const count = await syncFixtures()
    return Response.json({ synced: true, fixtures: count })
  } catch (error) {
    console.error("Fixture sync error:", error)
    return Response.json({ synced: false, reason: String(error) })
  }
}
