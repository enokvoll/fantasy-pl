import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getSeasonPlayerPoints } from "@/lib/season-points"
import { EligibilityEditor } from "@/components/league/EligibilityEditor"
import { SECONDARY_BADGE } from "@/lib/ui"

const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  DEF: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  MID: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  FWD: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
}

export default async function PlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>
  searchParams: Promise<{ pos?: string; q?: string; page?: string }>
}) {
  const { leagueId } = await params
  const { pos, q, page } = await searchParams

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!league) notFound()

  // Commissioner (first-created team) may edit per-league position eligibility.
  const session = await auth()
  const isCommissioner = league.teams[0]?.userId === session?.user?.id

  const offset = (parseInt(page ?? "1") - 1) * 50

  // Get owned player IDs in this league
  const owned = await prisma.rosterSlot.findMany({
    where: { team: { leagueId }, playerId: { not: null } },
    select: { playerId: true, teamId: true },
  })
  const ownedMap = new Map(owned.map(o => [o.playerId!, o.teamId]))

  // Player Rights held in this league (player → holding team name).
  const rights = await prisma.playerRights.findMany({
    where: { leagueId },
    include: { team: { select: { abbreviation: true, name: true } } },
  })
  const rightsMap = new Map(rights.map(r => [r.playerId, r.team.abbreviation || r.team.name]))

  const players = await prisma.player.findMany({
    where: {
      ...(pos ? { position: pos as "GK" | "DEF" | "MID" | "FWD" } : {}),
      ...(q ? { webName: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { fplTeam: { select: { shortName: true } } },
    orderBy: { totalPoints: "desc" },
    take: 50,
    skip: offset,
  })

  const totalPlayers = await prisma.player.count()

  // Per-league eligibility overrides for the displayed players (player → positions).
  const overrides = await prisma.leaguePlayerEligibility.findMany({
    where: { leagueId, playerId: { in: players.map(p => p.id) } },
  })
  const overrideMap = new Map(overrides.map(o => [o.playerId, o.positions as string[]]))

  // Season-to-date points (league-scoped). Empty map ⇒ preseason ⇒ render "—".
  const seasonPoints = await getSeasonPlayerPoints(leagueId, players.map(p => p.id))
  const seasonStarted = seasonPoints.size > 0

  if (players.length === 0 && totalPlayers === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">⚽</p>
        <h2 className="text-xl font-bold text-foreground mb-2">No players synced yet</h2>
        <p className="text-muted-foreground mb-6">Player data needs to be loaded from the FPL API first.</p>
        <p className="text-muted-foreground text-sm">
          Run: <code className="bg-muted px-2 py-1 rounded text-foreground">POST /api/sync/players</code>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Players</h1>
        <span className="text-muted-foreground text-sm">{totalPlayers} total players</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["All", "GK", "DEF", "MID", "FWD"].map(p => {
          const active = (p === "All" && !pos) || p === pos
          return (
            <a key={p}
              href={`/league/${leagueId}/players${p !== "All" ? `?pos=${p}` : ""}`}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors
                ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted"}`}>
              {p}
            </a>
          )
        })}
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Player</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Club</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Pos</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Eligible</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Price</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Pts</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Form</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {players.map(player => {
                  const ownerTeamId = ownedMap.get(player.id)
                  const rightsHolder = rightsMap.get(player.id)
                  const hasOverride = overrideMap.has(player.id)
                  // Effective secondary set = override if present, else auto-derived.
                  const secondary = overrideMap.get(player.id) ?? (player.secondaryPositions as string[])
                  return (
                    <tr key={player.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-foreground font-medium">{player.webName}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{player.fplTeam.shortName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${POS_COLORS[player.position] ?? ""}`}>
                          {player.position}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isCommissioner ? (
                          <EligibilityEditor
                            leagueId={leagueId}
                            playerId={player.id}
                            primary={player.position}
                            value={secondary}
                            hasOverride={hasOverride}
                          />
                        ) : secondary.length > 0 ? (
                          <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${SECONDARY_BADGE}`}>
                            {secondary.join("/")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">£{(player.nowCost / 10).toFixed(1)}m</td>
                      <td className="px-4 py-3 text-right text-foreground font-semibold">{seasonStarted ? (seasonPoints.get(player.id) ?? 0) : "—"}</td>
                      <td className="px-4 py-3 text-right text-foreground">{player.form}</td>
                      <td className="px-4 py-3 text-center">
                        {ownerTeamId ? (
                          <Badge className="bg-muted text-muted-foreground text-xs">Owned</Badge>
                        ) : rightsHolder ? (
                          <Badge className="bg-warn/15 text-warn text-xs" title="Rights held — not a free agent">
                            Rights: {rightsHolder}
                          </Badge>
                        ) : (
                          <Badge className="bg-primary/20 text-primary text-xs">Free</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
