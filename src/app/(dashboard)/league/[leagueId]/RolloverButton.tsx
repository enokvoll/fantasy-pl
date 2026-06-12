"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function RolloverButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function rollover() {
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/rollover`, { method: "POST" })
    if (res.ok) {
      const { newSeason } = await res.json()
      toast.success(`Rolled over to ${newSeason}! Rosters carried over — run the rookie draft.`)
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(typeof error === "string" ? error : "Could not start next season")
    }
    setLoading(false)
  }

  return (
    <button
      onClick={rollover}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50">
      {loading ? "Rolling over…" : "Start next season →"}
    </button>
  )
}
