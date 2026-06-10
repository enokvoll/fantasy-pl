"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import type { StandingRow, GameweekResult } from "@/lib/sim-runner"

interface SimState {
  completedGameweeks: number
  totalFinishedGameweeks: number
  teamsInLeague: number
  draftStatus: string
  standings: StandingRow[]
}

interface GwSyncStatus {
  gameweekId: number
  name: string
  statRows: number
}

export default function SimulatePage() {
  const params = useParams<{ leagueId: string }>()
  const leagueId = params.leagueId

  const [loading, setLoading] = useState<string | null>(null)
  const [lastGwResult, setLastGwResult] = useState<GameweekResult | null>(null)

  const { data, refetch: fetchState } = useQuery({
    queryKey: ["sim-state", leagueId],
    queryFn: async (): Promise<{ simState: SimState | null; gwSyncStatus: GwSyncStatus[] }> => {
      const [simRes, syncRes] = await Promise.all([
        fetch(`/api/simulate/${leagueId}`),
        fetch("/api/sync/all-historical"),
      ])
      const simState = simRes.ok ? await simRes.json() : null
      const syncData = syncRes.ok ? await syncRes.json() : {}
      return { simState, gwSyncStatus: syncData.gameweeks ?? [] }
    },
  })
  const simState = data?.simState ?? null
  const gwSyncStatus = data?.gwSyncStatus ?? []

  async function runDraft() {
    setLoading("draft")
    const res = await fetch(`/api/simulate/${leagueId}/draft`, { method: "POST" })
    const data = await res.json()
    if (data.ok) {
      toast.success(`Auto-draft complete — ${data.picks} picks made`)
    } else {
      toast.error(data.error ?? "Draft failed")
    }
    setLoading(null)
    fetchState()
  }

  async function runFullSeason() {
    setLoading("full")
    toast.info("Running full season simulation… this may take 30–60 seconds")
    const res = await fetch(`/api/simulate/${leagueId}`, { method: "POST" })
    const data = await res.json()
    if (data.ok) {
      toast.success(`Season complete — ${data.gameweeksProcessed} gameweeks processed. Winner: ${data.topTeamName}`)
    } else {
      toast.error(data.error ?? "Simulation failed")
    }
    setLoading(null)
    fetchState()
  }

  async function processNextGameweek() {
    if (!simState) return
    const nextGwId = simState.completedGameweeks + 1
    setLoading(`gw-${nextGwId}`)
    const res = await fetch(`/api/simulate/${leagueId}/gameweek/${nextGwId}`, { method: "POST" })
    const data = await res.json()
    if (data.ok) {
      toast.success(`GW ${nextGwId} processed`)
      setLastGwResult(data as GameweekResult)
    } else {
      toast.error(data.error ?? `GW ${nextGwId} failed`)
    }
    setLoading(null)
    fetchState()
  }

  const synced = gwSyncStatus.filter(g => g.statRows > 0).length
  const totalGws = gwSyncStatus.length
  const isDrafted = simState?.draftStatus === "COMPLETED"
  const canStep = isDrafted && simState && simState.completedGameweeks < simState.totalFinishedGameweeks && synced > simState.completedGameweeks
  const canRunFull = isDrafted && synced > 0

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-white">Season Simulator</h1>
        <p className="text-slate-400 text-sm mt-1">
          Replay the full 2025-26 PL season against your fantasy league to test scoring, standings, and waivers.
        </p>
      </div>

      {/* ── Step 1: Sync Stats ── */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <CardTitle className="text-white text-base">Load player stats from FPL</CardTitle>
            {synced === totalGws && totalGws > 0 && <Badge className="bg-emerald-600/20 text-emerald-400 border-0 ml-auto">Complete</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-slate-400 text-sm">
            Pull real 2025-26 season stats (goals, assists, clean sheets, bonus points) for all 38 gameweeks.
            <strong className="text-slate-300"> Run this command in your terminal:</strong>
          </p>
          <code className="block bg-slate-800 rounded-lg px-4 py-3 text-emerald-300 text-sm font-mono break-all">
            {`curl -X POST http://localhost:3000/api/sync/all-historical -H "Authorization: Bearer ${typeof window !== "undefined" ? "<your CRON_SECRET from .env>" : "..."}" `}
          </code>

          {totalGws > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{synced}/{totalGws} gameweeks synced</span>
                <span>{gwSyncStatus.reduce((s, g) => s + g.statRows, 0).toLocaleString()} stat rows</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${totalGws > 0 ? (synced / totalGws) * 100 : 0}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {gwSyncStatus.map(gw => (
                  <span key={gw.gameweekId}
                    className={`text-xs px-1.5 py-0.5 rounded font-mono ${gw.statRows > 0 ? "bg-emerald-600/20 text-emerald-400" : "bg-slate-800 text-slate-600"}`}
                    title={`${gw.statRows} rows`}>
                    {gw.gameweekId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: Auto-Draft ── */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <CardTitle className="text-white text-base">Run auto-draft</CardTitle>
            {isDrafted && <Badge className="bg-emerald-600/20 text-emerald-400 border-0 ml-auto">Complete</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-slate-400 text-sm">
            Automatically draft all teams using best-available-player logic (snake order). Also generates the 38-gameweek H2H schedule.
          </p>
          {simState && (
            <div className="flex gap-4 text-sm text-slate-400">
              <span>Teams: <span className="text-white">{simState.teamsInLeague}</span></span>
              <span>Draft: <span className={isDrafted ? "text-emerald-400" : "text-yellow-400"}>{simState.draftStatus}</span></span>
            </div>
          )}
          <button
            onClick={runDraft}
            disabled={loading !== null || isDrafted}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {loading === "draft" ? "Drafting…" : isDrafted ? "Draft completed ✓" : "Run auto-draft"}
          </button>
        </CardContent>
      </Card>

      {/* ── Step 3: Simulate ── */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
            <CardTitle className="text-white text-base">Simulate the season</CardTitle>
            {simState && simState.completedGameweeks > 0 && (
              <Badge className="bg-slate-700 text-slate-300 border-0 ml-auto">
                GW {simState.completedGameweeks}/{simState.totalFinishedGameweeks}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {simState && simState.completedGameweeks > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{simState.completedGameweeks} gameweeks complete</span>
                <span>{simState.totalFinishedGameweeks} total</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${simState.totalFinishedGameweeks > 0 ? (simState.completedGameweeks / simState.totalFinishedGameweeks) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={processNextGameweek}
              disabled={loading !== null || !canStep}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {loading?.startsWith("gw-") ? "Processing…" : `Process GW ${(simState?.completedGameweeks ?? 0) + 1} →`}
            </button>
            <button
              onClick={runFullSeason}
              disabled={loading !== null || !canRunFull}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {loading === "full" ? "Simulating… (~30s)" : "Simulate full season ⚡"}
            </button>
          </div>

          {/* Last GW result */}
          {lastGwResult && (
            <div className="mt-2 p-3 rounded-lg bg-slate-800 border border-slate-700">
              <p className="text-slate-300 text-xs font-medium mb-2">{lastGwResult.gameweekName} results</p>
              <div className="space-y-1">
                {lastGwResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`font-medium ${r.winner === "home" ? "text-emerald-400" : "text-slate-400"}`}>{r.homeTeamName}</span>
                    <span className="text-white font-mono">{r.homeScore.toFixed(1)}</span>
                    <span className="text-slate-600">vs</span>
                    <span className="text-white font-mono">{r.awayScore.toFixed(1)}</span>
                    <span className={`font-medium ${r.winner === "away" ? "text-emerald-400" : "text-slate-400"}`}>{r.awayTeamName ?? "BYE"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Live Standings ── */}
      {simState && simState.standings.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base">Current Standings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-2 text-slate-400 font-medium">#</th>
                  <th className="text-left px-4 py-2 text-slate-400 font-medium">Team</th>
                  <th className="text-center px-3 py-2 text-slate-400 font-medium">W</th>
                  <th className="text-center px-3 py-2 text-slate-400 font-medium">L</th>
                  <th className="text-center px-3 py-2 text-slate-400 font-medium">T</th>
                  <th className="text-right px-4 py-2 text-slate-400 font-medium">PF</th>
                  <th className="text-right px-4 py-2 text-slate-400 font-medium">PA</th>
                </tr>
              </thead>
              <tbody>
                {simState.standings.map((row) => (
                  <tr key={row.teamId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 text-slate-500">{row.rank}</td>
                    <td className="px-4 py-2.5 text-white font-medium">{row.teamName}</td>
                    <td className="px-3 py-2.5 text-center text-emerald-400 font-semibold">{row.wins}</td>
                    <td className="px-3 py-2.5 text-center text-red-400">{row.losses}</td>
                    <td className="px-3 py-2.5 text-center text-slate-400">{row.ties}</td>
                    <td className="px-4 py-2.5 text-right text-white font-mono">{row.pointsFor.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 font-mono">{row.pointsAgainst.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
