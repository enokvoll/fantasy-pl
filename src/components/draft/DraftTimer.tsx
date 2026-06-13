"use client"

import { cn } from "@/lib/utils"

interface DraftTimerProps {
  timeRemaining: number
  currentTeamName: string | null
  status: string
  /** Render a small inline pill (for the top bar) instead of the large card. */
  compact?: boolean
}

export function DraftTimer({ timeRemaining, currentTeamName, status, compact = false }: DraftTimerProps) {
  const mins = Math.floor(timeRemaining / 60)
  const secs = timeRemaining % 60
  const display = mins > 0
    ? `${mins}:${secs.toString().padStart(2, "0")}`
    : `${secs}s`

  const color =
    timeRemaining > 60 ? "text-foreground" :
    timeRemaining > 30 ? "text-yellow-400" :
    "text-danger"

  const pulse = timeRemaining <= 30 && status === "IN_PROGRESS"

  if (compact) {
    return (
      <div className={cn(
        "font-mono font-bold tabular-nums text-sm px-2 py-0.5 rounded bg-muted leading-none",
        color, pulse && "animate-pulse"
      )}>
        {status === "IN_PROGRESS" ? display : status === "PAUSED" ? "⏸" : "--"}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center bg-card border border-border rounded-xl p-4 min-w-[110px]">
      <div className={cn("text-4xl font-bold font-mono tabular-nums leading-none", color, pulse && "animate-pulse")}>
        {status === "IN_PROGRESS" ? display : status === "PAUSED" ? "⏸" : "--"}
      </div>
      <div className="text-muted-foreground text-xs mt-2 text-center truncate max-w-[100px]">
        {status === "IN_PROGRESS" && currentTeamName ? currentTeamName : status === "PAUSED" ? "Paused" : ""}
      </div>
    </div>
  )
}
