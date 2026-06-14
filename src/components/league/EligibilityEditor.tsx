"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { SECONDARY_BADGE } from "@/lib/ui"

const OUTFIELD = ["DEF", "MID", "FWD"] as const
type Outfield = (typeof OUTFIELD)[number]

interface EligibilityEditorProps {
  leagueId: string
  playerId: number
  /** The player's primary position (always eligible, never editable). */
  primary: string
  /** Current effective secondary positions (override if set, else auto-derived). */
  value: string[]
  /** True when a commissioner override row exists (vs. auto-derived). */
  hasOverride: boolean
}

/**
 * Commissioner control to override a player's secondary lineup eligibility within a
 * league. Toggling saves an override (PUT); "Auto" clears it (DELETE) to revert to the
 * auto-derived set. GK is never offered and the primary position is implicit.
 */
export function EligibilityEditor({ leagueId, playerId, primary, value, hasOverride }: EligibilityEditorProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const selected = new Set(value)

  async function save(positions: string[]) {
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/eligibility`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, positions }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
    else toast.error("Could not save eligibility")
  }

  async function reset() {
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/eligibility`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
    else toast.error("Could not reset eligibility")
  }

  function toggle(pos: Outfield) {
    const next = new Set(selected)
    if (next.has(pos)) next.delete(pos)
    else next.add(pos)
    save([...next])
  }

  return (
    <div className="inline-flex items-center gap-1">
      {OUTFIELD.filter((p) => p !== primary).map((pos) => (
        <button
          key={pos}
          onClick={() => toggle(pos)}
          disabled={saving}
          className={cn(
            "text-[10px] px-1 py-0.5 rounded font-medium transition-colors disabled:opacity-50",
            selected.has(pos)
              ? "bg-primary/20 text-primary border border-primary/40"
              : SECONDARY_BADGE
          )}>
          {pos}
        </button>
      ))}
      {hasOverride && (
        <button
          onClick={reset}
          disabled={saving}
          title="Revert to auto-derived eligibility"
          className="text-[10px] px-1 py-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-50">
          auto
        </button>
      )}
    </div>
  )
}
