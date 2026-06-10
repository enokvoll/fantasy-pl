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
  GK: "bg-yellow-600/20 text-yellow-400",
  DEF: "bg-blue-600/20 text-blue-400",
  MID: "bg-emerald-600/20 text-emerald-400",
  FWD: "bg-red-600/20 text-red-400",
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
              posFilter === pos ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            )}>
            {pos}
          </button>
        ))}
      </div>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search players…"
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-xs h-8 mb-2"
      />
      <div className="overflow-y-auto flex-1 space-y-0.5 min-h-0">
        {filtered.slice(0, 60).map(player => (
          <div key={player.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/60 transition-colors group">
            <span className={cn("text-[10px] px-1 rounded font-medium shrink-0", POS_COLORS[player.position] ?? "")}>
              {player.position}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-slate-200 text-xs font-medium truncate block">{player.webName}</span>
              <span className="text-slate-500 text-[10px]">{player.fplTeam.shortName}</span>
            </div>
            <span className="text-slate-400 text-xs tabular-nums">{player.totalPoints}pts</span>
            <span className="text-slate-500 text-[10px]">£{(player.nowCost / 10).toFixed(1)}m</span>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => onAddToQueue(player.id, 999)}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
                title="Add to queue">
                Q+
              </button>
              <button
                onClick={() => handlePick(player.id)}
                disabled={!isMyTurn || picking !== null}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded font-semibold transition-colors",
                  isMyTurn && picking === null
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                )}>
                {picking === player.id ? "…" : "Pick"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">No players found</p>
        )}
      </div>
    </div>
  )
}
