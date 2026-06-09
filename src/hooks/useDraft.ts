"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import type { DraftState, DraftChatMessage, QueueItem } from "@/types/draft"

interface UseDraftOptions {
  leagueId: string
  myTeamId: string | null
  draftId: string | null
}

export function useDraft({ leagueId, myTeamId, draftId }: UseDraftOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [chatMessages, setChatMessages] = useState<DraftChatMessage[]>([])
  const [onlineTeamIds, setOnlineTeamIds] = useState<string[]>([])

  const joinRoom = useCallback((socket: Socket) => {
    if (!myTeamId) return
    socket.emit("draft:join", { leagueId, teamId: myTeamId })
  }, [leagueId, myTeamId])

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000"
    const socket = io(`${socketUrl}/draft`, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on("connect", () => {
      setIsConnected(true)
      joinRoom(socket)
    })

    socket.on("disconnect", () => {
      setIsConnected(false)
    })

    socket.on("reconnect", () => {
      setIsConnected(true)
      joinRoom(socket)
    })

    socket.on("draft:state", (state: DraftState) => {
      setDraftState(state)
      setOnlineTeamIds(state.onlineTeamIds ?? [])
    })

    socket.on("draft:pick:made", ({ pick, nextTeamId, timeRemaining }) => {
      setDraftState(prev => {
        if (!prev) return prev
        return {
          ...prev,
          currentPick: prev.currentPick + 1,
          currentTeamId: nextTeamId,
          timeRemaining,
          picks: [...prev.picks, pick],
        }
      })
    })

    socket.on("draft:pick:timer", ({ timeRemaining, currentTeamId }) => {
      setDraftState(prev => {
        if (!prev) return prev
        return { ...prev, timeRemaining, currentTeamId: currentTeamId ?? prev.currentTeamId }
      })
    })

    socket.on("draft:pick:auto", ({ pick }) => {
      setDraftState(prev => {
        if (!prev) return prev
        return { ...prev, picks: [...prev.picks, pick] }
      })
    })

    socket.on("draft:queue:updated", ({ queue: newQueue }: { teamId: string; queue: QueueItem[] }) => {
      setQueue(newQueue)
    })

    socket.on("draft:chat:message", (msg: DraftChatMessage) => {
      setChatMessages(prev => [...prev, msg])
    })

    socket.on("draft:started", () => {
      setDraftState(prev => prev ? { ...prev, status: "IN_PROGRESS" } : prev)
    })

    socket.on("draft:paused", () => {
      setDraftState(prev => prev ? { ...prev, status: "PAUSED" } : prev)
    })

    socket.on("draft:resumed", () => {
      setDraftState(prev => prev ? { ...prev, status: "IN_PROGRESS" } : prev)
    })

    socket.on("draft:completed", () => {
      setDraftState(prev => prev ? { ...prev, status: "COMPLETED" } : prev)
    })

    socket.on("user:online", ({ teamId }: { teamId: string }) => {
      setOnlineTeamIds(prev => prev.includes(teamId) ? prev : [...prev, teamId])
    })

    socket.on("user:offline", ({ teamId }: { teamId: string }) => {
      setOnlineTeamIds(prev => prev.filter(id => id !== teamId))
    })

    return () => {
      socket.disconnect()
    }
  }, [leagueId, myTeamId, joinRoom])

  const makePick = useCallback((playerId: number) => {
    if (!draftId) return
    socketRef.current?.emit("draft:pick", { draftId, playerId })
  }, [draftId])

  const addToQueue = useCallback((playerId: number, priority: number) => {
    if (!draftId) return
    socketRef.current?.emit("draft:queue:add", { draftId, playerId, priority })
  }, [draftId])

  const removeFromQueue = useCallback((playerId: number) => {
    if (!draftId) return
    socketRef.current?.emit("draft:queue:remove", { draftId, playerId })
  }, [draftId])

  const reorderQueue = useCallback((playerIds: number[]) => {
    if (!draftId) return
    socketRef.current?.emit("draft:queue:reorder", { draftId, playerIds })
  }, [draftId])

  const sendChat = useCallback((content: string) => {
    if (!draftId || !content.trim()) return
    socketRef.current?.emit("draft:chat:send", { draftId, content: content.trim() })
  }, [draftId])

  const startDraft = useCallback(() => {
    if (!draftId) return
    socketRef.current?.emit("draft:start", { draftId })
  }, [draftId])

  const pauseDraft = useCallback(() => {
    if (!draftId) return
    socketRef.current?.emit("draft:pause", { draftId })
  }, [draftId])

  const resumeDraft = useCallback(() => {
    if (!draftId) return
    socketRef.current?.emit("draft:resume", { draftId })
  }, [draftId])

  const isMyTurn = myTeamId !== null && draftState?.currentTeamId === myTeamId && draftState?.status === "IN_PROGRESS"

  return {
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
  }
}
