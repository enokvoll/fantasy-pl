import { prisma } from "@/lib/prisma"

/**
 * Youth prospects (dynasty leagues).
 *
 * A prospect is a young, yet-to-break-through player eligible for a team's youth
 * squad (3 extra slots). Managers draft/sign prospects into youth, then promote
 * them to the senior squad, trade them, or keep "developing" them in youth. A
 * prospect a team drafted+developed and then promotes earns a permanent small
 * scoring bonus that is NOT inherited by a counterpart if traded away.
 */

/** Tunable eligibility + bonus constants. */
export const PROSPECT_MAX_AGE = 21
export const PROSPECT_MAX_MINUTES = 900 // ~10 full matches — "yet to break through"
export const DEVELOPMENT_BONUS_PCT = 0.05 // +5% of the promoted home-grown player's points

export interface ProspectEligibilityInput {
  birthDate: Date | null
  minutes: number
}

/** Whole-years age at a reference date (default: now). */
export function ageAt(birthDate: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - birthDate.getFullYear()
  const m = asOf.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && asOf.getDate() < birthDate.getDate())) age--
  return age
}

/** Eligible = known birthdate, under 21, and below the senior-minutes threshold. */
export function isProspectEligible(
  player: ProspectEligibilityInput,
  asOf: Date = new Date()
): boolean {
  if (!player.birthDate) return false
  if (ageAt(player.birthDate, asOf) >= PROSPECT_MAX_AGE) return false
  return player.minutes < PROSPECT_MAX_MINUTES
}

/** Count of a team's occupied youth slots. */
export async function countYouthSlots(teamId: string): Promise<number> {
  return prisma.rosterSlot.count({ where: { teamId, slotType: "YOUTH", playerId: { not: null } } })
}

/**
 * Sign a prospect-eligible free agent into a team's youth squad. Pool signing
 * (the in-season path); the youth draft uses draft-engine instead.
 */
export async function signProspect(teamId: string, playerId: number): Promise<void> {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    include: { league: true },
  })
  if (team.league.type !== "DYNASTY" || !team.league.youthSquadEnabled) {
    throw new Error("This league does not have a youth squad")
  }

  const owned = await prisma.rosterSlot.findFirst({
    where: { playerId, team: { leagueId: team.leagueId } },
  })
  if (owned) throw new Error("That player is already owned in this league")

  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } })
  if (!isProspectEligible(player)) {
    throw new Error("That player is not youth-prospect eligible (must be U21 and yet to break through)")
  }

  const youthCount = await countYouthSlots(teamId)
  if (youthCount >= team.league.youthSlots) {
    throw new Error("Your youth squad is full — promote or release a prospect first")
  }

  await prisma.rosterSlot.create({
    data: {
      teamId,
      playerId,
      slotType: "YOUTH",
      position: player.position,
      isStarting: false,
      acquireType: "FREE_AGENT",
      developedByTeamId: teamId,
    },
  })
}

/**
 * Promote a youth prospect to the senior squad (bench). If the team developed
 * the prospect (drafted/signed them into its own youth squad and never traded
 * them), they keep a permanent development bonus.
 */
export async function promoteProspect(teamId: string, rosterSlotId: string): Promise<void> {
  const slot = await prisma.rosterSlot.findUnique({
    where: { id: rosterSlotId },
    include: { team: { include: { league: true } } },
  })
  if (!slot || slot.teamId !== teamId) throw new Error("Prospect not found for this team")
  if (slot.slotType !== "YOUTH") throw new Error("That player is not in your youth squad")
  if (!slot.playerId || !slot.position) throw new Error("Empty youth slot")

  // Senior roster cap (youth slots excluded).
  const rc = slot.team.league.rosterConfig as unknown as {
    GK: number; DEF: number; MID: number; FWD: number; BENCH: number; FLEX: number
  }
  const seniorCap = rc.GK + rc.DEF + rc.MID + rc.FWD + rc.FLEX + rc.BENCH
  const seniorCount = await prisma.rosterSlot.count({
    where: { teamId, slotType: { not: "YOUTH" }, playerId: { not: null } },
  })
  if (seniorCount >= seniorCap) {
    throw new Error("Senior squad is full — drop or cut a player before promoting")
  }

  const homegrown = slot.developedByTeamId === teamId
  await prisma.rosterSlot.update({
    where: { id: rosterSlotId },
    data: { slotType: "BENCH", isStarting: false, developmentBonus: homegrown },
  })
}
