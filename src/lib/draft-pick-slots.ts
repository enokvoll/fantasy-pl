import { prisma } from "@/lib/prisma"
import type { RosterConfig } from "@/types/draft"

/** Compute the next season label, e.g. "2025-26" -> "2026-27". */
export function nextSeason(season: string): string {
  const m = season.match(/^(\d{4})-(\d{2})$/)
  if (!m) return season
  const startYear = parseInt(m[1])
  const a = startYear + 1
  const b = (a + 1) % 100
  return `${a}-${b.toString().padStart(2, "0")}`
}

/**
 * Ensure each team in the league has tradeable future draft-pick slots
 * for the next season (one per round = total roster size). Idempotent.
 */
export async function ensureDraftPickSlots(leagueId: string): Promise<void> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: { select: { id: true } } },
  })

  const season = nextSeason(league.season)

  const existing = await prisma.draftPickSlot.count({ where: { leagueId, season } })
  if (existing > 0) return

  const rc = league.rosterConfig as unknown as RosterConfig
  const rounds = rc.GK + rc.DEF + rc.MID + rc.FWD + rc.FLEX + rc.BENCH

  const data = league.teams.flatMap(team =>
    Array.from({ length: rounds }, (_, i) => ({
      leagueId,
      teamId: team.id,
      season,
      round: i + 1,
    }))
  )

  if (data.length > 0) {
    await prisma.draftPickSlot.createMany({ data })
  }
}
