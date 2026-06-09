"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { TradeCard, type TradeView } from "./TradeCard"
import { TradeBuilder } from "./TradeBuilder"

const POS_COLORS: Record<string, string> = {
  GK: "bg-yellow-600/20 text-yellow-400",
  DEF: "bg-blue-600/20 text-blue-400",
  MID: "bg-emerald-600/20 text-emerald-400",
  FWD: "bg-red-600/20 text-red-400",
}

interface TeamLite { id: string; name: string; isBot: boolean; userId: string }
interface BlockPlayer { teamId: string; teamName: string; playerId: number; name: string; position: string; club: string; totalPoints: number }
interface RosterPlayer { playerId: number; isOnTradeBlock: boolean; name: string; position: string; club: string; totalPoints: number }

interface Ctx {
  myTeamId: string
  isCommissioner: boolean
  teams: TeamLite[]
  trades: TradeView[]
  tradeBlock: BlockPlayer[]
  myRoster: RosterPlayer[]
}

export function TradeCenter({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [tab, setTab] = useState<"active" | "block" | "history">("active")
  const [builderOpen, setBuilderOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchCtx = useCallback(async () => {
    const res = await fetch(`/api/trades/${leagueId}`)
    if (res.ok) setCtx(await res.json())
  }, [leagueId])

  useEffect(() => { fetchCtx() }, [fetchCtx])

  async function act(url: string, method: string, body?: object, successMsg?: string) {
    setBusy(true)
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success(successMsg ?? "Done")
      fetchCtx()
      router.refresh()
    } else {
      toast.error(data.error ?? "Action failed")
    }
  }

  async function toggleBlock(playerId: number, on: boolean) {
    await act(`/api/trades/${leagueId}/block`, "POST", { playerId, on }, on ? "Added to trade block" : "Removed from trade block")
  }

  if (!ctx) return <div className="text-slate-500 text-sm py-12 text-center">Loading…</div>

  const ACTIVE = ["PENDING", "ACCEPTED", "PROCESSING"]
  const active = ctx.trades.filter(t => ACTIVE.includes(t.status))
  const history = ctx.trades.filter(t => !ACTIVE.includes(t.status))
  const incoming = active.filter(t => {
    const me = t.participants.find(p => p.teamId === ctx.myTeamId)
    return me?.role === "RECIPIENT" && me.status === "PENDING"
  })
  const others = active.filter(t => !incoming.includes(t))

  const tradeCardProps = (t: TradeView) => ({
    trade: t,
    myTeamId: ctx.myTeamId,
    isCommissioner: ctx.isCommissioner,
    busy,
    onAccept: () => act(`/api/trades/${leagueId}/${t.id}`, "POST", { action: "accept" }, "Trade accepted"),
    onReject: () => act(`/api/trades/${leagueId}/${t.id}`, "POST", { action: "reject" }, "Trade rejected"),
    onCancel: () => act(`/api/trades/${leagueId}/${t.id}`, "POST", { action: "cancel" }, "Trade cancelled"),
    onForce: () => act(`/api/trades/${leagueId}/${t.id}/force`, "POST", undefined, "Trade forced through"),
    onCommishCancel: () => act(`/api/trades/${leagueId}/${t.id}`, "DELETE", undefined, "Trade cancelled"),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Trades</h1>
        <button onClick={() => setBuilderOpen(true)}
          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors">
          + New Trade
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {[
          ["active", `Active${active.length ? ` (${active.length})` : ""}`],
          ["block", `Trade Block${ctx.tradeBlock.length ? ` (${ctx.tradeBlock.length})` : ""}`],
          ["history", "History"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200")}>
            {label}
          </button>
        ))}
      </div>

      {/* ACTIVE */}
      {tab === "active" && (
        <div className="space-y-4">
          {incoming.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Awaiting your response</p>
              <div className="space-y-3">{incoming.map(t => <TradeCard key={t.id} {...tradeCardProps(t)} />)}</div>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">In progress</p>
              <div className="space-y-3">{others.map(t => <TradeCard key={t.id} {...tradeCardProps(t)} />)}</div>
            </div>
          )}
          {active.length === 0 && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🔀</p>
              <p className="text-slate-400 text-sm">No active trades. Click <span className="text-emerald-400">+ New Trade</span> to propose one.</p>
            </div>
          )}
        </div>
      )}

      {/* TRADE BLOCK */}
      {tab === "block" && (
        <div className="space-y-6">
          {/* My roster toggles */}
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Your players — toggle onto the block</p>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {ctx.myRoster.map(p => (
                <button key={p.playerId} onClick={() => toggleBlock(p.playerId, !p.isOnTradeBlock)}
                  className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors",
                    p.isOnTradeBlock ? "bg-emerald-600/15 ring-1 ring-emerald-600/30" : "hover:bg-slate-800")}>
                  <span className={cn("text-[10px] px-1 rounded font-medium", POS_COLORS[p.position])}>{p.position}</span>
                  <span className="text-slate-200 truncate flex-1">{p.name}</span>
                  <span className="text-slate-500">{p.club}</span>
                  <span className="text-slate-400 tabular-nums">{p.totalPoints}</span>
                  <span className={cn("text-[10px]", p.isOnTradeBlock ? "text-emerald-400" : "text-slate-600")}>
                    {p.isOnTradeBlock ? "● listed" : "○ list"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* League-wide block */}
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">Available around the league</p>
            {ctx.tradeBlock.filter(b => b.teamId !== ctx.myTeamId).length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No other managers have listed players yet.</p>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800/50">
                {ctx.tradeBlock.filter(b => b.teamId !== ctx.myTeamId).map(b => (
                  <div key={`${b.teamId}-${b.playerId}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className={cn("text-[10px] px-1 rounded font-medium", POS_COLORS[b.position])}>{b.position}</span>
                    <span className="text-slate-200 font-medium">{b.name}</span>
                    <span className="text-slate-500">{b.club}</span>
                    <span className="text-slate-400 tabular-nums">{b.totalPoints}pts</span>
                    <span className="text-slate-500 ml-auto">{b.teamName}</span>
                    <button onClick={() => setBuilderOpen(true)}
                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors">
                      Propose
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm py-12 text-center">No completed or rejected trades yet.</p>
          ) : history.map(t => <TradeCard key={t.id} {...tradeCardProps(t)} />)}
        </div>
      )}

      {builderOpen && (
        <TradeBuilder
          leagueId={leagueId}
          myTeamId={ctx.myTeamId}
          teams={ctx.teams}
          onClose={() => setBuilderOpen(false)}
          onSubmitted={() => { setBuilderOpen(false); fetchCtx() }}
        />
      )}
    </div>
  )
}
