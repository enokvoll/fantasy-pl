import { prisma } from "@/lib/prisma"
import type { Position } from "@/generated/prisma/client"
import { effectiveEligiblePositions } from "@/lib/eligibility"

/**
 * Resolve effective eligible positions for a set of players within a league, applying
 * any per-league commissioner overrides on top of each player's auto-derived secondary
 * positions. Returns a Map keyed by playerId for use by lineup validation, auto-subs,
 * and auto-lineup. Keeps the pure logic in `eligibility.ts` DB-free.
 */
export async function buildEligibilityMap(
  leagueId: string,
  players: { id: number; position: Position; secondaryPositions: Position[] }[]
): Promise<Map<number, Position[]>> {
  const ids = players.map((p) => p.id)
  const overrides = ids.length
    ? await prisma.leaguePlayerEligibility.findMany({
        where: { leagueId, playerId: { in: ids } },
      })
    : []
  const overrideMap = new Map(overrides.map((o) => [o.playerId, o]))

  const map = new Map<number, Position[]>()
  for (const p of players) {
    map.set(p.id, effectiveEligiblePositions(p, overrideMap.get(p.id)))
  }
  return map
}
