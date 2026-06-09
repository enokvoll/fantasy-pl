"use client"

import { cn } from "@/lib/utils"

interface DraftTimerProps {
  timeRemaining: number
  currentTeamName: string | null
  status: string
}

export function DraftTimer({ timeRemaining, currentTeamName, status }: DraftTimerProps) {
  const mins = Math.floor(timeRemaining / 60)
  const secs = timeRemaining % 60
  const display = mins > 0
    ? `${mins}:${secs.toString().padStart(2, "0")}`
    : `${secs}s`

  const color =
    timeRemaining > 60 ? "text-white" :
    timeRemaining > 30 ? "text-yellow-400" :
    "text-red-400"

  const pulse = timeRemaining <= 30 && status === "IN_PROGRESS"

  return (
    <div className="flex flex-col items-center justify-center bg-slate-900 border border-slate-800 rounded-xl p-4 min-w-[110px]">
      <div className={cn("text-4xl font-black font-mono tabular-nums leading-none", color, pulse && "animate-pulse")}>
        {status === "IN_PROGRESS" ? display : status === "PAUSED" ? "⏸" : "--"}
      </div>
      <div className="text-slate-400 text-xs mt-2 text-center truncate max-w-[100px]">
        {status === "IN_PROGRESS" && currentTeamName ? currentTeamName : status === "PAUSED" ? "Paused" : ""}
      </div>
    </div>
  )
}
