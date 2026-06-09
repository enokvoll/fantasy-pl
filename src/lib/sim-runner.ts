import { prisma } from "@/lib/prisma"
import { syncLiveScores } from "@/lib/fpl-sync"
import { makePick, getAutoPickPlayer, getTeamForPick } from "@/lib/draft-engine"
import { calculateTeamScore } from "@/lib/scoring"
import { generateMatchupSchedule } from "@/lib/matchup-generator"
import type { RosterConfig } from "@/types/draft"
import type { Position } from "@/generated/prisma/client"

export interface GameweekResult {
  gameweekId: number
  gameweekName: string
  results: Array<{
    homeTeamId: string
    homeTeamName: string
    homeScore: number
    awayTeamId: string | null
    awayTeamName: string | null
    awayScore: number
    winner: "home" | "away" | "tie" | "bye"
  }>
}

export interface SimulationSummary {
  gameweeksProcessed: number
  standings: StandingRow[]
  topTeamId: string
  topTeamName: string
  topTeamPoints: number
}

export interface StandingRow {
  rank: number
  teamId: string
  teamName: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

/** Sync all completed gameweeks' player stats in one pass. */
export async function syncAllHistoricalGameweeks(): Promise<{ synced: number[]; skipped: number[] }> {
  const gameweeks = await prisma.gameWeek.findMany({
    where: { finished: true },
    orderBy: { id: "asc" },
  })

  const synced: number[] = []
  const skipped: number[] = []

  for (const gw of gameweeks) {
    try {
      const count = await syncLiveScores(gw.id)
      if (count > 0) synced.push(gw.id)
      else skipped.push(gw.id)
    } catch {
      skipped.push(gw.id)
    }
  }

  return { synced, skipped }
}

/** Run a complete auto-draft for a league (all picks via BPA). */
export async function runAutoDraft(leagueId: string): Promise<{ picks: number }> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: { teams: { orderBy: { draftOrder: "asc" } } },
  })

  const rosterConfig = league.rosterConfig as unknown as RosterConfig

  // Create a Draft row if one doesn't exist yet
  let draft = await prisma.draft.findFirst({ where: { leagueId } })
  if (!draft) {
    // Assign draft order if not already set
    for (let i = 0; i < league.teams.length; i++) {
      await prisma.team.update({
        where: { id: league.teams[i].id },
        data: { draftOrder: i + 1 },
      })
    }
    draft = await prisma.draft.create({
      data: { leagueId, status: "IN_PROGRESS", startedAt: new Date() },
    })
  } else if (draft.status === "PENDING") {
    await prisma.draft.update({
      where: { id: draft.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    })
  }

  const totalRounds = totalRoundsFromConfig(rosterConfig)
  const totalPicks = league.teams.length * totalRounds
  let picksMade = 0

  // Re-fetch draft + teams in order
  const teamsOrdered = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { draftOrder: "asc" },
  })
  const teamIds = teamsOrdered.map(t => t.id)

  // Loop until all picks are made
  while (true) {
    const currentDraft = await prisma.draft.findUniqueOrThrow({ where: { id: draft.id } })
    if (currentDraft.status === "COMPLETED" || currentDraft.currentPick >= totalPicks) break

    const currentTeamId = getTeamForPick(teamIds, currentDraft.currentPick)

    try {
      const playerId = await getAutoPickPlayer(currentTeamId, draft.id, rosterConfig)
      await makePick(draft.id, currentTeamId, playerId, true)
      picksMade++
    } catch {
      break
    }
  }

  // Generate matchup schedule and mark league as IN_SEASON
  await generateMatchupSchedule(leagueId)
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "IN_SEASON" },
  })

  return { picks: picksMade }
}

