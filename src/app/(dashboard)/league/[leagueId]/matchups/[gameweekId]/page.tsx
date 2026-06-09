import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const POS_COLORS: Record<string, string> = {
  GK: "bg-yellow-600/20 text-yellow-400",
  DEF: "bg-blue-600/20 text-blue-400",
  MID: "bg-emerald-600/20 text-emerald-400",
  FWD: "bg-red-600/20 text-red-400",
}

async function getTeamRoster(teamId: string, gameweekId: number) {
  const slots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null } },
    include: { player: { include: { fplTeam: { select: { shortName: true } } } } },
  })

  const playerIds = slots.map(s => s.playerId!)
  const gwStats = await prisma.playerGameweekStat.findMany({
    where: { gameweekId, playerId: { in: playerIds } },
  })
  const statsMap = new Map(gwStats.map(s => [s.playerId, s]))

  const starters = slots.filter(s => s.isStarting && s.player).map(s => ({
    playerId: s.playerId!,
    name: s.player!.webName,
    club: s.player!.fplTeam.shortName,
    position: s.player!.position,
    gwPoints: statsMap.get(s.playerId!)?.totalPoints ?? 0,
    minutes: statsMap.get(s.playerId!)?.minutes ?? 0,
    goals: statsMap.get(s.playerId!)?.goalsScored ?? 0,
    assists: statsMap.get(s.playerId!)?.assists ?? 0,
    cleanSheets: statsMap.get(s.playerId!)?.cleanSheets ?? 0,
    bonus: statsMap.get(s.playerId!)?.bonus ?? 0,
    isStarting: true,
  }))

  const bench = slots.filter(s => !s.isStarting && s.player).map(s => ({
    playerId: s.playerId!,
    name: s.player!.webName,
    club: s.player!.fplTeam.shortName,
    position: s.player!.position,
    gwPoints: statsMap.get(s.playerId!)?.totalPoints ?? 0,
    minutes: statsMap.get(s.playerId!)?.minutes ?? 0,
    goals: statsMap.get(s.playerId!)?.goalsScored ?? 0,
    assists: statsMap.get(s.playerId!)?.assists ?? 0,
    cleanSheets: statsMap.get(s.playerId!)?.cleanSheets ?? 0,
    bonus: statsMap.get(s.playerId!)?.bonus ?? 0,
    isStarting: false,
  }))

  const total = starters.reduce((sum, p) => sum + p.gwPoints, 0)
  return { starters, bench, total }
}

interface RosterPlayer {
  playerId: number; name: string; club: string; position: string
  gwPoints: number; minutes: number; goals: number; assists: number
  cleanSheets: number; bonus: number; isStarting: boolean
}

function PlayerRow({ p, highlight }: { p: RosterPlayer; highlight: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
      highlight ? "bg-emerald-600/10" : "hover:bg-slate-800/40"
    )}>
      <span className={cn("text-[10px] px-1.5 rounded font-medium w-9 text-center shrink-0", POS_COLORS[p.position] ?? "bg-slate-700 text-slate-300")}>
        {p.position}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-slate-200 text-sm font-medium truncate block">{p.name}</span>
        <span className="text-slate-500 text-[10px]">{p.club} · {p.minutes}&apos;</span>
      </div>
      {p.goals > 0 && <span className="text-xs text-emerald-400" title="Goals">⚽×{p.goals}</span>}
      {p.assists > 0 && <span className="text-xs text-blue-400" title="Assists">🅰×{p.assists}</span>}
      {p.cleanSheets > 0 && <span className="text-xs text-slate-400" title="Clean sheet">🧤</span>}
      {p.bonus > 0 && <span className="text-xs text-yellow-400" title="Bonus">+{p.bonus}b</span>}
      <span className={cn("text-sm font-bold tabular-nums w-8 text-right shrink-0", p.gwPoints > 0 ? "text-white" : "text-slate-600")}>
        {p.gwPoints}
      </span>
    </div>
  )
}

