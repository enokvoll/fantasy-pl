"use client"

import { cn } from "@/lib/utils"
import type { DraftState, DraftTeamInfo, DraftPickSummary } from "@/types/draft"

const POS_COLORS: Record<string, string> = {
  GK: "bg-yellow-600/20 text-yellow-400",
  DEF: "bg-blue-600/20 text-blue-400",
  MID: "bg-emerald-600/20 text-emerald-400",
  FWD: "bg-red-600/20 text-red-400",
}

interface DraftBoardProps {
  draftState: DraftState
  myTeamId: string | null
  botTeamIds?: string[]
}

export function DraftBoard({ draftState, myTeamId, botTeamIds = [] }: DraftBoardProps) {
  const { picks, teams, currentPick, status, pickOrder } = draftState
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
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            <th className="px-2 py-2 text-slate-500 font-medium text-left w-8">Rd</th>
            {teamOrder.map(team => (
              <th key={team.id}
                className={cn(
                  "px-2 py-2 font-medium text-center min-w-[100px] max-w-[120px]",
                  team.id === myTeamId ? "text-emerald-400" : "text-slate-300"
                )}>
                <div className="truncate">
                  {botTeamIds.includes(team.id) && <span className="mr-1 text-xs">🤖</span>}
                  {team.name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRounds }, (_, roundIdx) => {
            const round = roundIdx + 1
            return (
              <tr key={round} className="border-t border-slate-800/50">
                <td className="px-2 py-1.5 text-slate-600 font-mono">{round}</td>
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
                        isCurrent && "border-emerald-500 bg-emerald-500/10 rounded"
                      )}>
                      {pick ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(
                            "font-medium truncate max-w-[96px] block",
                            isMyPick ? "text-emerald-300" : "text-slate-200"
                          )}>
                            {pick.playerName ?? "—"}
                          </span>
                          {pick.playerPosition && (
                            <span className={cn(
                              "text-[10px] px-1 py-0.5 rounded inline-block w-fit",
                              POS_COLORS[pick.playerPosition] ?? "bg-slate-700 text-slate-300"
                            )}>
                              {pick.playerPosition}
                            </span>
                          )}
                        </div>
                      ) : isCurrent ? (
                        <span className="text-emerald-400 font-medium animate-pulse">
                          On the clock…
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
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
