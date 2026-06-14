"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { positionBadge, statusBadge } from "@/lib/ui"

export interface RightsPlayer {
  playerId: number
  playerName: string
  position: string
  clubShort: string
  status: "HELD" | "AVAILABLE_TO_RESIGN"
}

interface PlayerRightsPanelProps {
  teamId: string
  players: RightsPlayer[]
}

const STATUS_LABEL: Record<RightsPlayer["status"], string> = {
  HELD: "Left the PL",
  AVAILABLE_TO_RESIGN: "Back — re-sign",
}

export function PlayerRightsPanel({ teamId, players }: PlayerRightsPanelProps) {
  const router = useRouter()
  const [resigning, setResigning] = useState<number | null>(null)

  async function resign(playerId: number, name: string) {
    if (!confirm(`Re-sign ${name} to your roster? They'll be added to your bench.`)) return
    setResigning(playerId)
    const res = await fetch(`/api/teams/${teamId}/resign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    })
    if (res.ok) {
      toast.success(`${name} re-signed`)
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(typeof error === "string" ? error : "Could not re-sign player")
    }
    setResigning(null)
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-foreground font-bold text-sm">Player rights</h2>
        <span className="text-xs text-muted-foreground">{players.length}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Players who left the Premier League while on your roster. You keep an exclusive claim — if
        they return, you get first refusal to re-sign them.
      </p>
      <div className="divide-y divide-border">
        {players.map(p => (
          <div key={p.playerId} className="flex items-center gap-3 py-2">
            <span className={`w-11 text-center text-xs font-semibold rounded px-1 py-0.5 ${positionBadge(p.position)}`}>{p.position}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{p.playerName} <span className="text-muted-foreground">{p.clubShort}</span></p>
              <span className={`inline-block mt-0.5 text-xs font-medium rounded px-1.5 py-0.5 ${statusBadge(p.status === "AVAILABLE_TO_RESIGN" ? "OPEN" : "PENDING")}`}>
                {STATUS_LABEL[p.status]}
              </span>
            </div>
            {p.status === "AVAILABLE_TO_RESIGN" && (
              <button
                onClick={() => resign(p.playerId, p.playerName)}
                disabled={resigning !== null}
                className="px-2.5 py-1 rounded-md bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary text-xs font-medium transition-colors disabled:opacity-50">
                {resigning === p.playerId ? "Re-signing…" : "Re-sign"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
