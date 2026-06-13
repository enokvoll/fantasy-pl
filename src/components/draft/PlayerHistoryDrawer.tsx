"use client"

import { useQuery } from "@tanstack/react-query"

interface PastSeason {
  seasonName: string
  totalPoints: number
  minutes: number
  goalsScored: number
  assists: number
  cleanSheets: number
  goalsConceded: number
  bonus: number
}

interface PlayerHistoryDrawerProps {
  playerId: number | null
  playerName: string | null
  onClose: () => void
}

export function PlayerHistoryDrawer({ playerId, playerName, onClose }: PlayerHistoryDrawerProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["player-history", playerId],
    enabled: playerId !== null,
    queryFn: async (): Promise<PastSeason[]> => {
      const res = await fetch(`/api/players/${playerId}/history`)
      if (!res.ok) throw new Error("Failed to load history")
      const json = await res.json()
      return json.pastSeasons ?? []
    },
  })

  if (playerId === null) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{playerName ?? "Player"}</h2>
            <p className="text-muted-foreground text-xs">Premier League — prior seasons</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm px-2 py-1 rounded hover:bg-muted">
            ✕
          </button>
        </div>

        {isLoading && <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>}
        {isError && <p className="text-danger text-sm py-8 text-center">Couldn&apos;t load history.</p>}
        {data && data.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">No prior Premier League seasons.</p>
        )}

        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-2 font-medium">Season</th>
                  <th className="text-right py-2 px-1 font-medium">Pts</th>
                  <th className="text-right py-2 px-1 font-medium">Min</th>
                  <th className="text-right py-2 px-1 font-medium">G</th>
                  <th className="text-right py-2 px-1 font-medium">A</th>
                  <th className="text-right py-2 px-1 font-medium">CS</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.seasonName} className="border-b border-border/60">
                    <td className="py-2 pr-2 text-foreground font-medium">{s.seasonName}</td>
                    <td className="py-2 px-1 text-right text-foreground font-semibold tabular-nums">{s.totalPoints}</td>
                    <td className="py-2 px-1 text-right text-muted-foreground tabular-nums">{s.minutes}</td>
                    <td className="py-2 px-1 text-right text-muted-foreground tabular-nums">{s.goalsScored}</td>
                    <td className="py-2 px-1 text-right text-muted-foreground tabular-nums">{s.assists}</td>
                    <td className="py-2 px-1 text-right text-muted-foreground tabular-nums">{s.cleanSheets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
