"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useDraft } from "@/hooks/useDraft"
import { DraftBoard } from "./DraftBoard"
import { DraftTimer } from "./DraftTimer"
import { PlayerSearchPanel } from "./PlayerSearchPanel"
import { DraftQueue } from "./DraftQueue"
import { DraftChat } from "./DraftChat"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RosterConfig } from "@/types/draft"

interface DraftRoomProps {
  leagueId: string
  initialDraftId: string | null
  myTeamId: string | null
  myTeamName: string
  isCommissioner: boolean
  teams: Array<{ id: string; name: string; draftOrder: number | null; userId: string; isBot: boolean }>
  rosterConfig: RosterConfig
}

export function DraftRoom({
  leagueId,
  initialDraftId,
  myTeamId,
  myTeamName,
  isCommissioner,
  teams,
}: DraftRoomProps) {
  const botTeamIds = teams.filter(t => t.isBot).map(t => t.id)
  const {
    isConnected,
    draftState,
    queue,
    chatMessages,
    setChatMessages,
    onlineTeamIds,
    isMyTurn,
    makePick,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    sendChat,
    startDraft,
    pauseDraft,
    resumeDraft,
  } = useDraft({ leagueId, myTeamId, draftId: initialDraftId })

  // Load chat history on mount
  useEffect(() => {
    fetch(`/api/draft/${leagueId}/chat`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) setChatMessages(data.messages)
      })
  }, [leagueId, setChatMessages])

  const status = draftState?.status ?? "PENDING"
  const currentTeam = draftState?.teams.find(t => t.id === draftState.currentTeamId)
  const picksCount = draftState?.picks.length ?? 0

  // ── Draft complete ──────────────────────────────────────────
  if (status === "COMPLETED") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-5xl mb-4">🏆</p>
        <h2 className="text-2xl font-black text-white mb-2">Draft Complete!</h2>
        <p className="text-slate-400 mb-6">{picksCount} picks made across {teams.length} teams</p>
        <div className="flex gap-3">
          <Link href={`/league/${leagueId}/roster`} className={cn(buttonVariants(), "bg-emerald-500 hover:bg-emerald-400 text-white font-semibold")}>
            View my roster
          </Link>
          <Link href={`/league/${leagueId}`} className={cn(buttonVariants({ variant: "outline" }), "border-slate-700 text-slate-300 hover:bg-slate-800")}>
            League overview
          </Link>
        </div>
      </div>
    )
  }

  // ── Waiting to start ────────────────────────────────────────
  if (status === "PENDING") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-5xl mb-4">🎯</p>
        <h2 className="text-2xl font-black text-white mb-2">Draft Room</h2>
        <p className="text-slate-400 mb-2">
          {teams.length} team{teams.length !== 1 ? "s" : ""} registered
        </p>
        <div className="flex gap-2 justify-center mb-6 flex-wrap">
          {teams.map(team => (
            <Badge key={team.id}
              className={cn(
                "text-xs border-0",
                team.id === myTeamId ? "bg-emerald-600/20 text-emerald-400" :
                onlineTeamIds.includes(team.id) ? "bg-slate-700 text-slate-300" : "bg-slate-800/50 text-slate-500"
              )}>
              {team.name}
              {onlineTeamIds.includes(team.id) && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6 text-sm text-slate-400">
          <span className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-400" : "bg-red-400")} />
          {isConnected ? "Connected to draft room" : "Connecting…"}
        </div>
        {isCommissioner ? (
          <button
            onClick={startDraft}
            disabled={!isConnected}
            className="px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-lg transition-colors">
            Start Draft
          </button>
        ) : (
          <p className="text-slate-500 text-sm">Waiting for the commissioner to start the draft…</p>
        )}
      </div>
    )
  }

  // ── Active draft ─────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Top bar: status + pick order + commissioner controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={cn(
          "border-0 text-xs",
          status === "IN_PROGRESS" ? "bg-emerald-600/20 text-emerald-400" :
          "bg-yellow-600/20 text-yellow-400"
        )}>
          {status === "IN_PROGRESS" ? "Live" : "Paused"}
        </Badge>
        <span className="text-slate-400 text-xs">Pick {(draftState?.currentPick ?? 0) + 1}</span>
        {currentTeam && (
          <span className={cn(
            "text-xs font-medium",
            currentTeam.id === myTeamId ? "text-emerald-400" : "text-slate-300"
          )}>
            {currentTeam.id === myTeamId ? "🟢 Your pick!" : `${currentTeam.name}'s pick`}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className={cn("w-2 h-2 rounded-full shrink-0", isConnected ? "bg-emerald-400" : "bg-red-400")} />
          {isCommissioner && (
            status === "IN_PROGRESS" ? (
              <button onClick={pauseDraft} className="text-xs px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
                ⏸ Pause
              </button>
            ) : (
              <button onClick={resumeDraft} className="text-xs px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                ▶ Resume
              </button>
            )
          )}
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left: board */}
        <div className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-3 overflow-auto">
          <p className="text-slate-400 text-xs font-medium mb-2">Draft Board</p>
          {draftState && (
            <DraftBoard draftState={draftState} myTeamId={myTeamId} botTeamIds={botTeamIds} />
          )}
        </div>

        {/* Right: timer + search + queue + chat */}
        <div className="w-72 shrink-0 flex flex-col gap-2 min-h-0">
          {/* Timer */}
          <DraftTimer
            timeRemaining={draftState?.timeRemaining ?? 0}
            currentTeamName={currentTeam?.name ?? null}
            status={status}
          />

          {/* Player search */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col min-h-0" style={{ maxHeight: "320px" }}>
            <p className="text-slate-400 text-xs font-medium mb-2">Available Players</p>
            {isMyTurn && (
              <div className="mb-2 px-2 py-1 rounded bg-emerald-600/20 border border-emerald-600/30">
                <p className="text-emerald-400 text-xs font-medium">It&apos;s your turn to pick!</p>
              </div>
            )}
            <PlayerSearchPanel
              leagueId={leagueId}
              isMyTurn={isMyTurn}
              onPick={makePick}
              onAddToQueue={(playerId, priority) => addToQueue(playerId, priority)}
              picksMade={picksCount}
            />
          </div>

          {/* Queue */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <p className="text-slate-400 text-xs font-medium mb-2">
              Auto-pick Queue <span className="text-slate-600">({queue.length})</span>
            </p>
            <DraftQueue queue={queue} onRemove={removeFromQueue} onReorder={reorderQueue} />
          </div>

          {/* Chat */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col" style={{ maxHeight: "200px" }}>
            <p className="text-slate-400 text-xs font-medium mb-2">Chat</p>
            <DraftChat messages={chatMessages} onSend={sendChat} myTeamName={myTeamName} />
          </div>
        </div>
      </div>
    </div>
  )
}
