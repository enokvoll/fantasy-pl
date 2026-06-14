import { prisma } from "@/lib/prisma"
import { getBootstrap, getFixtures, getLiveGameweek } from "@/lib/fpl-api"
import type { Position } from "@/generated/prisma/client"
import { deriveSecondaryPositions } from "@/lib/eligibility"
import { handlePlayerDeparture, handlePlayerReturn } from "@/lib/player-rights"

const POSITION_MAP: Record<number, Position> = {
  1: "GK",
  2: "DEF",
  3: "MID",
  4: "FWD",
}

const STATUS_MAP: Record<string, "AVAILABLE" | "DOUBTFUL" | "SUSPENDED" | "INJURED" | "UNAVAILABLE"> = {
  a: "AVAILABLE",
  d: "DOUBTFUL",
  s: "SUSPENDED",
  i: "INJURED",
  u: "UNAVAILABLE",
  n: "UNAVAILABLE",
}

export async function syncPlayers(): Promise<{ teams: number; players: number }> {
  const bootstrap = await getBootstrap()

  // Upsert FPL teams
  let teamsCount = 0
  for (const t of bootstrap.teams) {
    await prisma.fplTeam.upsert({
      where: { id: t.id },
      create: { id: t.id, name: t.name, shortName: t.short_name, code: t.code },
      update: { name: t.name, shortName: t.short_name, code: t.code },
    })
    teamsCount++
  }

  // Upsert players in batches of 50
  let playersCount = 0
  const chunks = chunkArray(bootstrap.elements, 50)
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map((el) =>
        prisma.player.upsert({
          where: { id: el.id },
          create: {
            id: el.id,
            webName: el.web_name,
            firstName: el.first_name,
            lastName: el.second_name,
            position: POSITION_MAP[el.element_type],
            fplTeamId: el.team,
            nowCost: el.now_cost,
            status: STATUS_MAP[el.status] ?? "AVAILABLE",
            photo: el.photo,
            news: el.news || null,
            chancePlayingNextRound: el.chance_of_playing_next_round,
            totalPoints: el.total_points,
            form: el.form,
            birthDate: el.birth_date ? new Date(el.birth_date) : null,
            minutes: el.minutes ?? 0,
            starts: el.starts ?? 0,
            secondaryPositions: deriveSecondaryPositions({
              position: POSITION_MAP[el.element_type],
              starts: el.starts ?? 0,
              minutes: el.minutes ?? 0,
              goalsScored: el.goals_scored ?? 0,
              assists: el.assists ?? 0,
            }),
          },
          update: {
            webName: el.web_name,
            firstName: el.first_name,
            lastName: el.second_name,
            fplTeamId: el.team,
            nowCost: el.now_cost,
            status: STATUS_MAP[el.status] ?? "AVAILABLE",
            news: el.news || null,
            chancePlayingNextRound: el.chance_of_playing_next_round,
            totalPoints: el.total_points,
            form: el.form,
            birthDate: el.birth_date ? new Date(el.birth_date) : null,
            minutes: el.minutes ?? 0,
            starts: el.starts ?? 0,
            secondaryPositions: deriveSecondaryPositions({
              position: POSITION_MAP[el.element_type],
              starts: el.starts ?? 0,
              minutes: el.minutes ?? 0,
              goalsScored: el.goals_scored ?? 0,
              assists: el.assists ?? 0,
            }),
          },
        })
      )
    )
    playersCount += chunk.length
  }

  await reconcileFplPool(new Set(bootstrap.elements.map((el) => el.id)))

  return { teams: teamsCount, players: playersCount }
}

/**
 * Detect players who left or returned to the FPL dataset and drive the Player Rights
 * lifecycle. Runs after the upsert so newly-added players already exist.
 * - Departed (was in pool, now absent): retain rights for owning teams, free their slots.
 * - Returned (was out of pool, now present): flip held rights to re-signable.
 */
async function reconcileFplPool(presentIds: Set<number>): Promise<void> {
  const present = [...presentIds]

  const departed = await prisma.player.findMany({
    where: { inFplPool: true, id: { notIn: present } },
    select: { id: true },
  })
  for (const { id } of departed) {
    await handlePlayerDeparture(id, "Left the Premier League (no longer in FPL dataset)")
    await prisma.player.update({
      where: { id },
      data: { inFplPool: false, departedAt: new Date() },
    })
  }

  const returned = await prisma.player.findMany({
    where: { inFplPool: false, id: { in: present } },
    select: { id: true },
  })
  for (const { id } of returned) {
    await handlePlayerReturn(id)
    await prisma.player.update({
      where: { id },
      data: { inFplPool: true, departedAt: null },
    })
  }
}

