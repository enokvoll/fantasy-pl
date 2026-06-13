"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDraft } from "@/hooks/useDraft"
import { DraftBoard } from "./DraftBoard"
import { DraftTimer } from "./DraftTimer"
import { PlayerTable, type FplTeamOption } from "./PlayerTable"
import { DraftQueue } from "./DraftQueue"
import { DraftRosterTab } from "./DraftRosterTab"
import { DraftChat } from "./DraftChat"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
  isYouthDraft?: boolean
  fplTeams: FplTeamOption[]
}

export function DraftRoom({
  leagueId,
  initialDraftId,
  myTeamId,
  myTeamName,
  isCommissioner,
  teams,
  rosterConfig,
  isYouthDraft = false,
  fplTeams,
}: DraftRoomProps) {
  const router = useRouter()
  const botTeamIds = teams.filter(t => t.isBot).map(t => t.id)
  const {
    isConnected,
    draftState,
    queue,
    shortlist,
    chatMessages,
    setChatMessages,
    onlineTeamIds,
    isMyTurn,
    myAutoPickEnabled,
    makePick,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    addToShortlist,
    removeFromShortlist,
    toggleAutoPick,
    sendChat,
    startDraft,
    pauseDraft,
    resumeDraft,
    autoFinishDraft,
  } = useDraft({
    leagueId,
    myTeamId,
    draftId: initialDraftId,
    onFinalized: (nextPhase) => {
      // Season open → go set the first lineup. Youth draft still to come →
      // back to the overview where the commissioner starts it.
      if (nextPhase === "SEASON") {
        router.push(`/league/${leagueId}/roster`)
      } else {
        router.push(`/league/${leagueId}`)
        router.refresh()
      }
    },
  })

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
        <h2 className="text-2xl font-bold text-foreground mb-2">Draft Complete!</h2>
        <p className="text-muted-foreground mb-6">{picksCount} picks made across {teams.length} teams</p>
        <div className="flex gap-3">
          <Link href={`/league/${leagueId}/roster`} className={cn(buttonVariants(), "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold")}>
            View my roster
          </Link>
          <Link href={`/league/${leagueId}`} className={cn(buttonVariants({ variant: "outline" }), "border-border text-foreground hover:bg-muted")}>
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
        <h2 className="text-2xl font-bold text-foreground mb-2">Draft Room</h2>
        <p className="text-muted-foreground mb-2">
          {teams.length} team{teams.length !== 1 ? "s" : ""} registered
        </p>
        <div className="flex gap-2 justify-center mb-6 flex-wrap">
          {teams.map(team => (
            <Badge key={team.id}
              className={cn(
                "text-xs border-0",
                team.id === myTeamId ? "bg-primary/20 text-primary" :
                onlineTeamIds.includes(team.id) ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"
              )}>
              {team.name}
              {onlineTeamIds.includes(team.id) && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary" />}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <span className={cn("w-2 h-2 rounded-full", isConnected ? "bg-primary" : "bg-red-400")} />
          {isConnected ? "Connected to draft room" : "Connecting…"}
        </div>
        {isCommissioner ? (
          <button
            onClick={startDraft}
            disabled={!isConnected}
            className="px-8 py-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold text-lg transition-colors">
            Start Draft
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">Waiting for the commissioner to start the draft…</p>
        )}
      </div>
    )
  }

  // ── Active draft ─────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Top bar: status + whose turn + timer + commissioner controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={cn(
          "border-0 text-xs",
          status === "IN_PROGRESS" ? "bg-primary/20 text-primary" :
          "bg-yellow-600/20 text-yellow-400"
        )}>
          {status === "IN_PROGRESS" ? "Live" : "Paused"}
        </Badge>
        <span className="text-muted-foreground text-xs">Pick {(draftState?.currentPick ?? 0) + 1}</span>
        {currentTeam && (
          <span className={cn(
            "text-xs font-medium",
            currentTeam.id === myTeamId ? "text-primary" : "text-foreground"
          )}>
            {currentTeam.id === myTeamId ? "🟢 Your pick!" : `${currentTeam.name}'s pick`}
          </span>
        )}
        {isYouthDraft && (
          <Badge className="border-0 text-xs bg-accent2/15 text-accent2">🌱 Youth draft</Badge>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <DraftTimer
            timeRemaining={draftState?.timeRemaining ?? 0}
            currentTeamName={currentTeam?.name ?? null}
            status={status}
            compact
          />
          <span className={cn("w-2 h-2 rounded-full shrink-0", isConnected ? "bg-primary" : "bg-red-400")} />
          {isCommissioner && (
            status === "IN_PROGRESS" ? (
              <button onClick={pauseDraft} className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted text-muted-foreground transition-colors">
                ⏸ Pause
              </button>
            ) : (
              <button onClick={resumeDraft} className="text-xs px-2 py-0.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors">
                ▶ Resume
              </button>
            )
          )}
          {isCommissioner && (
            <button
              onClick={autoFinishDraft}
              title="Auto-pick all remaining picks of this draft"
              className="text-xs px-2 py-0.5 rounded bg-accent2/20 hover:bg-accent2/30 text-accent2 transition-colors">
              ⏭ Auto-finish
            </button>
          )}
        </div>
      </div>

      {/* Top half: draft board (teams as columns) */}
      <div className="flex-[5] min-h-0 bg-card border border-border rounded-xl p-3 flex flex-col">
        <p className="text-muted-foreground text-xs font-medium mb-2">Draft Board</p>
        <div className="flex-1 min-h-0">
          {draftState && (
            <DraftBoard draftState={draftState} myTeamId={myTeamId} botTeamIds={botTeamIds} />
          )}
        </div>
      </div>

      {/* Bottom half: tabs (left) + player table (right) */}
      <div className="flex gap-3 flex-[4] min-h-0">
        {/* Bottom-left: Roster / Queue / Chat */}
        <div className="w-[36%] min-w-0 bg-card border border-border rounded-xl p-3 flex flex-col min-h-0">
          <Tabs defaultValue="roster" className="flex flex-col h-full min-h-0 gap-2">
            <TabsList className="w-full">
              <TabsTrigger value="roster">Roster</TabsTrigger>
              <TabsTrigger value="queue">Queue {queue.length > 0 && `(${queue.length})`}</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>

            <TabsContent value="roster" className="min-h-0">
              <DraftRosterTab draftState={draftState} myTeamId={myTeamId} rosterConfig={rosterConfig} />
            </TabsContent>

            <TabsContent value="queue" className="min-h-0 flex flex-col">
              {myTeamId && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs text-muted-foreground">Auto-pick when it&apos;s your turn</span>
                  <button
                    onClick={() => toggleAutoPick(!myAutoPickEnabled)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded font-semibold transition-colors",
                      myAutoPickEnabled ? "bg-success/20 text-success" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}>
                    Auto-pick {myAutoPickEnabled ? "ON" : "OFF"}
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <DraftQueue queue={queue} onRemove={removeFromQueue} onReorder={reorderQueue} />
              </div>
            </TabsContent>

            <TabsContent value="chat" className="min-h-0">
              <DraftChat messages={chatMessages} onSend={sendChat} myTeamName={myTeamName} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Bottom-right: player table */}
        <div className="flex-1 min-w-0 bg-card border border-border rounded-xl p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-xs font-medium">Players</p>
            {isMyTurn && <span className="text-primary text-xs font-medium">It&apos;s your pick!</span>}
          </div>
          <PlayerTable
            leagueId={leagueId}
            isMyTurn={isMyTurn}
            onPick={makePick}
            picksMade={picksCount}
            draftState={draftState}
            shortlist={shortlist}
            onShortlistAdd={addToShortlist}
            onShortlistRemove={removeFromShortlist}
            onAddToQueue={addToQueue}
            fplTeams={fplTeams}
            prospectOnly={isYouthDraft}
          />
        </div>
      </div>
    </div>
  )
}
