import { syncAllHistoricalGameweeks } from "@/lib/sim-runner"
import { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await syncAllHistoricalGameweeks()
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// Also allow authenticated GET to check how many GW stats exist
export async function GET() {
  const { prisma } = await import("@/lib/prisma")

  const gameweeks = await prisma.gameWeek.findMany({
    where: { finished: true },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  })

  const counts = await Promise.all(
    gameweeks.map(async gw => ({
      gameweekId: gw.id,
      name: gw.name,
      statRows: await prisma.playerGameweekStat.count({ where: { gameweekId: gw.id } }),
    }))
  )

  const totalRows = counts.reduce((sum, c) => sum + c.statRows, 0)
  return Response.json({ gameweeks: counts, totalRows })
}