/** Auto-set the best possible starting lineup for a team in a given gameweek. */
export async function autoSetBestLineup(teamId: string, gameweekId: number): Promise<void> {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: teamId },
    include: { league: true },
  })
  const rosterConfig = team.league.rosterConfig as unknown as RosterConfig

  const slots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null }, slotType: { not: "IR" } },
    include: { player: true },
  })

  // Get GW stats for all players on this team
  const playerIds = slots.map(s => s.playerId!).filter(Boolean)
  const gwStats = await prisma.playerGameweekStat.findMany({
    where: { gameweekId, playerId: { in: playerIds } },
  })
  const statsMap = new Map(gwStats.map(s => [s.playerId, s.totalPoints]))

  // Sort players by GW points (or season totalPoints as fallback)
  const scored = slots.map(s => ({
    slotId: s.id,
    playerId: s.playerId!,
    position: s.player!.position,
    points: statsMap.get(s.playerId!) ?? s.player!.totalPoints,
  }))

  // Greedily fill starting slots by required position counts
  const starting = new Set<number>()

  // Fill required positions first
  for (const [pos, count] of [
    ["GK", rosterConfig.GK] as [Position, number],
    ["DEF", rosterConfig.DEF] as [Position, number],
    ["MID", rosterConfig.MID] as [Position, number],
    ["FWD", rosterConfig.FWD] as [Position, number],
  ]) {
    const eligible = scored
      .filter(p => p.position === pos && !starting.has(p.playerId))
      .sort((a, b) => b.points - a.points)
    eligible.slice(0, count).forEach(p => starting.add(p.playerId))
  }

  // Fill FLEX spots from best remaining non-GK players
  const flexNeeded = rosterConfig.FLEX
  if (flexNeeded > 0) {
    const remaining = scored
      .filter(p => !starting.has(p.playerId) && p.position !== "GK")
      .sort((a, b) => b.points - a.points)
    remaining.slice(0, flexNeeded).forEach(p => starting.add(p.playerId))
  }

  const totalStarting = rosterConfig.GK + rosterConfig.DEF + rosterConfig.MID + rosterConfig.FWD + rosterConfig.FLEX

  // Reset all to bench, then set starters
  await prisma.rosterSlot.updateMany({ where: { teamId }, data: { isStarting: false } })

  for (const slot of slots) {
    if (slot.playerId && starting.has(slot.playerId)) {
      await prisma.rosterSlot.update({
        where: { id: slot.id },
        data: { isStarting: true },
      })
    }
  }
}

/** Process one complete gameweek for a league. */
export async function simulateGameweek(leagueId: string, gameweekId: number): Promise<GameweekResult> {
  const gw = await prisma.gameWeek.findUniqueOrThrow({ where: { id: gameweekId } })

  const teams = await prisma.team.findMany({ where: { leagueId } })

  // Set best lineup and calculate score for each team
  for (const team of teams) {
    await autoSetBestLineup(team.id, gameweekId)
    await calculateTeamScore(team.id, gameweekId, leagueId)
  }

  // Resolve matchups for this GW
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, gameweekId },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  })

  const results: GameweekResult["results"] = []

  for (const matchup of matchups) {
    const homeScore = await prisma.teamGameweekScore.findUnique({
      where: { teamId_gameweekId: { teamId: matchup.homeTeamId, gameweekId } },
    })
    const awayScore = matchup.awayTeamId
      ? await prisma.teamGameweekScore.findUnique({
          where: { teamId_gameweekId: { teamId: matchup.awayTeamId, gameweekId } },
        })
      : null

    const hPts = homeScore?.totalPoints ?? 0
    const aPts = awayScore?.totalPoints ?? 0

    let winner: "home" | "away" | "tie" | "bye" = "bye"
    if (!matchup.awayTeamId) {
      winner = "bye"
    } else if (hPts > aPts) {
      winner = "home"
      await prisma.team.update({ where: { id: matchup.homeTeamId }, data: { wins: { increment: 1 }, pointsFor: { increment: hPts }, pointsAgainst: { increment: aPts } } })
      await prisma.team.update({ where: { id: matchup.awayTeamId }, data: { losses: { increment: 1 }, pointsFor: { increment: aPts }, pointsAgainst: { increment: hPts } } })
    } else if (aPts > hPts) {
      winner = "away"
      await prisma.team.update({ where: { id: matchup.awayTeamId! }, data: { wins: { increment: 1 }, pointsFor: { increment: aPts }, pointsAgainst: { increment: hPts } } })
      await prisma.team.update({ where: { id: matchup.homeTeamId }, data: { losses: { increment: 1 }, pointsFor: { increment: hPts }, pointsAgainst: { increment: aPts } } })
    } else {
      winner = "tie"
      await prisma.team.update({ where: { id: matchup.homeTeamId }, data: { ties: { increment: 1 }, pointsFor: { increment: hPts }, pointsAgainst: { increment: aPts } } })
      await prisma.team.update({ where: { id: matchup.awayTeamId! }, data: { ties: { increment: 1 }, pointsFor: { increment: aPts }, pointsAgainst: { increment: hPts } } })
    }

    await prisma.matchup.update({
      where: { id: matchup.id },
      data: { homeScore: hPts, awayScore: aPts, isCompleted: true },
    })

    results.push({
      homeTeamId: matchup.homeTeamId,
      homeTeamName: matchup.homeTeam.name,
      homeScore: hPts,
      awayTeamId: matchup.awayTeamId,
      awayTeamName: matchup.awayTeam?.name ?? null,
      awayScore: aPts,
      winner,
    })
  }

  return { gameweekId, gameweekName: gw.name, results }
}

