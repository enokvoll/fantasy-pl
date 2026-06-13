import { Server } from "socket.io"
import type { Server as HttpServer } from "http"
import { prisma } from "@/lib/prisma"
import { makePick, getAutoPickPlayer, getTeamForPick } from "@/lib/draft-engine"
import { finishDraftPicks, finalizeDraftCompletion } from "@/lib/draft-flow"
import type { DraftState, RosterConfig } from "@/types/draft"

const draftTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Bots pick almost immediately — just enough of a beat for the board to animate
// between picks (they no longer ride the full human pick timer).
const BOT_PICK_DELAY_MS = 300

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

        // Load this team's saved queue + shortlist so they show on entry.
        const draftRow = await prisma.draft.findFirst({ where: { leagueId }, select: { id: true } })
        if (draftRow && teamId) {
          socket.emit("draft:queue:updated", { teamId, queue: await getQueueItems(draftRow.id, teamId) })
          socket.emit("draft:shortlist:updated", { teamId, playerIds: await getShortlist(draftRow.id, teamId) })
        }
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

        // Bot on the clock → pick immediately; human → start the pick timer.
        await advanceToNextPicker(
          io,
          draftId,
          draftRecord.leagueId,
          state.currentTeamId,
          draftRecord.league.draftPickTimeSeconds
        )
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

        await advanceToNextPicker(io, draftId, leagueId, result.nextTeamId, result.pickTimeSeconds)
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

    // ── Shortlist (loose "star" set, separate from the ordered queue) ──────────
    socket.on("draft:shortlist:add", async ({ draftId, playerId }) => {
      const teamId = socket.data.teamId as string
      try {
        await prisma.draftShortlist.upsert({
          where: { draftId_teamId_playerId: { draftId, teamId, playerId } },
          create: { draftId, teamId, playerId },
          update: {},
        })
        socket.emit("draft:shortlist:updated", { teamId, playerIds: await getShortlist(draftId, teamId) })
      } catch (e) {
        socket.emit("draft:error", { code: "SHORTLIST_ERROR", message: String(e) })
      }
    })

    socket.on("draft:shortlist:remove", async ({ draftId, playerId }) => {
      const teamId = socket.data.teamId as string
      try {
        await prisma.draftShortlist.deleteMany({ where: { draftId, teamId, playerId } })
        socket.emit("draft:shortlist:updated", { teamId, playerIds: await getShortlist(draftId, teamId) })
      } catch (e) {
        socket.emit("draft:error", { code: "SHORTLIST_ERROR", message: String(e) })
      }
    })

    // ── Auto-pick toggle: a human manager picks like a bot on their turn ───────
    socket.on("draft:auto-pick:toggle", async ({ draftId, enabled }) => {
      const teamId = socket.data.teamId as string
      const leagueId = socket.data.leagueId as string
      try {
        await prisma.team.update({ where: { id: teamId }, data: { autoPickEnabled: enabled } })

        const state = await buildDraftState(leagueId)
        draft.to(`draft:${leagueId}`).emit("draft:state", state)

        // If enabling while it's already this team's turn, pick right away.
        if (enabled && state.status === "IN_PROGRESS" && state.currentTeamId === teamId) {
          clearPickTimer(draftId)
          await scheduleIfBot(io, draftId, leagueId, teamId)
        }
      } catch (e) {
        socket.emit("draft:error", { code: "AUTO_PICK_ERROR", message: String(e) })
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

    // Commissioner-only: auto-pick every remaining pick of the *current* draft.
    socket.on("draft:auto-finish", async ({ draftId }) => {
      const leagueId = socket.data.leagueId as string
      const teamId = socket.data.teamId as string
      try {
        const draftRecord = await prisma.draft.findUniqueOrThrow({
          where: { id: draftId },
          include: { league: { include: { teams: { orderBy: { createdAt: "asc" } } } } },
        })
        const commissioner = draftRecord.league.teams[0]
        if (!commissioner || commissioner.id !== teamId) {
          socket.emit("draft:error", {
            code: "FORBIDDEN",
            message: "Only the commissioner can auto-finish the draft",
          })
          return
        }

        clearPickTimer(draftId)
        await finishDraftPicks(draftId)

        const state = await buildDraftState(leagueId)
        draft.to(`draft:${leagueId}`).emit("draft:state", state)

        // Only run the post-draft transition if the draft actually completed
        // (e.g. it won't if the pool ran dry mid-way).
        const after = await prisma.draft.findUnique({ where: { id: draftId } })
        if (after?.status === "COMPLETED") {
          await finalizeAndBroadcast(io, leagueId)
        }
      } catch (e) {
        socket.emit("draft:error", { code: "AUTO_FINISH_ERROR", message: String(e) })
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
      const snake = !((draftRecord.isRookieDraft || draftRecord.isYouthDraft) && draftRecord.league.rookieDraftOrder === "REVERSE_STANDINGS")
      const currentTeamId = getTeamForPick(teamIds, draftRecord.currentPick, snake)
      const rosterConfig = draftRecord.league.rosterConfig as unknown as RosterConfig

      const playerId = await getAutoPickPlayer(currentTeamId, draftId, rosterConfig)
      const result = await makePick(draftId, currentTeamId, playerId, true)

      const state = await buildDraftState(leagueId)
      const latestPick = state.picks[state.picks.length - 1]

      draftNs.to(`draft:${leagueId}`).emit("draft:pick:auto", { pick: latestPick })
      draftNs.to(`draft:${leagueId}`).emit("draft:state", state)

      await advanceToNextPicker(io, draftId, leagueId, result.nextTeamId, result.pickTimeSeconds)
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

/**
 * If the current-turn team is an auto-picker — a bot, or a human who toggled
 * auto-pick — schedule its pick after a short delay.
 */
async function scheduleIfBot(
  io: Server,
  draftId: string,
  leagueId: string,
  nextTeamId: string | null
): Promise<void> {
  if (!nextTeamId) return

  const team = await prisma.team.findUnique({ where: { id: nextTeamId } })
  if (!team?.isBot && !team?.autoPickEnabled) return

  setTimeout(async () => {
    const draftRecord = await prisma.draft.findUnique({
      where: { id: draftId },
      include: { league: { include: { teams: { orderBy: { draftOrder: "asc" } } } } },
    })
    if (!draftRecord || draftRecord.status !== "IN_PROGRESS") return

    const rosterConfig = draftRecord.league.rosterConfig as unknown as RosterConfig
    const draftNs = io.of("/draft")

    try {
      const playerId = await getAutoPickPlayer(nextTeamId, draftId, rosterConfig)
      const result = await makePick(draftId, nextTeamId, playerId, true)
      clearPickTimer(draftId)

      const state = await buildDraftState(leagueId)
      const latestPick = state.picks[state.picks.length - 1]

      draftNs.to(`draft:${leagueId}`).emit("draft:pick:auto", { pick: latestPick })
      draftNs.to(`draft:${leagueId}`).emit("draft:pick:made", {
        pick: latestPick,
        nextTeamId: result.nextTeamId,
        timeRemaining: result.pickTimeSeconds,
      })
      draftNs.to(`draft:${leagueId}`).emit("draft:state", state)

      await advanceToNextPicker(io, draftId, leagueId, result.nextTeamId, result.pickTimeSeconds)
    } catch (e) {
      console.error("Bot auto-pick error:", e)
    }
  }, BOT_PICK_DELAY_MS)
}

/**
 * Single decision point for "who picks next": finish the draft when there is no
 * next team, fast-path bots (short delay), or arm the human pick timer. Every
 * pick path (manual, bot, timer-expiry) funnels through here so bots can never
 * end up sitting on the full human timer.
 */
async function advanceToNextPicker(
  io: Server,
  draftId: string,
  leagueId: string,
  nextTeamId: string | null,
  pickTimeSeconds: number
): Promise<void> {
  if (!nextTeamId) {
    await finalizeAndBroadcast(io, leagueId)
    return
  }

  const nextTeam = await prisma.team.findUnique({ where: { id: nextTeamId } })
  if (nextTeam?.isBot || nextTeam?.autoPickEnabled) {
    await scheduleIfBot(io, draftId, leagueId, nextTeamId)
  } else {
    startPickTimer(io, draftId, leagueId, pickTimeSeconds)
  }
}

/**
 * Draft just completed: announce it, run the post-draft transition (generate the
 * H2H schedule + open the season, or pause for the dynasty youth draft), then
 * broadcast the final state and the resulting phase so clients can route.
 */
async function finalizeAndBroadcast(io: Server, leagueId: string): Promise<void> {
  const draftNs = io.of("/draft")
  draftNs.to(`draft:${leagueId}`).emit("draft:completed", { completedAt: new Date() })
  try {
    const { nextPhase } = await finalizeDraftCompletion(leagueId, { pauseForYouth: true })
    const state = await buildDraftState(leagueId)
    draftNs.to(`draft:${leagueId}`).emit("draft:state", state)
    draftNs.to(`draft:${leagueId}`).emit("draft:finalized", { nextPhase })
  } catch (e) {
    console.error("Finalize draft error:", e)
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

  const snake = !((draft.isRookieDraft || draft.isYouthDraft) && draft.league.rookieDraftOrder === "REVERSE_STANDINGS")
  const currentTeamId =
    draft.status === "IN_PROGRESS"
      ? getTeamForPick(teamIds, draft.currentPick, snake)
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
      autoPickEnabled: t.autoPickEnabled,
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

async function getShortlist(draftId: string, teamId: string): Promise<number[]> {
  const items = await prisma.draftShortlist.findMany({
    where: { draftId, teamId },
    select: { playerId: true },
  })
  return items.map((i) => i.playerId)
}
