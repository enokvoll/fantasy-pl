"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { positionBadge } from "@/lib/ui"
import { PlayerHistoryDrawer } from "./PlayerHistoryDrawer"
import type { DraftState } from "@/types/draft"

interface SeasonStats {
  points: number
  minutes: number
  goals: number
  assists: number
  cleanSheets: number
}

interface TablePlayer {
  id: number
  webName: string
  position: string
  nowCost: number
  points: number | null
  seasonStats: SeasonStats | null
  form: string | null
  status: string
  news: string | null
  fplTeam: { shortName: string }
}

export interface FplTeamOption {
  id: number
  name: string
  shortName: string
}

interface PlayerTableProps {
  leagueId: string
  isMyTurn: boolean
  onPick: (playerId: number) => void
  picksMade: number
  draftState: DraftState | null
  shortlist: number[]
  onShortlistAdd: (playerId: number) => void
  onShortlistRemove: (playerId: number) => void
  onAddToQueue: (playerId: number, priority: number) => void
  fplTeams: FplTeamOption[]
  prospectOnly?: boolean
}

type StatusFilter = "available" | "drafted" | "all"

const STATUS_DOT: Record<string, string> = {
  AVAILABLE: "bg-success",
  DOUBTFUL: "bg-warn",
}

export function PlayerTable({
  leagueId,
  isMyTurn,
  onPick,
  picksMade,
  draftState,
  shortlist,
  onShortlistAdd,
  onShortlistRemove,
  onAddToQueue,
  fplTeams,
  prospectOnly = false,
}: PlayerTableProps) {
  const [posFilter, setPosFilter] = useState("ALL")
  const [clubFilter, setClubFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("available")
  const [shortlistedOnly, setShortlistedOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [picking, setPicking] = useState<number | null>(null)
  const [detailPlayer, setDetailPlayer] = useState<{ id: number; name: string } | null>(null)

  const availableMode = statusFilter === "available"

  const { data: players = [] } = useQuery({
    queryKey: ["draft-table", leagueId, posFilter, clubFilter, availableMode, search, prospectOnly, picksMade],
    queryFn: async (): Promise<TablePlayer[]> => {
      const params = new URLSearchParams({ leagueId, limit: "300" })
      if (availableMode) params.set("available", "true")
      if (posFilter !== "ALL") params.set("position", posFilter)
      if (clubFilter) params.set("fplTeamId", clubFilter)
      if (search.trim()) params.set("q", search.trim())
      if (prospectOnly) params.set("prospect", "true")
      const res = await fetch(`/api/players?${params.toString()}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.players ?? []
    },
  })

  // Who has drafted whom, from the live board.
  const draftedBy = new Map<number, string>()
  const teamName = new Map(draftState?.teams.map((t) => [t.id, t.name]) ?? [])
  for (const p of draftState?.picks ?? []) {
    if (p.playerId !== null) draftedBy.set(p.playerId, teamName.get(p.ownerTeamId) ?? "—")
  }
  const shortlistSet = new Set(shortlist)

  const rows = players.filter((p) => {
    if (statusFilter === "drafted" && !draftedBy.has(p.id)) return false
    if (shortlistedOnly && !shortlistSet.has(p.id)) return false
    return true
  })

  async function handlePick(playerId: number) {
    setPicking(playerId)
    onPick(playerId)
    await new Promise((r) => setTimeout(r, 800))
    setPicking(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex gap-1">
          {["ALL", "GK", "DEF", "MID", "FWD"].map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                posFilter === pos ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}>
              {pos}
            </button>
          ))}
        </div>

        <select
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value)}
          className="h-7 rounded bg-muted border border-border text-foreground text-xs px-1.5">
          <option value="">All clubs</option>
          {fplTeams.map((t) => (
            <option key={t.id} value={t.id}>{t.shortName}</option>
          ))}
        </select>

        <div className="flex gap-1">
          {(["available", "drafted", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium capitalize transition-colors",
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}>
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShortlistedOnly((v) => !v)}
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium transition-colors",
            shortlistedOnly ? "bg-accent2/20 text-accent2" : "bg-muted text-muted-foreground hover:bg-muted/70"
          )}>
          ★ Shortlisted
        </button>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-xs h-7 w-32 ml-auto"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border text-muted-foreground">
              <th className="w-6 px-1 py-1.5"></th>
              <th className="text-left px-2 py-1.5 font-medium">Player</th>
              <th className="text-left px-1 py-1.5 font-medium">Club</th>
              <th className="text-center px-1 py-1.5 font-medium">Pos</th>
              <th className="text-right px-1 py-1.5 font-medium">£</th>
              <th className="text-right px-1 py-1.5 font-medium">Pts</th>
              <th className="text-right px-1 py-1.5 font-medium">G</th>
              <th className="text-right px-1 py-1.5 font-medium">A</th>
              <th className="text-right px-1 py-1.5 font-medium">CS</th>
              <th className="text-right px-1 py-1.5 font-medium">Min</th>
              <th className="text-right px-1 py-1.5 font-medium">Form</th>
              <th className="px-1 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const drafted = draftedBy.get(p.id)
              const starred = shortlistSet.has(p.id)
              const s = p.seasonStats
              return (
                <tr
                  key={p.id}
                  onClick={() => setDetailPlayer({ id: p.id, name: p.webName })}
                  className="border-b border-border/60 hover:bg-muted/40 cursor-pointer transition-colors">
                  <td className="px-1 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => (starred ? onShortlistRemove(p.id) : onShortlistAdd(p.id))}
                      title={starred ? "Remove from shortlist" : "Add to shortlist"}
                      className={cn("text-sm leading-none", starred ? "text-accent2" : "text-muted-foreground hover:text-foreground")}>
                      {starred ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[p.status] ?? "bg-danger")} title={p.news ?? p.status} />
                      <span className="text-foreground font-medium truncate max-w-[120px]">{p.webName}</span>
                      {drafted && <span className="text-[10px] text-muted-foreground truncate">· {drafted}</span>}
                    </div>
                  </td>
                  <td className="px-1 py-1 text-muted-foreground">{p.fplTeam.shortName}</td>
                  <td className="px-1 py-1 text-center">
                    <span className={cn("text-[10px] px-1 py-0.5 rounded font-medium", positionBadge(p.position))}>{p.position}</span>
                  </td>
                  <td className="px-1 py-1 text-right text-foreground tabular-nums">{(p.nowCost / 10).toFixed(1)}</td>
                  <td className="px-1 py-1 text-right text-foreground font-semibold tabular-nums">{p.points ?? "—"}</td>
                  <td className="px-1 py-1 text-right text-muted-foreground tabular-nums">{s ? s.goals : "—"}</td>
                  <td className="px-1 py-1 text-right text-muted-foreground tabular-nums">{s ? s.assists : "—"}</td>
                  <td className="px-1 py-1 text-right text-muted-foreground tabular-nums">{s ? s.cleanSheets : "—"}</td>
                  <td className="px-1 py-1 text-right text-muted-foreground tabular-nums">{s ? s.minutes : "—"}</td>
                  <td className="px-1 py-1 text-right text-muted-foreground tabular-nums">{p.form ?? "—"}</td>
                  <td className="px-1 py-1 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {!drafted && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onAddToQueue(p.id, 999)}
                          title="Add to auto-pick queue"
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70 text-foreground transition-colors">
                          +Q
                        </button>
                        <button
                          onClick={() => handlePick(p.id)}
                          disabled={!isMyTurn || picking !== null}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded font-semibold transition-colors",
                            isMyTurn && picking === null
                              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                              : "bg-muted text-muted-foreground cursor-not-allowed"
                          )}>
                          {picking === p.id ? "…" : "Pick"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="text-muted-foreground text-center py-6">No players match these filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PlayerHistoryDrawer
        playerId={detailPlayer?.id ?? null}
        playerName={detailPlayer?.name ?? null}
        onClose={() => setDetailPlayer(null)}
      />
    </div>
  )
}