/** Recompute standings from scratch (idempotent). */
export async function updateStandings(leagueId: string): Promise<StandingRow[]> {
  const teams = await prisma.team.findMany({ where: { leagueId }, orderBy: { wins: "desc" } })

  // Reset all counters
  await prisma.team.updateMany({
    where: { leagueId },
    data: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
  })

  // Re-sum from completed matchups
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, isCompleted: true, awayTeamId: { not: null } },
  })

  for (const m of matchups) {
    if (!m.awayTeamId) continue
    if (m.homeScore > m.awayScore) {
      await prisma.team.update({ where: { id: m.homeTeamId }, data: { wins: { increment: 1 }, pointsFor: { increment: m.homeScore }, pointsAgainst: { increment: m.awayScore } } })
      await prisma.team.update({ where: { id: m.awayTeamId }, data: { losses: { increment: 1 }, pointsFor: { increment: m.awayScore }, pointsAgainst: { increment: m.homeScore } } })
    } else if (m.awayScore > m.homeScore) {
      await prisma.team.update({ where: { id: m.awayTeamId }, data: { wins: { increment: 1 }, pointsFor: { increment: m.awayScore }, pointsAgainst: { increment: m.homeScore } } })
      await prisma.team.update({ where: { id: m.homeTeamId }, data: { losses: { increment: 1 }, pointsFor: { increment: m.homeScore }, pointsAgainst: { increment: m.awayScore } } })
    } else {
      await prisma.team.update({ where: { id: m.homeTeamId }, data: { ties: { increment: 1 }, pointsFor: { increment: m.homeScore }, pointsAgainst: { increment: m.awayScore } } })
      await prisma.team.update({ where: { id: m.awayTeamId }, data: { ties: { increment: 1 }, pointsFor: { increment: m.awayScore }, pointsAgainst: { increment: m.homeScore } } })
    }
  }

  const updated = await prisma.team.findMany({
    where: { leagueId },
    orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
  })

  return updated.map((t, i) => ({
    rank: i + 1,
    teamId: t.id,
    teamName: t.name,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
    pointsFor: t.pointsFor,
    pointsAgainst: t.pointsAgainst,
  }))
}

/** Run the full 38-gameweek season simulation. */
export async function runFullSimulation(leagueId: string): Promise<SimulationSummary> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })

  // If not yet drafted, run auto-draft first
  if (league.status === "SETUP") {
    await runAutoDraft(leagueId)
  }

  // Process all finished gameweeks in order
  const gameweeks = await prisma.gameWeek.findMany({
    where: { finished: true },
    orderBy: { id: "asc" },
  })

  let processed = 0
  for (const gw of gameweeks) {
    // Skip if matchups for this GW are already all completed
    const pendingMatchups = await prisma.matchup.count({
      where: { leagueId, gameweekId: gw.id, isCompleted: false },
    })
    if (pendingMatchups === 0) continue

    try {
      await simulateGameweek(leagueId, gw.id)
      processed++
    } catch {
      // GW might not have stat data yet — skip
    }
  }

  const standings = await updateStandings(leagueId)

  const top = standings[0]
  return {
    gameweeksProcessed: processed,
    standings,
    topTeamId: top?.teamId ?? "",
    topTeamName: top?.teamName ?? "",
    topTeamPoints: top?.pointsFor ?? 0,
  }
}

// --- Helpers ---

function totalRoundsFromConfig(rc: RosterConfig): number {
  return rc.GK + rc.DEF + rc.MID + rc.FWD + rc.FLEX + rc.BENCH
}
