"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export interface DynastyPlayer {
  slotId: string
  playerName: string
  position: string
  clubShort: string
  totalPoints: number
  yearsOwned: number
  acquireType: string
}

interface DynastyPanelProps {
  teamId: string
  players: DynastyPlayer[]
  rosterCap: number
  /** When true (offseason / pre-rookie-draft), players can be cut. */
  canCut: boolean
}

export function DynastyPanel({ teamId, players, rosterCap, canCut }: DynastyPanelProps) {
  const router = useRouter()
  const [cutting, setCutting] = useState<string | null>(null)

  async function cut(slotId: string, name: string) {
    if (!confirm(`Cut ${name}? They'll be released to free agency.`)) return
    setCutting(slotId)
    const res = await fetch(`/api/teams/${teamId}/cut`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rosterSlotId: slotId }),
    })
    if (res.ok) {
      toast.success(`${name} released`)
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(typeof error === "string" ? error : "Could not cut player")
    }
    setCutting(null)
  }

  const overCap = players.length > rosterCap

  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold text-sm">Dynasty roster</h2>
        <span className={`text-xs font-medium ${overCap ? "text-red-400" : "text-slate-400"}`}>
          {players.length}/{rosterCap} players
        </span>
      </div>
      {canCut && overCap && (
        <p className="text-xs text-red-400 mb-3">
          Over the roster limit — cut {players.length - rosterCap} player{players.length - rosterCap === 1 ? "" : "s"} to make room for the rookie draft.
        </p>
      )}
      <div className="divide-y divide-slate-800">
        {players.map(p => (
          <div key={p.slotId} className="flex items-center gap-3 py-2">
            <span className="w-9 text-xs font-mono text-slate-500">{p.position}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{p.playerName} <span className="text-slate-500">{p.clubShort}</span></p>
              <p className="text-xs text-slate-500">
                {p.yearsOwned > 0 ? `${p.yearsOwned} yr${p.yearsOwned === 1 ? "" : "s"} owned` : "New"} · {p.acquireType.toLowerCase()} · {p.totalPoints} pts
              </p>
            </div>
            {canCut && (
              <button
                onClick={() => cut(p.slotId, p.playerName)}
                disabled={cutting !== null}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-red-900/40 border border-slate-700 text-red-400 text-xs font-medium transition-colors disabled:opacity-50">
                {cutting === p.slotId ? "Cutting…" : "Cut"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
