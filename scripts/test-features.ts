/**
 * Lightweight, DB-free smoke tests for the pure feature logic added for live
 * substitutions and tactical formation boosts. Run with:
 *
 *   npx tsx scripts/test-features.ts
 *
 * A dummy DATABASE_URL is set first so modules that transitively import the
 * Prisma client can load without a real database (no queries are executed).
 */
process.env.DATABASE_URL ||= "postgresql://localhost:5432/test"

import assert from "node:assert/strict"
import type { Position } from "../src/generated/prisma/client"

let failures = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    console.log("  ✓", name)
  } catch (e) {
    failures++
    console.error("  ✗", name)
    console.error("   ", e instanceof Error ? e.message : e)
  }
}

async function main() {
  const { getFormationKey, resolveFormationBoost, DEFAULT_FORMATION_BOOSTS } =
    await import("../src/lib/formation-boosts")
  const { validateLiveSubstitution } = await import("../src/lib/roster-validator")
  const { calculatePlayerPoints } = await import("../src/lib/scoring")

  type SlotArg = Parameters<typeof validateLiveSubstitution>[0][number]
  const pos = (position: Position) => ({ position })

  console.log("formation-boosts")
  test("getFormationKey counts DEF-MID-FWD, ignores GK", () => {
    const starters = [
      pos("GK"),
      pos("DEF"), pos("DEF"), pos("DEF"),
      pos("MID"), pos("MID"), pos("MID"), pos("MID"),
      pos("FWD"), pos("FWD"), pos("FWD"),
    ]
    assert.equal(getFormationKey(starters), "3-4-3")
  })

  test("3-4-3 boost: forwards +10% goals + attacker team bonus", () => {
    const b = resolveFormationBoost("3-4-3", DEFAULT_FORMATION_BOOSTS)
    assert.ok(b)
    assert.equal(b!.actionMultipliers?.FWD?.goals, 1.1)
    assert.equal(b!.teamBonus?.threshold, 3)
    assert.deepEqual(b!.teamBonus?.positions, ["MID", "FWD"])
  })

  test("4-4-2 boost: all starters +3%", () => {
    const b = resolveFormationBoost("4-4-2", DEFAULT_FORMATION_BOOSTS)
    assert.equal(b!.starterTotalPct, 0.03)
  })

  test("unknown formation / null config resolves to no boost", () => {
    assert.equal(resolveFormationBoost("9-0-1", DEFAULT_FORMATION_BOOSTS), null)
    assert.equal(resolveFormationBoost("3-4-3", null), null)
  })

  console.log("scoring (boost application)")
  test("FWD goal points scale by the formation multiplier", () => {
    const stats = {
      minutes: 90, goalsScored: 2, assists: 0, cleanSheets: 0, goalsConceded: 0,
      ownGoals: 0, penaltiesSaved: 0, penaltiesMissed: 0, yellowCards: 0,
      redCards: 0, saves: 0, bonus: 0,
    }
    // Base: 2 (60+ mins) + 2 goals * 4 (FWD) = 10
    assert.equal(calculatePlayerPoints(stats, "FWD"), 10)
    // Boosted: 2 + (8 * 1.1) = 10.8
    assert.equal(calculatePlayerPoints(stats, "FWD", undefined, { goals: 1.1 }), 10.8)
  })

  console.log("live substitutions")
  const slot = (playerId: number, isStarting: boolean, webName = `P${playerId}`) =>
    ({ playerId, isStarting, player: { webName } } as unknown as SlotArg)

  test("moving a locked starter to the bench is rejected", () => {
    const current = [slot(1, true), slot(2, true), slot(3, false)]
    const locked = new Set([1])
    // New XI drops locked player 1, promotes 3 → illegal
    const res = validateLiveSubstitution(current, [2, 3], locked)
    assert.equal(res.valid, false)
  })

  test("subbing two unlocked players is allowed", () => {
    const current = [slot(1, true), slot(2, true), slot(3, false)]
    const locked = new Set([1]) // 1 stays starting
    const res = validateLiveSubstitution(current, [1, 3], locked)
    assert.equal(res.valid, true)
  })

  test("promoting a locked bench player into the XI is rejected", () => {
    const current = [slot(1, true), slot(2, false)]
    const locked = new Set([2])
    const res = validateLiveSubstitution(current, [2], locked)
    assert.equal(res.valid, false)
  })

  console.log("formation set (8 formations)")
  test("the table has exactly the 8 supported formations", () => {
    assert.deepEqual(
      Object.keys(DEFAULT_FORMATION_BOOSTS).sort(),
      ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-2-3", "5-3-2", "5-4-1"].sort()
    )
  })
  test("5-defender formations boost defender clean sheets", () => {
    assert.equal(resolveFormationBoost("5-3-2", DEFAULT_FORMATION_BOOSTS)!.actionMultipliers?.DEF?.cleanSheet, 1.15)
    assert.equal(resolveFormationBoost("5-4-1", DEFAULT_FORMATION_BOOSTS)!.actionMultipliers?.DEF?.cleanSheet, 1.2)
  })
  test("5-2-3 boosts both defenders and forwards", () => {
    const b = resolveFormationBoost("5-2-3", DEFAULT_FORMATION_BOOSTS)!
    assert.equal(b.actionMultipliers?.DEF?.cleanSheet, 1.12)
    assert.equal(b.actionMultipliers?.FWD?.goals, 1.08)
  })
  test("4-3-3 is an attacker boost like 3-4-3", () => {
    const b = resolveFormationBoost("4-3-3", DEFAULT_FORMATION_BOOSTS)!
    assert.equal(b.actionMultipliers?.FWD?.goals, 1.1)
    assert.equal(b.teamBonus?.threshold, 3)
  })
  test("3-5-2 / 4-5-1 are balanced (+3% all starters)", () => {
    assert.equal(resolveFormationBoost("3-5-2", DEFAULT_FORMATION_BOOSTS)!.starterTotalPct, 0.03)
    assert.equal(resolveFormationBoost("4-5-1", DEFAULT_FORMATION_BOOSTS)!.starterTotalPct, 0.03)
  })

  console.log("prospect eligibility")
  const { ageAt, isProspectEligible, PROSPECT_MAX_MINUTES } = await import("../src/lib/prospects")
  const ref = new Date("2026-06-12")
  test("ageAt computes whole years", () => {
    assert.equal(ageAt(new Date("2006-06-13"), ref), 19) // birthday not yet reached
    assert.equal(ageAt(new Date("2006-06-12"), ref), 20) // birthday today
  })
  test("U21 + low minutes is eligible", () => {
    assert.equal(isProspectEligible({ birthDate: new Date("2007-01-01"), minutes: 200 }, ref), true)
  })
  test("21+ is not eligible regardless of minutes", () => {
    assert.equal(isProspectEligible({ birthDate: new Date("2004-01-01"), minutes: 0 }, ref), false)
  })
  test("U21 but high minutes (broken through) is not eligible", () => {
    assert.equal(isProspectEligible({ birthDate: new Date("2007-01-01"), minutes: PROSPECT_MAX_MINUTES + 1 }, ref), false)
  })
  test("null birthDate is not eligible", () => {
    assert.equal(isProspectEligible({ birthDate: null, minutes: 0 }, ref), false)
  })

  console.log("dynamic position eligibility")
  const { deriveSecondaryPositions, effectiveEligiblePositions, isEligibleFor, assignPositions } =
    await import("../src/lib/eligibility")
  const { validateLineup } = await import("../src/lib/roster-validator")

  test("Salah-type MID gains FWD eligibility", () => {
    assert.deepEqual(
      deriveSecondaryPositions({ position: "MID", starts: 30, minutes: 2700, goalsScored: 18, assists: 10 }),
      ["FWD"]
    )
  })
  test("attacking DEF gains MID eligibility", () => {
    assert.deepEqual(
      deriveSecondaryPositions({ position: "DEF", starts: 25, minutes: 2200, goalsScored: 3, assists: 4 }),
      ["MID"]
    )
  })
  test("creative FWD gains MID eligibility", () => {
    assert.deepEqual(
      deriveSecondaryPositions({ position: "FWD", starts: 25, minutes: 2200, goalsScored: 4, assists: 7 }),
      ["MID"]
    )
  })
  test("low-sample and ordinary players gain nothing; GK never gains", () => {
    assert.deepEqual(deriveSecondaryPositions({ position: "MID", starts: 3, minutes: 270, goalsScored: 5, assists: 5 }), [])
    assert.deepEqual(deriveSecondaryPositions({ position: "MID", starts: 30, minutes: 2700, goalsScored: 2, assists: 2 }), [])
    assert.deepEqual(deriveSecondaryPositions({ position: "GK", starts: 38, minutes: 3420, goalsScored: 0, assists: 1 }), [])
  })

  test("effective eligibility: primary always present, override replaces derived", () => {
    const player = { position: "MID" as Position, secondaryPositions: ["FWD"] as Position[] }
    assert.deepEqual(effectiveEligiblePositions(player).sort(), ["FWD", "MID"])
    // Override fully replaces the derived set (empty override clears secondaries).
    assert.deepEqual(effectiveEligiblePositions(player, { positions: [] }), ["MID"])
    assert.deepEqual(effectiveEligiblePositions(player, { positions: ["DEF"] }).sort(), ["DEF", "MID"])
    assert.equal(isEligibleFor(player, "FWD"), true)
    assert.equal(isEligibleFor(player, "DEF"), false)
  })

  test("assignPositions: dual MID/FWD covers a FWD shortage", () => {
    const supply = [
      { id: 1, eligible: ["MID"] as Position[] },
      { id: 2, eligible: ["MID", "FWD"] as Position[] }, // flexible
      { id: 3, eligible: ["FWD"] as Position[] },
    ]
    // Need 1 MID + 2 FWD: player 2 must slide to FWD.
    assert.equal(assignPositions(supply, { DEF: 0, MID: 1, FWD: 2, FLEX: 0 }), true)
  })
  test("assignPositions: infeasible demand fails", () => {
    const supply = [
      { id: 1, eligible: ["MID"] as Position[] },
      { id: 2, eligible: ["MID"] as Position[] },
    ]
    assert.equal(assignPositions(supply, { DEF: 0, MID: 0, FWD: 2, FLEX: 0 }), false)
  })

  // Minimal lineup builder for validateLineup (only fields the validator reads).
  const lineSlot = (id: number, position: Position, isStarting: boolean, slotType = isStarting ? "STARTER" : "BENCH") =>
    ({ playerId: id, isStarting, slotType, position: null, player: { id, position } }) as unknown as Parameters<typeof validateLineup>[0][number]
  const rc = { GK: 1, DEF: 3, MID: 4, FWD: 3, FLEX: 0, BENCH: 0 }

  test("validateLineup: dual MID/FWD lets a MID start as the 3rd forward", () => {
    const starters = [
      lineSlot(1, "GK", true),
      lineSlot(2, "DEF", true), lineSlot(3, "DEF", true), lineSlot(4, "DEF", true),
      lineSlot(5, "MID", true), lineSlot(6, "MID", true), lineSlot(7, "MID", true), lineSlot(8, "MID", true),
      lineSlot(9, "FWD", true), lineSlot(10, "FWD", true),
      lineSlot(11, "MID", true), // only 2 real FWDs; this MID must cover FWD
    ]
    const elig = new Map<number, Position[]>([[11, ["MID", "FWD"]]])
    assert.equal(validateLineup(starters, rc, elig).valid, true)
    // Without the eligibility override it should be invalid (only 2 FWD).
    assert.equal(validateLineup(starters, rc).valid, false)
  })
  test("validateLineup: outfielder cannot fill the GK slot", () => {
    const starters = [
      lineSlot(2, "DEF", true), lineSlot(3, "DEF", true), lineSlot(4, "DEF", true), lineSlot(5, "DEF", true),
      lineSlot(6, "MID", true), lineSlot(7, "MID", true), lineSlot(8, "MID", true), lineSlot(9, "MID", true),
      lineSlot(10, "FWD", true), lineSlot(11, "FWD", true), lineSlot(12, "FWD", true),
    ]
    // 0 GK starters → invalid even with broad eligibility.
    assert.equal(validateLineup(starters, rc).valid, false)
  })

  console.log("")
  if (failures > 0) {
    console.error(`${failures} test(s) failed`)
    process.exit(1)
  }
  console.log("All feature smoke tests passed.")
}

main()
