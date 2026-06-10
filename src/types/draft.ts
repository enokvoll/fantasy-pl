
export interface DraftState {
  draftId: string
  leagueId: string
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED"
  currentPick: number
  currentRound: number
  currentTeamId: string | null
  timeRemaining: number
  pickOrder: string[] // teamId array for current round
  picks: DraftPickSummary[]
  teams: DraftTeamInfo[]
  onlineTeamIds: string[]
}

export interface DraftPickSummary {
  id: string
  round: number
  pickInRound: number
  overallPick: number
  ownerTeamId: string
  playerId: number | null
  playerName: string | null
  playerPosition: string | null
  isAutoPick: boolean
}

export interface DraftTeamInfo {
  id: string
  name: string
  draftOrder: number
  userId: string
  rosterCount: number
}

export interface DraftChatMessage {
  userId: string
  userName: string
  content: string
  timestamp: Date
}

// Socket.io event types
export interface ServerToClientEvents {
  "draft:state": (state: DraftState) => void
  "draft:pick:made": (data: { pick: DraftPickSummary; nextTeamId: string | null; timeRemaining: number }) => void
  "draft:pick:timer": (data: { timeRemaining: number; currentTeamId: string | null }) => void
  "draft:pick:auto": (data: { pick: DraftPickSummary }) => void
  "draft:queue:updated": (data: { teamId: string; queue: QueueItem[] }) => void
  "draft:chat:message": (message: DraftChatMessage) => void
  "draft:started": (data: { startedAt: Date }) => void
  "draft:paused": () => void
  "draft:resumed": () => void
  "draft:completed": (data: { completedAt: Date }) => void
  "draft:error": (data: { code: string; message: string }) => void
  "user:online": (data: { teamId: string }) => void
  "user:offline": (data: { teamId: string }) => void
}

export interface ClientToServerEvents {
  "draft:join": (data: { leagueId: string; teamId: string }) => void
  "draft:pick": (data: { draftId: string; playerId: number }) => void
  "draft:queue:add": (data: { draftId: string; playerId: number; priority: number }) => void
  "draft:queue:remove": (data: { draftId: string; playerId: number }) => void
  "draft:queue:reorder": (data: { draftId: string; playerIds: number[] }) => void
  "draft:chat:send": (data: { draftId: string; content: string }) => void
  "draft:start": (data: { draftId: string }) => void
  "draft:pause": (data: { draftId: string }) => void
  "draft:resume": (data: { draftId: string }) => void
}

export interface QueueItem {
  playerId: number
  playerName: string
  position: string
  priority: number
}

export interface RosterConfig {
  GK: number
  DEF: number
  MID: number
  FWD: number
  BENCH: number
  FLEX: number
}
