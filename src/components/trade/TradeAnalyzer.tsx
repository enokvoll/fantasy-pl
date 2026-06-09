"use client"

import { cn } from "@/lib/utils"

export interface AnalyzerAsset {
  fromTeamId: string
  toTeamId: string
  points: number // 0 for draft picks
}

interface TradeAnalyzerProps {
  teams: { id: string; name: string }[]
  assets: AnalyzerAsset[]
  compact?: boolean
}

export function TradeAnalyzer({ teams, assets, compact = false }: TradeAnalyzerProps) {
  // Net points per team: incoming - outgoing
  const net = new Map<string, number>()
  for (const t of teams) net.set(t.id, 0)
  for (const a of assets) {
    net.set(a.toTeamId, (net.get(a.toTeamId) ?? 0) + a.points)
    net.set(a.fromTeamId, (net.get(a.fromTeamId) ?? 0) - a.points)
  }

  const ranked = [...teams].sort((a, b) => (net.get(b.id) ?? 0) - (net.get(a.id) ?? 0))
  const top = ranked[0]
  const topNet = net.get(top?.id ?? "") ?? 0

  return (
    <div className={cn("rounded-lg bg-slate-800/50 border border-slate-700", compact ? "p-2" : "p-3")}>
      {!compact && <p className="text-slate-400 text-xs font-medium mb-2">Trade Analyzer (by season points)</p>}
      <div className="space-y-1">
        {ranked.map(t => {
          const n = net.get(t.id) ?? 0
          return (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-300 truncate">{t.name}</span>
              <span className={cn("font-mono font-semibold tabular-nums",
                n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-slate-500")}>
                {n > 0 ? "+" : ""}{n} pts
              </span>
            </div>
          )
        })}
      </div>
      {topNet !== 0 && (
        <p className="text-slate-500 text-[11px] mt-2">
          Favours <span className="text-emerald-400 font-medium">{top.name}</span> on season points
        </p>
      )}
    </div>
  )
}
