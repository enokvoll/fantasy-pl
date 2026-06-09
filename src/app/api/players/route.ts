import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leagueId = searchParams.get("leagueId")
  const available = searchParams.get("available") === "true"
  const sortBy = (searchParams.get("sortBy") ?? "totalPoints") as "totalPoints" | "form" | "nowCost"
  const search = searchParams.get("q") ?? ""
  const position = searchParams.get("position") as "GK" | "DEF" | "MID" | "FWD" | null
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)
  const offset = parseInt(searchParams.get("offset") ?? "0")

  let ownedPlayerIds: number[] = []
  if (available && leagueId) {
    const owned = await prisma.rosterSlot.findMany({
      where: { team: { leagueId }, playerId: { not: null } },
      select: { playerId: true },
    })
    ownedPlayerIds = owned.map((s) => s.playerId as number)
  }

  const players = await prisma.player.findMany({
    where: {
      ...(available && leagueId ? { id: { notIn: ownedPlayerIds } } : {}),
      ...(position ? { position } : {}),
      ...(search ? { webName: { contains: search, mode: "insensitive" } } : {}),
    },
    include: { fplTeam: { select: { shortName: true } } },
    orderBy: sortBy === "form" ? { form: "desc" } : sortBy === "nowCost" ? { nowCost: "desc" } : { totalPoints: "desc" },
    take: limit,
    skip: offset,
  })

  return Response.json({ players, total: players.length })
}
