import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const POS_COLORS: Record<string, string> = {
  GK: "bg-yellow-600/20 text-yellow-400",
  DEF: "bg-blue-600/20 text-blue-400",
  MID: "bg-emerald-600/20 text-emerald-400",
  FWD: "bg-red-600/20 text-red-400",
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

  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) notFound()

  const offset = (parseInt(page ?? "1") - 1) * 50

  // Get owned player IDs in this league
  const owned = await prisma.rosterSlot.findMany({
    where: { team: { leagueId }, playerId: { not: null } },
    select: { playerId: true, teamId: true },
  })
  const ownedMap = new Map(owned.map(o => [o.playerId!, o.teamId]))

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

  if (players.length === 0 && totalPlayers === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-4xl mb-4">⚽</p>
        <h2 className="text-xl font-bold text-white mb-2">No players synced yet</h2>
        <p className="text-slate-400 mb-6">Player data needs to be loaded from the FPL API first.</p>
        <p className="text-slate-500 text-sm">
          Run: <code className="bg-slate-800 px-2 py-1 rounded text-slate-300">POST /api/sync/players</code>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Players</h1>
        <span className="text-slate-400 text-sm">{totalPlayers} total players</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["All", "GK", "DEF", "MID", "FWD"].map(p => {
          const active = (p === "All" && !pos) || p === pos
          return (
            <a key={p}
              href={`/league/${leagueId}/players${p !== "All" ? `?pos=${p}` : ""}`}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors
                ${active ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              {p}
            </a>
          )
        })}
      </div>

      {/* Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Player</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Club</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Pos</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Price</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Pts</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Form</th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {players.map(player => {
                  const ownerTeamId = ownedMap.get(player.id)
                  return (
                    <tr key={player.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-white font-medium">{player.webName}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{player.fplTeam.shortName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${POS_COLORS[player.position] ?? ""}`}>
                          {player.position}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">£{(player.nowCost / 10).toFixed(1)}m</td>
                      <td className="px-4 py-3 text-right text-white font-semibold">{player.totalPoints}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{player.form}</td>
                      <td className="px-4 py-3 text-center">
                        {ownerTeamId ? (
                          <Badge className="bg-slate-700 text-slate-400 text-xs">Owned</Badge>
                        ) : (
                          <Badge className="bg-emerald-600/20 text-emerald-400 text-xs">Free</Badge>
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
