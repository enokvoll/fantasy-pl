"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { TradeAnalyzer } from "./TradeAnalyzer"

const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  DEF: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  MID: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  FWD: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
}

interface TeamLite { id: string; name: string; isBot: boolean }
interface AssetPlayer { playerId: number; name: string; position: string; club: string; totalPoints: number }
interface AssetPick { id: string; label: string }
interface TeamAssets { players: AssetPlayer[]; picks: AssetPick[] }

// A selected asset, keyed uniquely
interface SelectedAsset {
  key: string
  fromTeamId: string
  toTeamId: string
  kind: "player" | "pick"
  refId: number | string
  label: string
  position?: string
  points: number
}

interface TradeBuilderProps {
  leagueId: string
  myTeamId: string
  teams: TeamLite[]
  onClose: () => void
  onSubmitted: () => void
  /** When set, this builder submits a counter-offer to the given trade. */
  counterOf?: { tradeId: string; participantTeamIds: string[] }
}

export function TradeBuilder({ leagueId, myTeamId, teams, onClose, onSubmitted, counterOf }: TradeBuilderProps) {
  const otherTeams = teams.filter(t => t.id !== myTeamId)
  const [involved, setInvolved] = useState<string[]>(() => {
    if (counterOf) {
      // Seed with the original trade's teams (me first).
      return Array.from(new Set([myTeamId, ...counterOf.participantTeamIds]))
    }
    return otherTeams.length > 0 ? [myTeamId, otherTeams[0].id] : [myTeamId]
  })
  const [assetsByTeam, setAssetsByTeam] = useState<Record<string, TeamAssets>>({})
  const [selected, setSelected] = useState<SelectedAsset[]>([])
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  const teamName = useCallback((id: string) => teams.find(t => t.id === id)?.name ?? "?", [teams])

  // Fetch assets for any involved team we don't have yet
  useEffect(() => {
    involved.forEach(async (teamId) => {
      if (assetsByTeam[teamId]) return
      const res = await fetch(`/api/teams/${teamId}/assets`)
      if (res.ok) {
        const data = await res.json()
        setAssetsByTeam(prev => ({ ...prev, [teamId]: { players: data.players, picks: data.picks } }))
      }
    })
  }, [involved, assetsByTeam])

  const isTwoTeam = involved.length === 2

  function defaultDestination(fromTeamId: string): string {
    if (isTwoTeam) return involved.find(id => id !== fromTeamId)!
    // multi-team: default to first other involved team
    return involved.find(id => id !== fromTeamId)!
  }

  function toggleAsset(fromTeamId: string, kind: "player" | "pick", refId: number | string, label: string, points: number, position?: string) {
    const key = `${fromTeamId}:${kind}:${refId}`
    setSelected(prev => {
      const exists = prev.find(s => s.key === key)
      if (exists) return prev.filter(s => s.key !== key)
      return [...prev, { key, fromTeamId, toTeamId: defaultDestination(fromTeamId), kind, refId, label, points, position }]
    })
  }

  function setDestination(key: string, toTeamId: string) {
    setSelected(prev => prev.map(s => s.key === key ? { ...s, toTeamId } : s))
  }

  function addTeam(teamId: string) {
    if (!involved.includes(teamId)) setInvolved(prev => [...prev, teamId])
  }

  function removeTeam(teamId: string) {
    if (teamId === myTeamId) return
    setInvolved(prev => prev.filter(id => id !== teamId))
    setSelected(prev => prev.filter(s => s.fromTeamId !== teamId && s.toTeamId !== teamId))
  }

  async function submit() {
    if (selected.length === 0) { toast.error("Add at least one player or pick"); return }
    setBusy(true)
    const assets = selected.map(s => ({
      fromTeamId: s.fromTeamId,
      toTeamId: s.toTeamId,
      playerId: s.kind === "player" ? (s.refId as number) : null,
      draftPickSlotId: s.kind === "pick" ? (s.refId as string) : null,
    }))
    const url = counterOf
      ? `/api/trades/${leagueId}/${counterOf.tradeId}/counter`
      : `/api/trades/${leagueId}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantTeamIds: involved.filter(id => id !== myTeamId), assets, notes: notes || undefined }),
    })
    setBusy(false)
    const data = await res.json()
    if (res.ok) {
      toast.success(counterOf ? "Counter-offer sent!" : "Trade proposed!")
      onSubmitted()
    } else {
      toast.error(data.error ?? "Could not propose trade")
    }
  }

  const availableToAdd = otherTeams.filter(t => !involved.includes(t.id))
  const analyzerTeams = involved.map(id => ({ id, name: teamName(id) }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-foreground font-bold text-lg">{counterOf ? "Counter-offer" : "Propose a trade"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        {/* Involved teams */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground text-xs">Teams:</span>
          {involved.map(id => (
            <span key={id} className={cn("text-xs px-2 py-1 rounded-lg flex items-center gap-1",
              id === myTeamId ? "bg-primary/20 text-primary" : "bg-muted text-foreground")}>
              {teamName(id)}
              {id !== myTeamId && (
                <button onClick={() => removeTeam(id)} className="text-muted-foreground hover:text-danger ml-0.5">×</button>
              )}
            </span>
          ))}
          {availableToAdd.length > 0 && (
            <select
              value=""
              onChange={e => { if (e.target.value) addTeam(e.target.value) }}
              className="bg-muted border border-border rounded-lg px-2 py-1 text-foreground text-xs">
              <option value="">+ Add team</option>
              {availableToAdd.map(t => (
                <option key={t.id} value={t.id}>{t.isBot ? "🤖 " : ""}{t.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Team asset panels */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(involved.length, 3)}, minmax(0, 1fr))` }}>
            {involved.map(teamId => {
              const ta = assetsByTeam[teamId]
              return (
                <div key={teamId} className="rounded-xl bg-muted/40 border border-border overflow-hidden">
                  <div className={cn("px-3 py-2 text-xs font-semibold border-b border-border",
                    teamId === myTeamId ? "text-primary" : "text-foreground")}>
                    {teamName(teamId)}
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5">
                    {!ta && <p className="text-muted-foreground text-xs text-center py-3">Loading…</p>}
                    {ta?.players.map(p => {
                      const key = `${teamId}:player:${p.playerId}`
                      const on = selected.some(s => s.key === key)
                      return (
                        <button key={p.playerId}
                          onClick={() => toggleAsset(teamId, "player", p.playerId, p.name, p.totalPoints, p.position)}
                          className={cn("w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left transition-colors",
                            on ? "bg-primary/20 ring-1 ring-primary/40" : "hover:bg-muted")}>
                          <span className={cn("text-[10px] px-1 rounded font-medium", POS_COLORS[p.position])}>{p.position}</span>
                          <span className="text-foreground truncate flex-1">{p.name}</span>
                          <span className="text-muted-foreground">{p.club}</span>
                          <span className="text-muted-foreground tabular-nums">{p.totalPoints}</span>
                        </button>
                      )
                    })}
                    {ta && ta.picks.length > 0 && (
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider px-2 pt-2 pb-0.5">Draft picks</p>
                    )}
                    {ta?.picks.map(pk => {
                      const key = `${teamId}:pick:${pk.id}`
                      const on = selected.some(s => s.key === key)
                      return (
                        <button key={pk.id}
                          onClick={() => toggleAsset(teamId, "pick", pk.id, pk.label, 0)}
                          className={cn("w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left transition-colors",
                            on ? "bg-purple-600/20 ring-1 ring-purple-600/40" : "hover:bg-muted")}>
                          <span className="text-[10px] px-1 rounded font-medium bg-purple-600/20 text-purple-400">PICK</span>
                          <span className="text-foreground truncate flex-1">{pk.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected assets + destination routing */}
          {selected.length > 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground text-xs font-medium mb-2">Selected ({selected.length})</p>
              <div className="space-y-1">
                {selected.map(s => (
                  <div key={s.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 text-xs">
                    {s.position && <span className={cn("text-[10px] px-1 rounded font-medium", POS_COLORS[s.position])}>{s.position}</span>}
                    {s.kind === "pick" && <span className="text-[10px] px-1 rounded font-medium bg-purple-600/20 text-purple-400">PICK</span>}
                    <span className="text-foreground">{s.label}</span>
                    <span className="text-muted-foreground">from {teamName(s.fromTeamId)}</span>
                    <span className="text-muted-foreground ml-auto">→</span>
                    {isTwoTeam ? (
                      <span className="text-primary">{teamName(s.toTeamId)}</span>
                    ) : (
                      <select value={s.toTeamId} onChange={e => setDestination(s.key, e.target.value)}
                        className="bg-card border border-border rounded px-1.5 py-0.5 text-primary text-xs">
                        {involved.filter(id => id !== s.fromTeamId).map(id => (
                          <option key={id} value={id}>{teamName(id)}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => toggleAsset(s.fromTeamId, s.kind, s.refId, s.label, s.points, s.position)}
                      className="text-muted-foreground hover:text-danger ml-1">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: analyzer + notes + submit */}
        <div className="border-t border-border p-4 space-y-3">
          {selected.length > 0 && (
            <TradeAnalyzer teams={analyzerTeams} assets={selected.map(s => ({ fromTeamId: s.fromTeamId, toTeamId: s.toTeamId, points: s.points }))} compact />
          )}
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a note (optional)…"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground" />
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted text-foreground text-sm transition-colors">Cancel</button>
            <button onClick={submit} disabled={busy || selected.length === 0}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold transition-colors">
              {busy ? "Sending…" : counterOf ? "Send counter-offer" : "Propose trade"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
