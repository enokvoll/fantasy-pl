import type { RosterSlot, Player } from "@/generated/prisma/client"
import type { RosterConfig } from "@/types/draft"

type SlotWithPlayer = RosterSlot & { player: Player | null }

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateLineup(
  slots: SlotWithPlayer[],
  rosterConfig: RosterConfig
): ValidationResult {
  const errors: string[] = []
  const starters = slots.filter((s) => s.isStarting && s.slotType === "STARTER")
  const bench = slots.filter((s) => s.slotType === "BENCH")

  const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const slot of starters) {
    if (slot.player) posCounts[slot.player.position]++
  }

  if (posCounts.GK !== rosterConfig.GK)
    errors.push(`Must have exactly ${rosterConfig.GK} goalkeeper(s) starting. Currently: ${posCounts.GK}`)
  if (posCounts.DEF < rosterConfig.DEF)
    errors.push(`Must have at least ${rosterConfig.DEF} defenders starting. Currently: ${posCounts.DEF}`)
  if (posCounts.MID < rosterConfig.MID)
    errors.push(`Must have at least ${rosterConfig.MID} midfielders starting. Currently: ${posCounts.MID}`)
  if (posCounts.FWD < rosterConfig.FWD)
    errors.push(`Must have at least ${rosterConfig.FWD} forwards starting. Currently: ${posCounts.FWD}`)

  const totalStarterSlots = rosterConfig.GK + rosterConfig.DEF + rosterConfig.MID + rosterConfig.FWD + rosterConfig.FLEX
  if (starters.length !== totalStarterSlots)
    errors.push(`Must have exactly ${totalStarterSlots} starters. Currently: ${starters.length}`)

  if (bench.length !== rosterConfig.BENCH)
    errors.push(`Must have exactly ${rosterConfig.BENCH} bench players. Currently: ${bench.length}`)

  return { valid: errors.length === 0, errors }
}
