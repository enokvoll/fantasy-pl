import { Server } from "socket.io"
import type { Server as HttpServer } from "http"
import { prisma } from "@/lib/prisma"
import { makePick, getAutoPickPlayer, getTeamForPick } from "@/lib/draft-engine"
import type { ServerToClientEvents, ClientToServerEvents, DraftState, RosterConfig } from "@/types/draft"

const draftTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      credentials: true,
    },
    transports: ["websocket", "polling"],
  })

  const draft = io.of("/draft")

  draft.on("connection", (socket) => {
    socket.on("draft:join", async ({ leagueId, teamId }) => {
      socket.join(`draft:${leagueId}`)
      socket.data.leagueId = leagueId
      socket.data.teamId = teamId

      try {
        const state = await buildDraftState(leagueId)
        socket.emit("draft:state", state)
        draft.to(`draft:${leagueId}`).emit("user:online", { teamId })
      } catch (e) {
        socket.emit("draft:error", { code: "STATE_ERROR", message: String(e) })
      }
    })

    socket.on("draft:start", async ({ draftId }) => {
      try {
        const draftRecord = await prisma.draft.findUniqueOrThrow({
          where: { id: draftId },
          include: { league: true },
        })

        await prisma.draft.update({
          where: { id: draftId },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        })

        const state = await buildDraftState(draftRecord.leagueId)
        draft.to(`draft:${draftRecord.leagueId}`).emit("draft:state", state)
        draft.to(`draft:${draftRecord.leagueId}`).emit("draft:started", { startedAt: new Date() })

        startPickTimer(io, draftId, draftRecord.leagueId, draftRecord.league.draftPickTimeSeconds)
      } catch (e) {
        socket.emit("draft:error", { code: "START_ERROR", message: String(e) })
      }
    })

    socket.on("draft:pick", async ({ draftId, playerId }) => {
      const teamId = socket.data.teamId as string
      const leagueId = socket.data.leagueId as string

      try {
        const result = await makePick(draftId, teamId, playerId, false)
        clearPickTimer(draftId)

        const state = await buildDraftState(leagueId)
        const latestPick = state.picks[state.picks.length - 1]

        draft.to(`draft:${leagueId}`).emit("draft:pick:made", {
          pick: latestPick,
          nextTeamId: result.nextTeamId,
          timeRemaining: result.pickTimeSeconds,
        })
        draft.to(`draft:${leagueId}`).emit("draft:state", state)

        if (result.nextTeamId) {
          startPickTimer(io, draftId, leagueId, result.pickTimeSeconds)
        } else {
          draft.to(`draft:${leagueId}`).emit("draft:completed", { completedAt: new Date() })
        }
      } catch (e) {
        socket.emit("draft:error", { code: "PICK_ERROR", message: String(e) })
      }
    })

    socket.on("draft:queue:add", async ({ draftId, playerId, priority }) => {
      const teamId = socket.data.teamId as string
      try {
        await prisma.draftQueue.upsert({
          where: { draftId_teamId_playerId: { draftId, teamId, playerId } },
          create: { draftId, teamId, playerId, priority },
          update: { priority },
        })
        const queue = await getQueueItems(draftId, teamId)
        socket.emit("draft:queue:updated", { teamId, queue })
      } catch (e) {
        socket.emit("draft:error", { code: "QUEUE_ERROR", message: String(e) })
      }
    })

    socket.on("draft:queue:remove", async ({ draftId, playerId }) => {
      const teamId = socket.data.teamId as string
      try {
        await prisma.draftQueue.deleteMany({ where: { draftId, teamId, playerId } })
        const queue = await getQueueItems(draftId, teamId)
        socket.emit("draft:queue:updated", { teamId, queue })
      } catch (e) {
        socket.emit("draft:error", { code: "QUEUE_ERROR", message: String(e) })
      }
    })

    socket.on("draft:queue:reorder", async ({ draftId, playerIds }) => {
      const teamId = socket.data.teamId as string
      try {
        await Promise.all(
          playerIds.map((playerId: number, index: number) =>
            prisma.draftQueue.updateMany({
              where: { draftId, teamId, playerId },
              data: { priority: index },
            })
          )
        )
        const queue = await getQueueItems(draftId, teamId)
        socket.emit("draft:queue:updated", { teamId, queue })
      } catch (e) {
        socket.emit("draft:error", { code: "QUEUE_ERROR", message: String(e) })
      }
    })

    socket.on("draft:chat:send", async ({ draftId, content }) => {
      const leagueId = socket.data.leagueId as string
      try {
        const draftRecord = await prisma.draft.findUniqueOrThrow({
          where: { id: draftId },
          include: { league: { include: { teams: { include: { user: true } } } } },
        })
        const team = draftRecord.league.teams.find((t) => t.id === socket.data.teamId)
        const user = team?.user

        if (!user) return

        await prisma.draftMessage.create({
          data: { draftId, userId: user.id, content },
        })

        draft.to(`draft:${leagueId}`).emit("draft:chat:message", {
          userId: user.id,
          userName: user.name ?? "Unknown",
          content,
          timestamp: new Date(),
        })
      } catch (e) {
        socket.emit("draft:error", { code: "CHAT_ERROR", message: String(e) })
      }
    })

    socket.on("draft:pause", async ({ draftId }) => {
      try {
        clearPickTimer(draftId)
        await prisma.draft.update({ where: { id: draftId }, data: { status: "PAUSED" } })
        const leagueId = socket.data.leagueId as string
        draft.to(`draft:${leagueId}`).emit("draft:paused")
      } catch (e) {
        socket.emit("draft:error", { code: "PAUSE_ERROR", message: String(e) })
      }
    })

    socket.on("draft:resume", async ({ draftId }) => {
      try {
        const draftRecord = await prisma.draft.findUniqueOrThrow({
          where: { id: draftId },
          include: { league: true },
        })
        await prisma.draft.update({ where: { id: draftId }, data: { status: "IN_PROGRESS" } })
        const leagueId = draftRecord.leagueId
        draft.to(`draft:${leagueId}`).emit("draft:resumed")
        startPickTimer(io, draftId, leagueId, draftRecord.league.draftPickTimeSeconds)
      } catch (e) {
        socket.emit("draft:error", { code: "RESUME_ERROR", message: String(e) })
      }
    })

    socket.on("disconnect", () => {
      const leagueId = socket.data.leagueId as string | undefined
      const teamId = socket.data.teamId as string | undefined
      if (leagueId && teamId) {
        draft.to(`draft:${leagueId}`).emit("user:offline", { teamId })
      }
    })
  })

  return io
}

