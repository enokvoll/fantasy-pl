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
  nowCost: number
  totalPoints: number
  form: string | null
  fplTeam: { shortName: string }
}

interface Claim {
  id: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  faabBid: number | null
  failReason: string | null
  createdAt: string
  targetPlayer: { webName: string; position: string; fplTeam: { shortName: string } }
  dropPlayer: { webName: string } | null
}

interface WaiverContext {
  myTeam: { faabBalance: number | null; waiverPriority: number | null }
  claims: Claim[]
  waiverOrder: { id: string; name: string; waiverPriority: number | null; faabBalance: number | null; isBot: boolean }[]
}

interface WaiverManagerProps {
  leagueId: string
  waiverType: "FAAB" | "ROLLING" | "REVERSE_STANDINGS" | "CONTINUOUS" | "FREE_AGENT" | "MARKETPLACE"
  faabBudget: number | null
  myFaabBalance: number | null
  myWaiverPriority: number | null
  roster: RosterPlayer[]
  isCommissioner: boolean
}

const WAIVER_LABELS: Record<string, string> = {
  FAAB: "FAAB bidding",
  ROLLING: "Rolling waivers",
  REVERSE_STANDINGS: "Reverse-standings waivers",
  CONTINUOUS: "Continuous waivers",
  FREE_AGENT: "Free agents",
  MARKETPLACE: "Transfer market",
}

