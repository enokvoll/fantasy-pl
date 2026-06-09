import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { cn } from "@/lib/utils"

export default async function StandingsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) notFound()

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
  })

  const completedGWs = await prisma.matchup.groupBy({
    by: ["gameweekId"],
    where: { leagueId, isCompleted: true },
    _count: true,
  })

  const gamesPlayed = completedGWs.length

  if (teams.every(t => t.wins === 0 && t.losses === 0 && t.ties === 0)) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">📊</p>
        <h2 className="text-xl font-bold text-white mb-2">No results yet</h2>
        <p className="text-slate-400">Run the simulation or wait for gameweeks to complete.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Standings</h1>
        {gamesPlayed > 0 && (
          <span className="text-slate-400 text-sm">{gamesPlayed} gameweek{gamesPlayed !== 1 ? "s" : ""} played</span>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-slate-400 font-medium w-8">#</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Team</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium">W</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium">L</th>
              <th className="text-center px-3 py-3 text-slate-400 font-medium">T</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">PF</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium">PA</th>
              <th className="text-right px-4 py-3 text-slate-400 font-medium hidden md:table-cell">+/−</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, i) => {
              const isMe = team.id === myTeam?.id
              const diff = team.pointsFor - team.pointsAgainst
              return (
                <tr key={team.id} className={cn(
                  "border-b border-slate-800/50 last:border-0 transition-colors",
                  isMe ? "bg-emerald-600/5" : "hover:bg-slate-800/30"
                )}>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                      i === 1 ? "bg-slate-400/20 text-slate-300" :
                      i === 2 ? "bg-orange-600/20 text-orange-400" :
                      "text-slate-500"
                    )}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", isMe ? "text-emerald-400" : "text-white")}>
                        {team.isBot && <span className="mr-1 text-xs">🤖</span>}
                        {team.name}
                      </span>
                      {isMe && <span className="text-[10px] text-emerald-400/70">you</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-emerald-400 font-semibold">{team.wins}</td>
                  <td className="px-3 py-3 text-center text-red-400">{team.losses}</td>
                  <td className="px-3 py-3 text-center text-slate-400">{team.ties}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">{team.pointsFor.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-slate-400 font-mono">{team.pointsAgainst.toFixed(1)}</td>
                  <td className={cn(
                    "px-4 py-3 text-right font-mono hidden md:table-cell",
                    diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-slate-500"
                  )}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
