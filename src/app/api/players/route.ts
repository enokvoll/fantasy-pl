import { prisma } from "@/lib/prisma"
import { isProspectEligible, PROSPECT_MAX_MINUTES } from "@/lib/prospects"
import { getSeasonPlayerStatlines, getLeaguePlayedGameweekIds } from "@/lib/season-points"
import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leagueId = searchParams.get("leagueId")
  const available = searchParams.get("available") === "true"
  const prospect = searchParams.get("prospect") === "true"
  const sortBy = (searchParams.get("sortBy") ?? "totalPoints") as "totalPoints" | "form" | "nowCost"
  const search = searchParams.get("q") ?? ""
  const position = searchParams.get("position") as "GK" | "DEF" | "MID" | "FWD" | null
  const fplTeamId = searchParams.get("fplTeamId")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 300)
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
      ...(fplTeamId ? { fplTeamId: Number(fplTeamId) } : {}),
      ...(search ? { webName: { contains: search, mode: "insensitive" } } : {}),
      // Youth-draft pool: pre-filter to young, low-minute players (age refined below).
      ...(prospect ? { birthDate: { not: null }, minutes: { lt: PROSPECT_MAX_MINUTES } } : {}),
    },
    include: { fplTeam: { select: { shortName: true } } },
    orderBy: sortBy === "form" ? { form: "desc" } : sortBy === "nowCost" ? { nowCost: "desc" } : { totalPoints: "desc" },
    take: prospect ? 100 : limit,
    skip: offset,
  })

  // Apply the precise age check for prospect requests.
  const result = prospect
    ? players.filter((p) => isProspectEligible({ birthDate: p.birthDate, minutes: p.minutes })).slice(0, limit)
    : players

  // Season-to-date statlines (league-scoped). Preseason → `seasonStats: null` and
  // `points: null`, so the UI shows "—" instead of last season's bootstrap totals.
  const seasonStarted = leagueId ? (await getLeaguePlayedGameweekIds(leagueId)).length > 0 : false
  const statlines = seasonStarted
    ? await getSeasonPlayerStatlines(leagueId!, result.map((p) => p.id))
    : new Map()

  const withStats = result.map((p) => {
    const s = statlines.get(p.id) ?? null
    return {
      ...p,
      points: seasonStarted ? (s?.points ?? 0) : null,
      seasonStats: seasonStarted
        ? (s ?? { points: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0 })
        : null,
    }
  })

  return Response.json({ players: withStats, total: withStats.length, seasonStarted })
}
