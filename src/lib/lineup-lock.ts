import { prisma } from "@/lib/prisma"

/**
 * Live-substitution locking.
 *
 * Lock rule (all game modes): a rostered player is locked the moment their real
 * club's fixture in the current gameweek kicks off (`Fixture.started === true`,
 * with a `kickoffTime <= now` fallback). Players whose club plays in a later
 * fixture stay swappable, so managers can keep subbing throughout the gameweek.
 */

/** FPL team ids whose gameweek fixture has already kicked off. */
export async function getLockedTeamIds(gameweekId: number): Promise<Set<number>> {
  const now = new Date()
  const fixtures = await prisma.fixture.findMany({
    where: {
      gameweekId,
      OR: [{ started: true }, { kickoffTime: { lte: now } }],
    },
    select: { homeTeamId: true, awayTeamId: true },
  })

  const locked = new Set<number>()
  for (const f of fixtures) {
    locked.add(f.homeTeamId)
    locked.add(f.awayTeamId)
  }
  return locked
}

/** Player ids on a roster whose club fixture has kicked off this gameweek. */
export async function getLockedPlayerIds(
  teamId: string,
  gameweekId: number
): Promise<Set<number>> {
  const lockedTeamIds = await getLockedTeamIds(gameweekId)
  if (lockedTeamIds.size === 0) return new Set()

  const slots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null } },
    select: { playerId: true, player: { select: { fplTeamId: true } } },
  })

  const locked = new Set<number>()
  for (const s of slots) {
    if (s.playerId !== null && s.player && lockedTeamIds.has(s.player.fplTeamId)) {
      locked.add(s.playerId)
    }
  }
  return locked
}

export interface GameweekLiveState {
  gameweekId: number | null
  /** True when the current GW deadline has passed and the GW is not yet finished. */
  live: boolean
}

/**
 * The current gameweek and whether it is mid-flight (deadline passed, not
 * finished). Live-substitution rules only apply while `live` is true.
 */
export async function isGameweekLive(): Promise<GameweekLiveState> {
  const gw = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
  if (!gw) return { gameweekId: null, live: false }
  const live = new Date() > gw.deadlineTime && !gw.finished
  return { gameweekId: gw.id, live }
}