export function WaiverManager(props: WaiverManagerProps) {
  const { leagueId, waiverType, faabBudget, roster, isCommissioner } = props
  const router = useRouter()
  const isInstant = waiverType === "FREE_AGENT" || waiverType === "CONTINUOUS"

  const [tab, setTab] = useState<"add" | "claims" | "order">("add")
  const [search, setSearch] = useState("")
  const [posFilter, setPosFilter] = useState("ALL")
  const [sortBy, setSortBy] = useState<"totalPoints" | "form">("totalPoints")
  const [selected, setSelected] = useState<FreeAgent | null>(null)
  const [dropId, setDropId] = useState<number | null>(null)
  const [faabBid, setFaabBid] = useState("")
  const [busy, setBusy] = useState(false)

  const { data: ctx, refetch: fetchContext } = useQuery({
    queryKey: ["waiver-ctx", leagueId],
    queryFn: async (): Promise<WaiverContext | null> => {
      const res = await fetch(`/api/waivers/${leagueId}`)
      return res.ok ? await res.json() : null
    },
  })

  const { data: players = [], refetch: fetchPlayers } = useQuery({
    queryKey: ["waiver-players", leagueId, posFilter, sortBy],
    queryFn: async (): Promise<FreeAgent[]> => {
      const posParam = posFilter !== "ALL" ? `&position=${posFilter}` : ""
      const res = await fetch(`/api/players?leagueId=${leagueId}&available=true&sortBy=${sortBy}&limit=100${posParam}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.players ?? []
    },
  })

  const filtered = players.filter(p =>
    search === "" ||
    p.webName.toLowerCase().includes(search.toLowerCase()) ||
    p.fplTeam.shortName.toLowerCase().includes(search.toLowerCase())
  )

  function openClaim(player: FreeAgent) {
    setSelected(player)
    setDropId(null)
    setFaabBid("")
  }

  async function submitClaim() {
    if (!selected) return
    setBusy(true)
    const res = await fetch(`/api/waivers/${leagueId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetPlayerId: selected.id,
        dropPlayerId: dropId,
        faabBid: waiverType === "FAAB" ? parseInt(faabBid || "0") : null,
      }),
    })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      toast.success(data.instant ? `${selected.webName} added to your roster!` : `Claim submitted for ${selected.webName}`)
      setSelected(null)
      fetchContext()
      if (data.instant) { fetchPlayers(); router.refresh() }
    } else {
      toast.error(data.error ?? "Claim failed")
    }
  }

  async function cancelClaim(claimId: string) {
    const res = await fetch(`/api/waivers/${leagueId}?claimId=${claimId}`, { method: "DELETE" })
    if (res.ok) { toast.success("Claim cancelled"); fetchContext() }
    else toast.error("Could not cancel")
  }

  async function processWaivers() {
    setBusy(true)
    const res = await fetch(`/api/waivers/${leagueId}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      toast.success(`Waivers processed: ${data.approved} approved, ${data.rejected} rejected`)
      fetchContext(); fetchPlayers(); router.refresh()
    } else {
      toast.error(data.error ?? "Processing failed")
    }
  }

  const pendingClaims = ctx?.claims.filter(c => c.status === "PENDING") ?? []
  const historyClaims = ctx?.claims.filter(c => c.status !== "PENDING") ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Waivers & Free Agency</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge className="bg-muted text-foreground border-0">{WAIVER_LABELS[waiverType]}</Badge>
            {waiverType === "FAAB" && ctx && (
              <Badge className="bg-primary/20 text-primary border-0">
                £{ctx.myTeam.faabBalance ?? faabBudget ?? 0} budget left
              </Badge>
            )}
            {(waiverType === "ROLLING" || waiverType === "REVERSE_STANDINGS") && ctx && (
              <Badge className="bg-muted text-foreground border-0">
                Waiver priority #{ctx.myTeam.waiverPriority ?? "—"}
              </Badge>
            )}
            {isInstant && (
              <Badge className="bg-primary/20 text-primary border-0">Instant pickups</Badge>
            )}
          </div>
        </div>
        {isCommissioner && !isInstant && (
          <button
            onClick={processWaivers}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
            {busy ? "Processing…" : "⚙ Process waivers now"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          ["add", isInstant ? "Free Agents" : "Add Players"],
          ["claims", `My Claims${pendingClaims.length ? ` (${pendingClaims.length})` : ""}`],
          ["order", "Waiver Order"],
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

      {/* ── ADD PLAYERS ── */}
      {tab === "add" && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex gap-1">
              {["ALL", "GK", "DEF", "MID", "FWD"].map(pos => (
                <button key={pos} onClick={() => setPosFilter(pos)}
                  className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    posFilter === pos ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted")}>
                  {pos}
                </button>
              ))}
            </div>
            <button onClick={() => setSortBy(sortBy === "totalPoints" ? "form" : "totalPoints")}
              className="px-2.5 py-1 rounded text-xs font-medium bg-muted text-foreground hover:bg-muted transition-colors">
              Sort: {sortBy === "totalPoints" ? "Total points" : "Form 🔥"}
            </button>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search free agents…"
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
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Form</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 60).map(p => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-foreground font-medium">{p.webName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.fplTeam.shortName}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[p.position])}>{p.position}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-foreground font-semibold tabular-nums">{p.totalPoints}</td>
                    <td className="px-3 py-2.5 text-right text-foreground tabular-nums">{p.form ?? "0.0"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openClaim(p)}
                        className="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors">
                        {isInstant ? "Add" : waiverType === "FAAB" ? "Bid" : "Claim"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No available players found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MY CLAIMS ── */}
      {tab === "claims" && (
        <div className="space-y-4">
          {pendingClaims.length > 0 && (
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">Pending</p>
              <div className="space-y-2">
                {pendingClaims.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[c.targetPlayer.position])}>{c.targetPlayer.position}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground text-sm font-medium">{c.targetPlayer.webName}</span>
                      <span className="text-muted-foreground text-xs ml-2">{c.targetPlayer.fplTeam.shortName}</span>
                      {c.dropPlayer && <span className="text-danger text-xs ml-2">drop {c.dropPlayer.webName}</span>}
                    </div>
                    {c.faabBid != null && <span className="text-primary text-sm font-mono">£{c.faabBid}</span>}
                    <button onClick={() => cancelClaim(c.id)}
                      className="text-danger hover:text-danger text-xs px-2 py-1 rounded hover:bg-muted transition-colors">
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {historyClaims.length > 0 && (
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-2">History</p>
              <div className="space-y-1.5">
                {historyClaims.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-card/50 border border-border">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[c.targetPlayer.position])}>{c.targetPlayer.position}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground text-sm">{c.targetPlayer.webName}</span>
                      {c.faabBid != null && <span className="text-muted-foreground text-xs ml-2">£{c.faabBid}</span>}
                      {c.failReason && <span className="text-muted-foreground text-xs ml-2">— {c.failReason}</span>}
                    </div>
                    <Badge className={cn("border-0 text-xs",
                      c.status === "APPROVED" ? "bg-primary/20 text-primary" :
                      c.status === "REJECTED" ? "bg-danger/20 text-danger" :
                      "bg-muted text-muted-foreground")}>
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingClaims.length === 0 && historyClaims.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No claims yet. Add players from the {isInstant ? "Free Agents" : "Add Players"} tab.</p>
            </div>
          )}
        </div>
      )}

      {/* ── WAIVER ORDER ── */}
      {tab === "order" && ctx && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium w-12">#</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Team</th>
                <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">
                  {waiverType === "FAAB" ? "FAAB left" : "Priority"}
                </th>
              </tr>
            </thead>
            <tbody>
              {ctx.waiverOrder.map((t, i) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 text-foreground">
                    {t.isBot && <span className="mr-1 text-xs">🤖</span>}{t.name}
                  </td>
                  <td className="px-4 py-2.5 text-right text-foreground font-mono">
                    {waiverType === "FAAB" ? `£${t.faabBalance ?? 0}` : `#${t.waiverPriority ?? "—"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CLAIM PANEL (modal-ish) ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", POS_COLORS[selected.position])}>{selected.position}</span>
              <h3 className="text-foreground font-bold text-lg">{selected.webName}</h3>
              <span className="text-muted-foreground text-sm">{selected.fplTeam.shortName} · {selected.totalPoints}pts</span>
            </div>

            {waiverType === "FAAB" && (
              <div className="mb-4">
                <label className="text-foreground text-sm block mb-1.5">FAAB bid (£)</label>
                <Input type="number" min={0} max={ctx?.myTeam.faabBalance ?? faabBudget ?? 1000}
                  value={faabBid} onChange={e => setFaabBid(e.target.value)} placeholder="0"
                  className="bg-muted border-border text-foreground" />
                <p className="text-muted-foreground text-xs mt-1">Budget remaining: £{ctx?.myTeam.faabBalance ?? faabBudget ?? 0}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="text-foreground text-sm block mb-1.5">
                Drop a player <span className="text-muted-foreground">(optional unless roster is full)</span>
              </label>
              <select value={dropId ?? ""} onChange={e => setDropId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm">
                <option value="">— Don&apos;t drop anyone —</option>
                {roster.map(r => (
                  <option key={r.playerId} value={r.playerId}>{r.position} · {r.name} ({r.club})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-muted text-foreground text-sm transition-colors">
                Cancel
              </button>
              <button onClick={submitClaim} disabled={busy}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
                {busy ? "Submitting…" : isInstant ? "Add to roster" : waiverType === "FAAB" ? "Place bid" : "Submit claim"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