export async function syncGameweeks(): Promise<number> {
  const bootstrap = await getBootstrap()

  for (const ev of bootstrap.events) {
    await prisma.gameWeek.upsert({
      where: { id: ev.id },
      create: {
        id: ev.id,
        name: ev.name,
        deadlineTime: new Date(ev.deadline_time),
        finished: ev.finished,
        dataChecked: ev.data_checked,
        isCurrent: ev.is_current,
        isNext: ev.is_next,
      },
      update: {
        finished: ev.finished,
        dataChecked: ev.data_checked,
        isCurrent: ev.is_current,
        isNext: ev.is_next,
      },
    })
  }

  return bootstrap.events.length
}

export async function syncFixtures(): Promise<number> {
  const fixtures = await getFixtures()
  let count = 0

  const chunks = chunkArray(fixtures, 50)
  for (const chunk of chunks) {
    await Promise.all(
      chunk
        .filter((f) => f.event !== null)
        .map((f) =>
          prisma.fixture.upsert({
            where: { id: f.id },
            create: {
              id: f.id,
              gameweekId: f.event!,
              kickoffTime: f.kickoff_time ? new Date(f.kickoff_time) : null,
              homeTeamId: f.team_h,
              awayTeamId: f.team_a,
              homeTeamScore: f.team_h_score,
              awayTeamScore: f.team_a_score,
              started: f.started,
              finished: f.finished,
            },
            update: {
              kickoffTime: f.kickoff_time ? new Date(f.kickoff_time) : null,
              homeTeamScore: f.team_h_score,
              awayTeamScore: f.team_a_score,
              started: f.started,
              finished: f.finished,
            },
          })
        )
    )
    count += chunk.filter((f) => f.event !== null).length
  }

  return count
}

export async function syncLiveScores(gameweekId: number, force = false): Promise<number> {
  if (!force) {
    // During live season, only sync if there are active fixtures
    const activeFixtures = await prisma.fixture.count({
      where: { gameweekId, started: true, finished: false },
    })
    if (activeFixtures === 0) return 0
  }

  const liveData = await getLiveGameweek(gameweekId)
  let count = 0

  const chunks = chunkArray(liveData.elements, 50)
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map((el) =>
        prisma.playerGameweekStat.upsert({
          where: { playerId_gameweekId: { playerId: el.id, gameweekId } },
          create: {
            playerId: el.id,
            gameweekId,
            minutes: el.stats.minutes,
            goalsScored: el.stats.goals_scored,
            assists: el.stats.assists,
            cleanSheets: el.stats.clean_sheets,
            goalsConceded: el.stats.goals_conceded,
            ownGoals: el.stats.own_goals,
            penaltiesSaved: el.stats.penalties_saved,
            penaltiesMissed: el.stats.penalties_missed,
            yellowCards: el.stats.yellow_cards,
            redCards: el.stats.red_cards,
            saves: el.stats.saves,
            bonus: el.stats.bonus,
            bps: el.stats.bps,
            totalPoints: el.stats.total_points,
            inDreamteam: el.stats.in_dreamteam,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawExplain: el.explain as any,
          },
          update: {
            minutes: el.stats.minutes,
            goalsScored: el.stats.goals_scored,
            assists: el.stats.assists,
            cleanSheets: el.stats.clean_sheets,
            goalsConceded: el.stats.goals_conceded,
            ownGoals: el.stats.own_goals,
            penaltiesSaved: el.stats.penalties_saved,
            penaltiesMissed: el.stats.penalties_missed,
            yellowCards: el.stats.yellow_cards,
            redCards: el.stats.red_cards,
            saves: el.stats.saves,
            bonus: el.stats.bonus,
            bps: el.stats.bps,
            totalPoints: el.stats.total_points,
            inDreamteam: el.stats.in_dreamteam,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawExplain: el.explain as any,
          },
        })
      )
    )
    count += chunk.length
  }

  return count
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}