export default async function MatchupDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string; gameweekId: string }>
}) {
  const { leagueId, gameweekId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const gwId = parseInt(gameweekId)
  if (isNaN(gwId)) notFound()

  const gw = await prisma.gameWeek.findUnique({ where: { id: gwId } })
  if (!gw) notFound()

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })

  // Find matchup involving this user's team (or just show all)
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, gameweekId: gwId },
    include: { homeTeam: true, awayTeam: true },
  })

  const myMatchup = myTeam
    ? matchups.find(m => m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id)
    : null

  const featured = myMatchup ?? matchups[0]
  if (!featured) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">No matchup found for {gw.name}</p>
        <Link href={`/league/${leagueId}/matchups`} className="text-emerald-400 text-sm hover:underline mt-2 block">
          ← Back to matchups
        </Link>
      </div>
    )
  }

  const [homeRoster, awayRoster] = await Promise.all([
    getTeamRoster(featured.homeTeamId, gwId),
    featured.awayTeamId ? getTeamRoster(featured.awayTeamId, gwId) : Promise.resolve({ starters: [], bench: [], total: 0 }),
  ])

  const homeWon = featured.homeScore > featured.awayScore
  const awayWon = featured.awayScore > featured.homeScore

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link href={`/league/${leagueId}/matchups`} className="text-slate-500 text-sm hover:text-slate-300 transition-colors">
        ← {gw.name}
      </Link>

      {/* Score header */}
      <div className="flex items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className={cn("flex-1 text-center", homeWon ? "opacity-100" : "opacity-60")}>
          <p className="text-white font-bold text-lg">{featured.homeTeam.name}</p>
          {featured.homeTeam.id === myTeam?.id && <Badge className="bg-emerald-600/20 text-emerald-400 border-0 text-xs mt-1">You</Badge>}
        </div>
        <div className="text-center shrink-0">
          {featured.isCompleted ? (
            <div className="flex items-center gap-3">
              <span className={cn("text-4xl font-black font-mono", homeWon ? "text-white" : "text-slate-500")}>
                {featured.homeScore.toFixed(1)}
              </span>
              <span className="text-slate-600 text-sm">vs</span>
              <span className={cn("text-4xl font-black font-mono", awayWon ? "text-white" : "text-slate-500")}>
                {featured.awayTeam ? featured.awayScore.toFixed(1) : "BYE"}
              </span>
            </div>
          ) : (
            <span className="text-slate-500 text-xl">vs</span>
          )}
          <p className="text-slate-500 text-xs mt-1">{gw.name}</p>
        </div>
        <div className={cn("flex-1 text-center", awayWon ? "opacity-100" : "opacity-60")}>
          <p className="text-white font-bold text-lg">{featured.awayTeam?.name ?? "BYE"}</p>
          {featured.awayTeam?.id === myTeam?.id && <Badge className="bg-emerald-600/20 text-emerald-400 border-0 text-xs mt-1">You</Badge>}
        </div>
      </div>

      {/* Player tables side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Home team */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <span className="text-white font-semibold text-sm">{featured.homeTeam.name}</span>
            <span className="text-white font-black text-lg">{homeRoster.total.toFixed(1)}</span>
          </div>
          <div className="p-2 space-y-0.5">
            {homeRoster.starters.map(p => (
              <PlayerRow key={p.playerId} p={p} highlight={false} />
            ))}
            <div className="border-t border-slate-800 border-dashed my-1" />
            {homeRoster.bench.map(p => (
              <div key={p.playerId} className="opacity-50">
                <PlayerRow p={p} highlight={false} />
              </div>
            ))}
          </div>
        </div>

        {/* Away team */}
        {featured.awayTeam && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
              <span className="text-white font-semibold text-sm">{featured.awayTeam.name}</span>
              <span className="text-white font-black text-lg">{awayRoster.total.toFixed(1)}</span>
            </div>
            <div className="p-2 space-y-0.5">
              {awayRoster.starters.map(p => (
                <PlayerRow key={p.playerId} p={p} highlight={false} />
              ))}
              <div className="border-t border-slate-800 border-dashed my-1" />
              {awayRoster.bench.map(p => (
                <div key={p.playerId} className="opacity-50">
                  <PlayerRow p={p} highlight={false} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Other matchups this GW */}
      {matchups.length > 1 && (
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">Other matchups this week</p>
          <div className="space-y-1">
            {matchups
              .filter(m => m.id !== featured.id)
              .map(m => (
                <Link key={m.id} href={`/league/${leagueId}/matchups/${gwId}?match=${m.id}`}>
                  <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-800 border border-slate-800 text-sm transition-colors">
                    <span className="text-slate-300">{m.homeTeam.name}</span>
                    <span className="text-slate-500 font-mono text-xs">
                      {m.isCompleted ? `${m.homeScore.toFixed(1)} – ${m.awayScore.toFixed(1)}` : "vs"}
                    </span>
                    <span className="text-slate-300">{m.awayTeam?.name ?? "BYE"}</span>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
