"use client"

import { cn } from "@/lib/utils"
import type { DraftState, DraftPickSummary } from "@/types/draft"

const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  DEF: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  MID: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  FWD: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
}

interface DraftBoardProps {
  draftState: DraftState
  myTeamId: string | null
  botTeamIds?: string[]
}

export function DraftBoard({ draftState, myTeamId, botTeamIds = [] }: DraftBoardProps) {
  const { picks, teams, currentPick, status, pickOrder, currentTeamId, onlineTeamIds } = draftState
  if (!teams.length) return null

  const n = teams.length
  const totalRounds = Math.ceil((picks.length > 0 || currentPick > 0)
    ? Math.max(picks.length, currentPick + 1) / n
    : 11)  // default 11 rounds

  // Build a pick map: overallPick (1-based) → DraftPickSummary
  const pickMap = new Map<number, DraftPickSummary>()
  for (const pick of picks) pickMap.set(pick.overallPick, pick)

  // Team order from pickOrder (array of teamIds)
  const teamOrder = pickOrder.length > 0
    ? pickOrder.map(id => teams.find(t => t.id === id)!).filter(Boolean)
    : teams

  return (
    <div className="overflow-auto h-full">
      <table className="text-xs border-collapse min-w-full">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="px-2 py-2 text-muted-foreground font-medium text-left w-8">Rd</th>
            {teamOrder.map(team => {
              const onClock = team.id === currentTeamId && status === "IN_PROGRESS"
              return (
                <th key={team.id}
                  className={cn(
                    "px-2 py-2 font-medium text-center min-w-[110px] max-w-[130px] border-b-2",
                    onClock ? "border-primary" : "border-transparent",
                    team.id === myTeamId ? "text-primary" : "text-foreground"
                  )}>
                  <div className="flex items-center justify-center gap-1 truncate">
                    {onlineTeamIds?.includes(team.id) && <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />}
                    {botTeamIds.includes(team.id) && <span className="text-xs">🤖</span>}
                    <span className="truncate">{team.name}</span>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRounds }, (_, roundIdx) => {
            const round = roundIdx + 1
            return (
              <tr key={round} className="border-t border-border">
                <td className="px-2 py-1.5 text-muted-foreground font-mono">{round}</td>
                {teamOrder.map((team, teamIdx) => {
                  // Snake: even rounds reverse order
                  const pickInRound = round % 2 === 0
                    ? teamOrder.length - teamIdx
                    : teamIdx + 1
                  const overallPick = (round - 1) * n + pickInRound
                  const pick = pickMap.get(overallPick)
                  const isCurrent = overallPick === currentPick + 1 && status === "IN_PROGRESS"
                  const isMyPick = team.id === myTeamId

                  return (
                    <td key={team.id}
                      className={cn(
                        "px-1.5 py-1 border border-transparent",
                        isCurrent && "border-primary/40 bg-primary/10 rounded"
                      )}>
                      {pick ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(
                            "font-medium truncate max-w-[96px] block",
                            isMyPick ? "text-primary" : "text-foreground"
                          )}>
                            {pick.playerName ?? "—"}
                          </span>
                          {pick.playerPosition && (
                            <span className={cn(
                              "text-[10px] px-1 py-0.5 rounded inline-block w-fit",
                              POS_COLORS[pick.playerPosition] ?? "bg-muted text-foreground"
                            )}>
                              {pick.playerPosition}
                            </span>
                          )}
                        </div>
                      ) : isCurrent ? (
                        <span className="text-primary font-medium animate-pulse">
                          On the clock…
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
