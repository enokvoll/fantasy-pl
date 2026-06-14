import type { RosterSlot, Player, Position } from "@/generated/prisma/client"
import type { RosterConfig } from "@/types/draft"
import { assignPositions } from "@/lib/eligibility"

type SlotWithPlayer = RosterSlot & { player: Player | null }

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a starting lineup against the league's roster config.
 *
 * `eligibility` maps a playerId to its effective eligible positions in the league
 * (primary + secondary). When omitted, each player is treated as eligible only for its
 * own primary position (legacy strict behaviour). GK is always exact and only real
 * goalkeepers may fill GK; outfield slots are filled via eligibility-aware matching so a
 * dual-position player (e.g. MID/FWD) can cover whichever line needs them.
 */
export function validateLineup(
  slots: SlotWithPlayer[],
  rosterConfig: RosterConfig,
  eligibility?: Map<number, Position[]>
): ValidationResult {
  const errors: string[] = []
  const starters = slots.filter((s) => s.isStarting && s.slotType === "STARTER")
  const bench = slots.filter((s) => s.slotType === "BENCH")

  const eligibleFor = (p: Player): Position[] =>
    eligibility?.get(p.id) ?? [p.position]

  // Goalkeepers stay strict: GK is non-fungible and nothing else may fill it.
  const gkStarters = starters.filter((s) => s.player && s.player.position === "GK")
  if (gkStarters.length !== rosterConfig.GK)
    errors.push(`Must have exactly ${rosterConfig.GK} goalkeeper(s) starting. Currently: ${gkStarters.length}`)

  // Outfield starters must cover DEF/MID/FWD minimums (FLEX absorbs the rest) given
  // each player's eligible positions.
  const outfield = starters.filter((s) => s.player && s.player.position !== "GK")
  const supply = outfield.map((s) => ({
    id: s.player!.id,
    eligible: eligibleFor(s.player!).filter((p) => p !== "GK"),
  }))
  const outfieldNeeded = rosterConfig.DEF + rosterConfig.MID + rosterConfig.FWD + rosterConfig.FLEX
  if (supply.length === outfieldNeeded) {
    const ok = assignPositions(supply, {
      DEF: rosterConfig.DEF,
      MID: rosterConfig.MID,
      FWD: rosterConfig.FWD,
      FLEX: rosterConfig.FLEX,
    })
    if (!ok)
      errors.push(
        `Lineup cannot cover the required outfield positions (${rosterConfig.DEF} DEF, ${rosterConfig.MID} MID, ${rosterConfig.FWD} FWD).`
      )
  }

  const totalStarterSlots = rosterConfig.GK + rosterConfig.DEF + rosterConfig.MID + rosterConfig.FWD + rosterConfig.FLEX
  if (starters.length !== totalStarterSlots)
    errors.push(`Must have exactly ${totalStarterSlots} starters. Currently: ${starters.length}`)

  if (bench.length !== rosterConfig.BENCH)
    errors.push(`Must have exactly ${rosterConfig.BENCH} bench players. Currently: ${bench.length}`)

  return { valid: errors.length === 0, errors }
}

/**
 * Live-substitution legality. Once a gameweek is in-flight, a player whose club
 * has kicked off is locked: their starting/bench status may not change. This
 * compares the requested starting XI against the currently persisted lineup and
 * rejects any change that would move a locked player into or out of the XI.
 *
 * Pre-deadline lineup edits skip this check entirely.
 */
export function validateLiveSubstitution(
  currentSlots: SlotWithPlayer[],
  newStarterIds: number[],
  lockedPlayerIds: Set<number>
): ValidationResult {
  const errors: string[] = []
  const newStarters = new Set(newStarterIds)

  for (const slot of currentSlots) {
    if (slot.playerId === null || !lockedPlayerIds.has(slot.playerId)) continue
    const willStart = newStarters.has(slot.playerId)
    if (willStart !== slot.isStarting) {
      const name = slot.player?.webName ?? `Player ${slot.playerId}`
      errors.push(
        slot.isStarting
          ? `${name} has already played and cannot be moved to the bench`
          : `${name} has already played and cannot be moved into the lineup`
      )
    }
  }

  return { valid: errors.length === 0, errors }
}
