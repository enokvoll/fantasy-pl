"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function YouthDraftButton({ leagueId }: { leagueId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function start() {
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/youth-draft/start`, { method: "POST" })
    if (res.ok) {
      toast.success("Youth draft ready — open the draft room to begin.")
      router.push(`/league/${leagueId}/draft`)
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(typeof error === "string" ? error : "Could not start youth draft")
    }
    setLoading(false)
  }

  return (
    <button
      onClick={start}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent2 hover:bg-accent2/90 text-accent2-foreground text-sm font-semibold transition-colors disabled:opacity-50">
      {loading ? "Preparing…" : "Start youth draft 🌱"}
    </button>
  )
}
