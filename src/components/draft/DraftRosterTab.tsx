"use client"

import { cn } from "@/lib/utils"
import { positionBadge } from "@/lib/ui"
import type { DraftState, RosterConfig } from "@/types/draft"

interface DraftRosterTabProps {
  draftState: DraftState | null
  myTeamId: string | null
  rosterConfig: RosterConfig
}

const ORDER = ["GK", "DEF", "MID", "FWD"] as const

export function DraftRosterTab({ draftState, myTeamId, rosterConfig }: DraftRosterTabProps) {
  const myPicks = (draftState?.picks ?? []).filter((p) => p.ownerTeamId === myTeamId)
  const totalSlots = rosterConfig.GK + rosterConfig.DEF + rosterConfig.MID + rosterConfig.FWD + rosterConfig.FLEX + rosterConfig.BENCH

  // Loose per-position guideline (starter slots; FLEX/BENCH absorb the rest).
  const target: Record<string, number> = {
    GK: rosterConfig.GK,
    DEF: rosterConfig.DEF,
    MID: rosterConfig.MID,
    FWD: rosterConfig.FWD,
  }

  if (myPicks.length === 0) {
    return <p className="text-muted-foreground text-xs text-center py-6">No picks yet — your selections will appear here.</p>
  }

  return (
    <div className="space-y-3 overflow-y-auto h-full pr-1">
      <p className="text-xs text-muted-foreground">
        {myPicks.length} / {totalSlots} drafted
      </p>
      {ORDER.map((pos) => {
        const group = myPicks.filter((p) => p.playerPosition === pos)
        return (
          <div key={pos}>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", positionBadge(pos))}>{pos}</span>
              <span className="text-muted-foreground text-[11px]">{group.length}/{target[pos]}</span>
            </div>
            {group.length === 0 ? (
              <p className="text-muted-foreground/70 text-[11px] pl-1">—</p>
            ) : (
              <ul className="space-y-0.5">
                {group.map((p) => (
                  <li key={p.id} className="text-xs text-foreground pl-1 truncate">
                    {p.playerName ?? "—"}
                    <span className="text-muted-foreground text-[10px]"> · R{p.round}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
