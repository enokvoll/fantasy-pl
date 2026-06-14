import type { Position } from "@/generated/prisma/client"

/**
 * Dynamic position eligibility.
 *
 * FPL classifies every player with a single position, which misrepresents players
 * whose real role differs (e.g. Salah is a MID who effectively plays FWD). This module
 * derives *additional* lineup-slot eligibility from synced stats and resolves the
 * effective eligible set for a player in a given league (auto-derived, optionally
 * replaced by a commissioner override).
 *
 * Eligibility ONLY governs which lineup slots a player may fill — it never changes how
 * the player is scored. Scoring always uses the real `Player.position`.
 */

type PositionedPlayer = { position: Position; secondaryPositions: Position[] }
type EligibilityOverride = { positions: Position[] } | null | undefined

/**
 * The positions a player may be slotted into within a league.
 * Primary position is always included. If a per-league override row exists its
 * positions replace the auto-derived secondary set; otherwise the derived set is used.
 */
export function effectiveEligiblePositions(
  player: PositionedPlayer,
  override?: EligibilityOverride
): Position[] {
  const secondary = override ? override.positions : player.secondaryPositions
  const set = new Set<Position>([player.position, ...secondary])
  return [...set]
}

/** Whether a player can fill a slot requiring `slotPos` in a league. */
export function isEligibleFor(
  player: PositionedPlayer,
  slotPos: Position,
  override?: EligibilityOverride
): boolean {
  return effectiveEligiblePositions(player, override).includes(slotPos)
}

/**
 * Auto-derive secondary eligibility from a player's season stats.
 *
 * Conservative heuristics — commissioners can override per league for edge cases.
 * GK never gains eligibility and no outfielder ever becomes GK-eligible.
 */
export function deriveSecondaryPositions(p: {
  position: Position
  starts: number
  minutes: number
  goalsScored: number
  assists: number
}): Position[] {
  // Need a meaningful sample before reclassifying anyone.
  if (p.starts < 5) return []

  const { goalsScored: goals, assists } = p

  switch (p.position) {
    // High-scoring midfielders who function as forwards (e.g. Salah).
    case "MID":
      if ((goals + assists * 0.5) / p.starts >= 0.4 && goals >= 4) return ["FWD"]
      return []
    // Attacking full-backs / wing-backs who push into midfield.
    case "DEF":
      if (goals + assists >= 5) return ["MID"]
      return []
    // Deep-lying / creative forwards who drop into midfield.
    case "FWD":
      if (assists >= 5 && goals <= assists) return ["MID"]
      return []
    default:
      return []
  }
}

/**
 * Feasibility check: can the given starters cover the required outfield slots?
 *
 * Solves a bipartite matching (Kuhn's augmenting-path algorithm — counts are tiny)
 * between players and slot demands. FLEX slots accept any supplied player. Returns
 * true iff every required slot can be filled by a distinct eligible player.
 *
 * `supply` must already be the outfield (non-GK) starters, each with the subset of
 * {DEF,MID,FWD} positions they are eligible for. GK is handled separately by the caller.
 */
export function assignPositions(
  supply: { id: number; eligible: Position[] }[],
  demand: { DEF: number; MID: number; FWD: number; FLEX: number }
): boolean {
  // Build one slot per required seat. FLEX is a wildcard accepting any player.
  const slots: (Position | "FLEX")[] = [
    ...Array<Position>(demand.DEF).fill("DEF"),
    ...Array<Position>(demand.MID).fill("MID"),
    ...Array<Position>(demand.FWD).fill("FWD"),
    ...Array<"FLEX">(demand.FLEX).fill("FLEX"),
  ]

  // A valid lineup must place every required slot AND every supplied player.
  if (slots.length !== supply.length) return false

  const canFill = (playerIdx: number, slotIdx: number): boolean => {
    const slot = slots[slotIdx]
    if (slot === "FLEX") return true
    return supply[playerIdx].eligible.includes(slot)
  }

  // slotAssignedTo[slotIdx] = index of the player occupying it, or -1.
  const slotAssignedTo = new Array<number>(slots.length).fill(-1)

  const tryAssign = (playerIdx: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slots.length; s++) {
      if (seen[s] || !canFill(playerIdx, s)) continue
      seen[s] = true
      if (slotAssignedTo[s] === -1 || tryAssign(slotAssignedTo[s], seen)) {
        slotAssignedTo[s] = playerIdx
        return true
      }
    }
    return false
  }

  let matched = 0
  for (let p = 0; p < supply.length; p++) {
    if (tryAssign(p, new Array<boolean>(slots.length).fill(false))) matched++
  }

  return matched === slots.length
}
