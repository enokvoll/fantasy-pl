"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface BotControlsProps {
  leagueId: string
  spotsLeft: number
  botCount: number
}

export function BotControls({ leagueId, spotsLeft, botCount }: BotControlsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<"add" | "remove" | null>(null)

  async function addBot() {
    setLoading("add")
    const res = await fetch(`/api/leagues/${leagueId}/bots`, { method: "POST" })
    if (res.ok) {
      toast.success("Bot added")
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(error ?? "Could not add bot")
    }
    setLoading(null)
  }

  async function removeBot() {
    setLoading("remove")
    const res = await fetch(`/api/leagues/${leagueId}/bots`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Bot removed")
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(error ?? "Could not remove bot")
    }
    setLoading(null)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {spotsLeft > 0 && (
        <button
          onClick={addBot}
          disabled={loading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50">
          {loading === "add" ? "Adding…" : "🤖 Add bot"}
        </button>
      )}
      {botCount > 0 && (
        <button
          onClick={removeBot}
          disabled={loading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-red-400 text-xs font-medium transition-colors disabled:opacity-50">
          {loading === "remove" ? "Removing…" : "Remove bot"}
        </button>
      )}
      {spotsLeft > 0 && (
        <span className="text-slate-500 text-xs">{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} remaining</span>
      )}
    </div>
  )
}
