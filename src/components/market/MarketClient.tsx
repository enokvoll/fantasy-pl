"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  DEF: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  MID: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  FWD: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
}

interface RosterPlayer { playerId: number; name: string; position: string; club: string }

interface FreeAgent {
  id: number
  webName: string
  position: string
  totalPoints: number
  form: string | null
  fplTeam: { shortName: string }
}

interface AuctionBid { teamId: string; teamName: string; amount: number; createdAt: string }
interface Auction {
  id: string
  player: { id: number; name: string; position: string; club: string }
  currentBid: number
  currentBidTeamId: string | null
  currentBidTeamName: string | null
  minIncrement: number
  endsAt: string
  startedByTeamId: string
  bids: AuctionBid[]
}
interface MarketContext {
  settings: { windowHours: number; antiSnipeMinutes: number; minIncrement: number }
  myTeam: { id: string; faabBalance: number; committed: number; available: number }
  auctions: Auction[]
}

interface MarketClientProps {
  leagueId: string
  myTeamId: string
  roster: RosterPlayer[]
}

function timeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return "ending…"
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
}

export function MarketClient({ leagueId, myTeamId, roster }: MarketClientProps) {
  const router = useRouter()
  const [tab, setTab] = useState<"auctions" | "start" | "trades">("auctions")
  const [search, setSearch] = useState("")
  const [posFilter, setPosFilter] = useState("ALL")
  const [busy, setBusy] = useState(false)

  // Start-auction modal state.
  const [startTarget, setStartTarget] = useState<FreeAgent | null>(null)
  const [openingBid, setOpeningBid] = useState("")
  const [startDropId, setStartDropId] = useState<number | null>(null)

  // Bid modal state.
  const [bidTarget, setBidTarget] = useState<Auction | null>(null)
  const [bidAmount, setBidAmount] = useState("")
  const [bidDropId, setBidDropId] = useState<number | null>(null)

  const { data: ctx, refetch: refetchCtx } = useQuery({
    queryKey: ["market-ctx", leagueId],
    queryFn: async (): Promise<MarketContext | null> => {
      const res = await fetch(`/api/market/${leagueId}`)
      return res.ok ? await res.json() : null
    },
    refetchInterval: 7000,
  })

  const { data: players = [], refetch: refetchPlayers } = useQuery({
    queryKey: ["market-players", leagueId, posFilter],
    queryFn: async (): Promise<FreeAgent[]> => {
      const posParam = posFilter !== "ALL" ? `&position=${posFilter}` : ""
      const res = await fetch(`/api/players?leagueId=${leagueId}&available=true&sortBy=totalPoints&limit=100${posParam}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.players ?? []
    },
  })

  // Players already up for auction shouldn't appear in the start list.
  const auctioningIds = new Set((ctx?.auctions ?? []).map((a) => a.player.id))
  const filtered = players.filter(
    (p) =>
      !auctioningIds.has(p.id) &&
      (search === "" ||
        p.webName.toLowerCase().includes(search.toLowerCase()) ||
        p.fplTeam.shortName.toLowerCase().includes(search.toLowerCase()))
  )

  function openStart(p: FreeAgent) {
    setStartTarget(p)
    setOpeningBid("1")
    setStartDropId(null)
  }

  async function submitStart() {
    if (!startTarget) return
    setBusy(true)
    const res = await fetch(`/api/market/${leagueId}/auction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: startTarget.id,
        openingBid: parseInt(openingBid || "0"),
        dropPlayerId: startDropId,
      }),
    })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      toast.success(`Auction started for ${startTarget.webName}`)
      setStartTarget(null)
      refetchCtx()
      setTab("auctions")
    } else {
      toast.error(data.error ?? "Could not start auction")
    }
  }

  function openBid(a: Auction) {
    setBidTarget(a)
    setBidAmount(String(a.currentBid + a.minIncrement))
    setBidDropId(null)
  }

  async function submitBid() {
    if (!bidTarget) return
    setBusy(true)
    const res = await fetch(`/api/market/${leagueId}/auction/${bidTarget.id}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parseInt(bidAmount || "0"), dropPlayerId: bidDropId }),
    })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      toast.success(`Bid placed: £${data.currentBid}`)
      setBidTarget(null)
      refetchCtx()
    } else {
      toast.error(data.error ?? "Bid rejected")
    }
  }

  async function settleDue() {
    setBusy(true)
    const res = await fetch(`/api/market/${leagueId}/settle`, { method: "POST" })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      toast.success(`Settled ${data.settled} · cancelled ${data.cancelled}`)
      refetchCtx()
      refetchPlayers()
      router.refresh()
    } else {
      toast.error(data.error ?? "Settle failed")
    }
  }

  const auctions = ctx?.auctions ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transfer Market</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge className="bg-primary/20 text-primary border-0">
              £{ctx?.myTeam.available ?? 0} available
            </Badge>
            {ctx && ctx.myTeam.committed > 0 && (
              <Badge className="bg-muted text-foreground border-0">£{ctx.myTeam.committed} committed</Badge>
            )}
            <Badge className="bg-muted text-muted-foreground border-0">£{ctx?.myTeam.faabBalance ?? 0} balance</Badge>
          </div>
        </div>
        <button
          onClick={settleDue}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-muted hover:bg-muted disabled:opacity-50 text-foreground text-sm font-semibold transition-colors">
          ⚙ Settle ended auctions
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          ["auctions", `Live Auctions${auctions.length ? ` (${auctions.length})` : ""}`],
          ["start", "Start Auction"],
          ["trades", "Trades"],
        ].map(([id, label]) => (
          <button key={id}
            onClick={() => setTab(id as typeof tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id ? "border-primary/40 text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* ── LIVE AUCTIONS ── */}
      {tab === "auctions" && (
        <div className="space-y-2">
          {auctions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No live auctions. Start one from the <button onClick={() => setTab("start")} className="text-primary hover:underline">Start Auction</button> tab.
            </div>
          )}
          {auctions.map((a) => {
            const winning = a.currentBidTeamId === myTeamId
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[a.player.position])}>{a.player.position}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground text-sm font-medium">{a.player.name}</span>
                  <span className="text-muted-foreground text-xs ml-2">{a.player.club}</span>
                  <p className="text-xs mt-0.5">
                    <span className={winning ? "text-primary" : "text-muted-foreground"}>
                      £{a.currentBid} · {a.currentBidTeamName ?? "no bids"}
                    </span>
                    {winning && <span className="text-primary ml-1">(you lead)</span>}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums shrink-0">⏱ {timeLeft(a.endsAt)}</span>
                <button onClick={() => openBid(a)}
                  className="px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors shrink-0">
                  Bid £{a.currentBid + a.minIncrement}+
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── START AUCTION ── */}
      {tab === "start" && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex gap-1">
              {["ALL", "GK", "DEF", "MID", "FWD"].map((pos) => (
                <button key={pos} onClick={() => setPosFilter(pos)}
                  className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    posFilter === pos ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted")}>
                  {pos}
                </button>
              ))}
            </div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search free agents…"
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-sm h-8 flex-1 min-w-[160px]" />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Player</th>
                  <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Club</th>
                  <th className="text-center px-3 py-2.5 text-muted-foreground font-medium">Pos</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Pts</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 60).map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-foreground font-medium">{p.webName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.fplTeam.shortName}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[p.position])}>{p.position}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-foreground font-semibold tabular-nums">{p.totalPoints}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openStart(p)}
                        className="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors">
                        Auction
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No available players found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRADES (placeholder until 3B) ── */}
      {tab === "trades" && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Team-to-team trades, counter-offers and package deals live on the{" "}
          <a href={`/league/${leagueId}/trades`} className="text-primary hover:underline">Trades</a> page.
        </div>
      )}

      {/* ── START-AUCTION MODAL ── */}
      {startTarget && (
        <Modal onClose={() => setStartTarget(null)}>
          <div className="flex items-center gap-2 mb-4">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[startTarget.position])}>{startTarget.position}</span>
            <h3 className="text-foreground font-bold text-lg">{startTarget.webName}</h3>
            <span className="text-muted-foreground text-sm">{startTarget.fplTeam.shortName} · {startTarget.totalPoints}pts</span>
          </div>
          <Labeled label="Opening bid (£)">
            <Input type="number" min={1} max={ctx?.myTeam.available ?? undefined}
              value={openingBid} onChange={(e) => setOpeningBid(e.target.value)}
              className="bg-muted border-border text-foreground" />
            <p className="text-muted-foreground text-xs mt-1">Available: £{ctx?.myTeam.available ?? 0}</p>
          </Labeled>
          <DropSelect roster={roster} value={startDropId} onChange={setStartDropId} />
          <ModalActions busy={busy} onCancel={() => setStartTarget(null)} onConfirm={submitStart} confirmLabel="Start auction" />
        </Modal>
      )}

      {/* ── BID MODAL ── */}
      {bidTarget && (
        <Modal onClose={() => setBidTarget(null)}>
          <div className="flex items-center gap-2 mb-4">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[bidTarget.player.position])}>{bidTarget.player.position}</span>
            <h3 className="text-foreground font-bold text-lg">{bidTarget.player.name}</h3>
            <span className="text-muted-foreground text-sm">current £{bidTarget.currentBid}</span>
          </div>
          <Labeled label="Your bid (£)">
            <Input type="number" min={bidTarget.currentBid + bidTarget.minIncrement} max={ctx?.myTeam.available ?? undefined}
              value={bidAmount} onChange={(e) => setBidAmount(e.target.value)}
              className="bg-muted border-border text-foreground" />
            <p className="text-muted-foreground text-xs mt-1">
              Min £{bidTarget.currentBid + bidTarget.minIncrement} · Available £{ctx?.myTeam.available ?? 0}
            </p>
          </Labeled>
          <DropSelect roster={roster} value={bidDropId} onChange={setBidDropId} />
          <ModalActions busy={busy} onCancel={() => setBidTarget(null)} onConfirm={submitBid} confirmLabel="Place bid" />
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-foreground text-sm block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function DropSelect({ roster, value, onChange }: {
  roster: RosterPlayer[]; value: number | null; onChange: (v: number | null) => void
}) {
  return (
    <Labeled label="Drop a player (only used if you win and your roster is full)">
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm">
        <option value="">— Don&apos;t drop anyone —</option>
        {roster.map((r) => (
          <option key={r.playerId} value={r.playerId}>{r.position} · {r.name} ({r.club})</option>
        ))}
      </select>
    </Labeled>
  )
}

function ModalActions({ busy, onCancel, onConfirm, confirmLabel }: {
  busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel: string
}) {
  return (
    <div className="flex gap-2 justify-end">
      <button onClick={onCancel}
        className="px-4 py-2 rounded-lg bg-muted hover:bg-muted text-foreground text-sm transition-colors">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={busy}
        className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
        {busy ? "Working…" : confirmLabel}
      </button>
    </div>
  )
}
