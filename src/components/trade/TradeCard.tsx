"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TradeAnalyzer } from "./TradeAnalyzer"

const POS_COLORS: Record<string, string> = {
  GK: "bg-yellow-600/20 text-yellow-400",
  DEF: "bg-blue-600/20 text-blue-400",
  MID: "bg-emerald-600/20 text-emerald-400",
  FWD: "bg-red-600/20 text-red-400",
}

export interface TradeParticipant {
  teamId: string
  role: "PROPOSER" | "RECIPIENT"
  status: "PENDING" | "ACCEPTED" | "REJECTED"
  team: { id: string; name: string }
}

export interface TradeAssetView {
  fromTeamId: string
  toTeamId: string
  playerId: number | null
  player: { webName: string; position: string; totalPoints: number; fplTeam: { shortName: string } } | null
  draftPickSlot: { season: string; round: number } | null
}

export interface TradeView {
  id: string
  status: string
  notes: string | null
  isMultiTeam: boolean
  adminOverride: boolean
  createdAt: string
  participants: TradeParticipant[]
  assets: TradeAssetView[]
}

interface TradeCardProps {
  trade: TradeView
  myTeamId: string
  isCommissioner: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
  onCancel: () => void
  onForce: () => void
  onCommishCancel: () => void
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-600/20 text-yellow-400",
  ACCEPTED: "bg-blue-600/20 text-blue-400",
  PROCESSING: "bg-blue-600/20 text-blue-400",
  COMPLETED: "bg-emerald-600/20 text-emerald-400",
  REJECTED: "bg-red-600/20 text-red-400",
  CANCELLED: "bg-slate-700 text-slate-400",
  VETOED: "bg-red-600/20 text-red-400",
}

export function TradeCard({ trade, myTeamId, isCommissioner, busy, onAccept, onReject, onCancel, onForce, onCommishCancel }: TradeCardProps) {
  const teamName = (id: string) => trade.participants.find(p => p.teamId === id)?.team.name ?? "?"
  const teams = trade.participants.map(p => ({ id: p.teamId, name: p.team.name }))

  const myParticipant = trade.participants.find(p => p.teamId === myTeamId)
  const proposer = trade.participants.find(p => p.role === "PROPOSER")
  const isProposer = proposer?.teamId === myTeamId
  const canRespond = trade.status === "PENDING" && myParticipant?.role === "RECIPIENT" && myParticipant.status === "PENDING"
  const canCancel = trade.status === "PENDING" && isProposer

  // Group assets by receiving team
  const byReceiver = new Map<string, TradeAssetView[]>()
  for (const a of trade.assets) {
    const list = byReceiver.get(a.toTeamId) ?? []
    list.push(a)
    byReceiver.set(a.toTeamId, list)
  }

  const analyzerAssets = trade.assets.map(a => ({
    fromTeamId: a.fromTeamId,
    toTeamId: a.toTeamId,
    points: a.player?.totalPoints ?? 0,
  }))

  function assetLabel(a: TradeAssetView) {
    if (a.player) return a.player
    if (a.draftPickSlot) return null
    return null
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={cn("border-0 text-xs", STATUS_COLORS[trade.status] ?? "bg-slate-700 text-slate-400")}>
          {trade.status}
        </Badge>
        {trade.isMultiTeam && <Badge className="bg-slate-800 text-slate-300 border-0 text-xs">{trade.participants.length}-team</Badge>}
        {trade.adminOverride && <Badge className="bg-purple-600/20 text-purple-400 border-0 text-xs">Admin override</Badge>}
        <span className="text-slate-500 text-xs ml-auto">
          {isProposer ? "You proposed" : `From ${proposer ? teamName(proposer.teamId) : "?"}`}
        </span>
      </div>

      {/* Asset flow per receiving team */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(byReceiver.size, 3)}, minmax(0, 1fr))` }}>
        {[...byReceiver.entries()].map(([toTeamId, assets]) => (
          <div key={toTeamId} className="rounded-lg bg-slate-800/40 border border-slate-800 p-2.5">
            <p className={cn("text-xs font-semibold mb-1.5", toTeamId === myTeamId ? "text-emerald-400" : "text-slate-300")}>
              {teamName(toTeamId)} gets
            </p>
            <div className="space-y-1">
              {assets.map((a, i) => {
                const p = assetLabel(a)
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    {p ? (
                      <>
                        <span className={cn("text-[10px] px-1 rounded font-medium", POS_COLORS[p.position])}>{p.position}</span>
                        <span className="text-slate-200 truncate flex-1">{p.webName}</span>
                        <span className="text-slate-500">{p.fplTeam.shortName}</span>
                        <span className="text-slate-400 tabular-nums">{p.totalPoints}</span>
                      </>
                    ) : a.draftPickSlot ? (
                      <>
                        <span className="text-[10px] px-1 rounded font-medium bg-purple-600/20 text-purple-400">PICK</span>
                        <span className="text-slate-200 truncate flex-1">{a.draftPickSlot.season} Round {a.draftPickSlot.round}</span>
                      </>
                    ) : null}
                    <span className="text-slate-600 text-[10px]">← {teamName(a.fromTeamId)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {trade.notes && <p className="text-slate-400 text-xs italic">&ldquo;{trade.notes}&rdquo;</p>}

      {/* Multi-team acceptance status */}
      {(trade.isMultiTeam || trade.status === "PENDING") && (
        <div className="flex flex-wrap gap-1.5">
          {trade.participants.map(p => (
            <span key={p.teamId} className={cn("text-[10px] px-1.5 py-0.5 rounded",
              p.status === "ACCEPTED" ? "bg-emerald-600/20 text-emerald-400" :
              p.status === "REJECTED" ? "bg-red-600/20 text-red-400" :
              "bg-slate-800 text-slate-500")}>
              {p.team.name} {p.status === "ACCEPTED" ? "✓" : p.status === "REJECTED" ? "✗" : "…"}
            </span>
          ))}
        </div>
      )}

      {/* Analyzer */}
      {trade.status === "PENDING" && <TradeAnalyzer teams={teams} assets={analyzerAssets} compact />}

      {/* Actions */}
      {(canRespond || canCancel || (isCommissioner && trade.status === "PENDING")) && (
        <div className="flex gap-2 flex-wrap pt-1">
          {canRespond && (
            <>
              <button onClick={onAccept} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                Accept
              </button>
              <button onClick={onReject} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-red-400 text-xs font-semibold transition-colors">
                Reject
              </button>
            </>
          )}
          {canCancel && (
            <button onClick={onCancel} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-semibold transition-colors">
              Cancel proposal
            </button>
          )}
          {isCommissioner && trade.status === "PENDING" && (
            <div className="flex gap-2 ml-auto">
              <button onClick={onForce} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 disabled:opacity-50 text-purple-300 text-xs font-semibold transition-colors">
                Force ✓
              </button>
              <button onClick={onCommishCancel} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-400 text-xs font-semibold transition-colors">
                Force ✗
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
