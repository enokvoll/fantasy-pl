import type { Position } from "@/generated/prisma/client"

/**
 * Tactical formation boosts (all game modes).
 *
 * A team's formation is the DEF-MID-FWD split of its starting XI (GK excluded).
 * Each formation can grant scoring perks, applied in `scoring.ts` AFTER base
 * points are computed. Boosts are CONFIG-DRIVEN: a league stores a boost table on
 * `League.formationBoostConfig` (mirroring `scoringConfig`). The defaults below
 * seed every standard formation and can be tuned without code changes.
 */

/** Scoring components a multiplier can scale. */
export type ScoringAction = "goals" | "assists" | "cleanSheet" | "saves" | "bonus"

export interface FormationTeamBonus {
  /** Starter positions that count toward the metric. */
  positions: Position[]
  /** Currently only "scored" (player recorded >= 1 goal) is supported. */
  metric: "scored"
  /** How many qualifying starters trigger the bonus. */
  threshold: number
  /** Fraction added to the team's total when triggered, e.g. 0.02 = +2%. */
  pct: number
  label?: string
}

export interface FormationBoost {
  label: string
  description?: string
  /** Per-position multipliers applied to a single scoring action's points. */
  actionMultipliers?: Partial<Record<Position, Partial<Record<ScoringAction, number>>>>
  /** Flat percentage added to every starter's point total, e.g. 0.03 = +3%. */
  starterTotalPct?: number
  /** Conditional bonus applied to the team's total. */
  teamBonus?: FormationTeamBonus
}

export type FormationBoostTable = Record<string, FormationBoost>

/**
 * Default boost table keyed by "DEF-MID-FWD". Seeded with the user's three
 * examples plus sensible defaults for the other standard 11-a-side formations.
 *
 * NOTE: the 4-5-1 "key passes worth +0.5 points" rule cannot be implemented yet
 * — `PlayerGameweekStat` has no key-passes stat (FPL live data doesn't expose
 * it). Only the assist multiplier is applied; revisit if a stat source is added.
 */
export const DEFAULT_FORMATION_BOOSTS: FormationBoostTable = {
  "3-4-3": {
    label: "Attacking",
    description: "Forwards earn +10% on goals; +2% team bonus when 3+ attackers score.",
    actionMultipliers: { FWD: { goals: 1.1 } },
    teamBonus: { positions: ["MID", "FWD"], metric: "scored", threshold: 3, pct: 0.02, label: "3+ attackers scored" },
  },
  "4-4-2": {
    label: "Balanced",
    description: "All starters earn +3% on their total.",
    starterTotalPct: 0.03,
  },
  "4-5-1": {
    label: "Midfield control",
    description: "Midfielders earn +10% on assists.",
    actionMultipliers: { MID: { assists: 1.1 } },
  },
  "3-5-2": {
    label: "Wing-backs",
    description: "Midfielders +5% on assists, forwards +5% on goals.",
    actionMultipliers: { MID: { assists: 1.05 }, FWD: { goals: 1.05 } },
  },
  "4-3-3": {
    label: "Front three",
    description: "Forwards earn +7% on goals.",
    actionMultipliers: { FWD: { goals: 1.07 } },
  },
  "5-2-3": {
    label: "Counter-attack",
    description: "Forwards +8% on goals.",
    actionMultipliers: { FWD: { goals: 1.08 } },
  },
  "5-3-2": {
    label: "Low block",
    description: "Defenders earn +15% on clean sheets.",
    actionMultipliers: { DEF: { cleanSheet: 1.15 } },
  },
  "5-4-1": {
    label: "Park the bus",
    description: "Defenders earn +20% on clean sheets.",
    actionMultipliers: { DEF: { cleanSheet: 1.2 } },
  },
}

/** Build the "DEF-MID-FWD" key from a starting XI's player positions. */
export function getFormationKey(starters: { position: Position }[]): string {
  let def = 0
  let mid = 0
  let fwd = 0
  for (const s of starters) {
    if (s.position === "DEF") def++
    else if (s.position === "MID") mid++
    else if (s.position === "FWD") fwd++
  }
  return `${def}-${mid}-${fwd}`
}

/**
 * Resolve the boost for a formation from a league's stored config. When the
 * config is null/absent (boosts disabled or a pre-feature league) returns null.
 */
export function resolveFormationBoost(
  formationKey: string,
  config: unknown
): FormationBoost | null {
  if (!config || typeof config !== "object") return null
  const table = config as FormationBoostTable
  return table[formationKey] ?? null
}
