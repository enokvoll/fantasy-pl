import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export default async function MatchupsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) notFound()

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
    include: {
      homeTeam: true,
      awayTeam: true,
      gameweek: true,
    },
    orderBy: { gameweekId: "desc" },
  })

  // Group by gameweek
  const byGW = new Map<number, typeof matchups>()
  for (const m of matchups) {
    const list = byGW.get(m.gameweekId) ?? []
    list.push(m)
    byGW.set(m.gameweekId, list)
  }

  const gwIds = [...byGW.keys()].sort((a, b) => b - a)

  if (matchups.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">📅</p>
        <h2 className="text-xl font-bold text-white mb-2">No matchups yet</h2>
        <p className="text-slate-400">Complete the draft and run the simulation to generate matchups.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-white">Matchups</h1>

      {gwIds.map(gwId => {
        const gws = byGW.get(gwId)!
        const gw = gws[0].gameweek

        return (
          <div key={gwId}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-slate-300 text-sm font-semibold">{gw.name}</h2>
              {gw.finished && <Badge className="bg-slate-800 text-slate-400 border-0 text-xs">Final</Badge>}
              {!gw.finished && gw.isCurrent && <Badge className="bg-emerald-600/20 text-emerald-400 border-0 text-xs">Live</Badge>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gws.map(m => {
                const isMyGame = myTeam && (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id)
                const homeWon = m.homeScore > m.awayScore
                const awayWon = m.awayScore > m.homeScore

                return (
                  <Link key={m.id} href={`/league/${leagueId}/matchups/${gwId}`}>
                    <div className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-xl border transition-colors cursor-pointer",
                      isMyGame
                        ? "bg-emerald-600/10 border-emerald-600/30 hover:border-emerald-500/50"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700"
                    )}>
                      {/* Home team */}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-semibold truncate",
                          homeWon ? "text-white" : "text-slate-400"
                        )}>
                          {m.homeTeam.name}
                          {m.homeTeam.id === myTeam?.id && <span className="ml-1 text-emerald-400 text-xs">you</span>}
                        </p>
                      </div>

                      {/* Score */}
                      <div className="px-4 text-center shrink-0">
                        {m.isCompleted ? (
                          <div className="flex items-center gap-2 font-mono">
                            <span className={cn("text-lg font-black", homeWon ? "text-white" : "text-slate-500")}>
                              {m.homeScore.toFixed(1)}
                            </span>
                            <span className="text-slate-600 text-xs">vs</span>
                            <span className={cn("text-lg font-black", awayWon ? "text-white" : "text-slate-500")}>
                              {m.awayTeam ? m.awayScore.toFixed(1) : "BYE"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-sm">vs</span>
                        )}
                      </div>

                      {/* Away team */}
                      <div className="flex-1 min-w-0 text-right">
                        <p className={cn(
                          "text-sm font-semibold truncate",
                          awayWon ? "text-white" : "text-slate-400"
                        )}>
                          {m.awayTeam?.id === myTeam?.id && <span className="mr-1 text-emerald-400 text-xs">you</span>}
                          {m.awayTeam?.name ?? "BYE"}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