function startPickTimer(
  io: Server,
  draftId: string,
  leagueId: string,
  seconds: number
): void {
  clearPickTimer(draftId)

  const draftNs = io.of("/draft")
  let remaining = seconds

  const tick = setInterval(() => {
    remaining--
    draftNs.to(`draft:${leagueId}`).emit("draft:pick:timer", {
      timeRemaining: remaining,
      currentTeamId: null,
    })
    if (remaining <= 0) clearInterval(tick)
  }, 1000)

  const timer = setTimeout(async () => {
    clearInterval(tick)
    try {
      const draftRecord = await prisma.draft.findUnique({
        where: { id: draftId },
        include: {
          league: { include: { teams: { orderBy: { draftOrder: "asc" } } } },
        },
      })
      if (!draftRecord || draftRecord.status !== "IN_PROGRESS") return

      const teamIds = draftRecord.league.teams.map((t) => t.id)
      const currentTeamId = getTeamForPick(teamIds, draftRecord.currentPick)
      const rosterConfig = draftRecord.league.rosterConfig as unknown as RosterConfig

      const playerId = await getAutoPickPlayer(currentTeamId, draftId, rosterConfig)
      const result = await makePick(draftId, currentTeamId, playerId, true)

      const state = await buildDraftState(leagueId)
      const latestPick = state.picks[state.picks.length - 1]

      draftNs.to(`draft:${leagueId}`).emit("draft:pick:auto", { pick: latestPick })
      draftNs.to(`draft:${leagueId}`).emit("draft:state", state)

      if (result.nextTeamId) {
        startPickTimer(io, draftId, leagueId, result.pickTimeSeconds)
      } else {
        draftNs.to(`draft:${leagueId}`).emit("draft:completed", { completedAt: new Date() })
      }
    } catch (e) {
      console.error("Auto-pick error:", e)
    }
  }, seconds * 1000)

  draftTimers.set(draftId, timer)
}

function clearPickTimer(draftId: string): void {
  const timer = draftTimers.get(draftId)
  if (timer) {
    clearTimeout(timer)
    draftTimers.delete(draftId)
  }
}

async function buildDraftState(leagueId: string): Promise<DraftState> {
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { leagueId },
    include: {
      league: { include: { teams: { orderBy: { draftOrder: "asc" }, include: { rosterSlots: true } } } },
      picks: {
        include: { player: true },
        orderBy: { overallPick: "asc" },
      },
    },
  })

  const teams = draft.league.teams
  const teamIds = teams.map((t) => t.id)

  const currentTeamId =
    draft.status === "IN_PROGRESS"
      ? getTeamForPick(teamIds, draft.currentPick)
      : null

  const timer = draftTimers.get(draft.id)
  const timeRemaining = timer ? draft.league.draftPickTimeSeconds : 0

  return {
    draftId: draft.id,
    leagueId,
    status: draft.status,
    currentPick: draft.currentPick,
    currentRound: draft.currentRound,
    currentTeamId,
    timeRemaining,
    pickOrder: teamIds,
    picks: draft.picks.map((p) => ({
      id: p.id,
      round: p.round,
      pickInRound: p.pickInRound,
      overallPick: p.overallPick,
      ownerTeamId: p.ownerTeamId,
      playerId: p.playerId,
      playerName: p.player?.webName ?? null,
      playerPosition: p.player?.position ?? null,
      isAutoPick: p.isAutoPick,
    })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      draftOrder: t.draftOrder ?? 0,
      userId: t.userId,
      rosterCount: t.rosterSlots.filter((s) => s.playerId !== null).length,
    })),
    onlineTeamIds: [],
  }
}

async function getQueueItems(draftId: string, teamId: string) {
  const items = await prisma.draftQueue.findMany({
    where: { draftId, teamId },
    orderBy: { priority: "asc" },
    include: { draft: { include: { league: true } } },
  })

  const players = await prisma.player.findMany({
    where: { id: { in: items.map((i) => i.playerId) } },
  })
  const playerMap = new Map(players.map((p) => [p.id, p]))

  return items.map((item) => ({
    playerId: item.playerId,
    playerName: playerMap.get(item.playerId)?.webName ?? "Unknown",
    position: playerMap.get(item.playerId)?.position ?? "GK",
    priority: item.priority,
  }))
}
