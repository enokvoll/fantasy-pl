"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Player {
  id: number
  webName: string
  position: string
  nowCost: number
  totalPoints: number
  form: string | null
  fplTeam: { shortName: string }
}

const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  DEF: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  MID: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  FWD: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
}

interface PlayerSearchPanelProps {
  leagueId: string
  isMyTurn: boolean
  onPick: (playerId: number) => void
  onAddToQueue: (playerId: number, priority: number) => void
  picksMade: number  // triggers re-fetch when a pick happens
}

export function PlayerSearchPanel({ leagueId, isMyTurn, onPick, onAddToQueue, picksMade }: PlayerSearchPanelProps) {
  const [search, setSearch] = useState("")
  const [posFilter, setPosFilter] = useState<string>("ALL")
  const [picking, setPicking] = useState<number | null>(null)

  // `picksMade` is part of the key so the list refetches whenever a pick lands.
  const { data: players = [], refetch } = useQuery({
    queryKey: ["draft-players", leagueId, posFilter, picksMade],
    queryFn: async (): Promise<Player[]> => {
      const posParam = posFilter !== "ALL" ? `&position=${posFilter}` : ""
      const res = await fetch(`/api/players?leagueId=${leagueId}&available=true&limit=100${posParam}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.players ?? []
    },
  })

  const filtered = players.filter(p =>
    search === "" || p.webName.toLowerCase().includes(search.toLowerCase()) ||
    p.fplTeam.shortName.toLowerCase().includes(search.toLowerCase())
  )

  async function handlePick(playerId: number) {
    setPicking(playerId)
    onPick(playerId)
    await new Promise(r => setTimeout(r, 800))
    setPicking(null)
    refetch()
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 mb-2 flex-wrap">
        {["ALL", "GK", "DEF", "MID", "FWD"].map(pos => (
          <button key={pos}
            onClick={() => setPosFilter(pos)}
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium transition-colors",
              posFilter === pos ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
            )}>
            {pos}
          </button>
        ))}
      </div>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search players…"
        className="bg-muted border-border text-foreground placeholder:text-muted-foreground text-xs h-8 mb-2"
      />
      <div className="overflow-y-auto flex-1 space-y-0.5 min-h-0">
        {filtered.slice(0, 60).map(player => (
          <div key={player.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors group">
            <span className={cn("text-[10px] px-1 rounded font-medium shrink-0", POS_COLORS[player.position] ?? "")}>
              {player.position}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-foreground text-xs font-medium truncate block">{player.webName}</span>
              <span className="text-muted-foreground text-[10px]">{player.fplTeam.shortName}</span>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">{player.totalPoints}pts</span>
            <span className="text-muted-foreground text-[10px]">£{(player.nowCost / 10).toFixed(1)}m</span>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => onAddToQueue(player.id, 999)}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted text-foreground transition-all"
                title="Add to queue">
                Q+
              </button>
              <button
                onClick={() => handlePick(player.id)}
                disabled={!isMyTurn || picking !== null}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-semibold transition-colors",
                  isMyTurn && picking === null
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}>
                {picking === player.id ? "…" : "Pick"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-muted-foreground text-xs text-center py-4">No players found</p>
        )}
      </div>
    </div>
  )
}
