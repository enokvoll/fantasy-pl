import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { RosterPitch } from "@/components/roster/RosterPitch"
import { DynastyPanel } from "@/components/roster/DynastyPanel"
import { YouthPanel } from "@/components/roster/YouthPanel"
import { getRosterSize } from "@/lib/dynasty-engine"
import { getLockedPlayerIds, isGameweekLive } from "@/lib/lineup-lock"
import { getFormationKey, resolveFormationBoost } from "@/lib/formation-boosts"
import { getSeasonPlayerPoints } from "@/lib/season-points"
import type { Position } from "@/generated/prisma/client"
import type { RosterConfig } from "@/types/draft"

export default async function RosterPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) notFound()

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">You don&apos;t have a team in this league.</p>
      </div>
    )
  }

  // Prefer the league's first unplayed matchup gameweek (the one you're setting your
  // lineup for) — falling back to the live/most-recent FPL gameweek.
  const firstUpcoming = await prisma.matchup.findFirst({
    where: { leagueId, isCompleted: false },
    orderBy: { gameweekId: "asc" },
    select: { gameweekId: true },
  })
  const upcomingGW = firstUpcoming
    ? await prisma.gameWeek.findUnique({ where: { id: firstUpcoming.gameweekId } })
    : null
  const currentGW = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
  const latestGW = await prisma.gameWeek.findFirst({ where: { finished: true }, orderBy: { id: "desc" } })
  const activeGW = upcomingGW ?? currentGW ?? latestGW

  // Senior squad only — youth prospects are managed separately in YouthPanel.
  const slots = await prisma.rosterSlot.findMany({
    where: { teamId: myTeam.id, playerId: { not: null }, slotType: { not: "YOUTH" } },
    include: {
      player: { include: { fplTeam: { select: { shortName: true } } } },
    },
    orderBy: { lineupPosition: "asc" },
  })

  // Get GW stats if available
  const gwStats = activeGW
    ? await prisma.playerGameweekStat.findMany({
        where: {
          gameweekId: activeGW.id,
          playerId: { in: slots.map(s => s.playerId!) },
        },
      })
    : []
  const statsMap = new Map(gwStats.map(s => [s.playerId, s.totalPoints]))

  if (slots.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">📋</p>
        <h2 className="text-xl font-bold text-foreground mb-2">No roster yet</h2>
        <p className="text-muted-foreground">Complete the draft first to see your players here.</p>
      </div>
    )
  }

  const rosterConfig = league.rosterConfig as unknown as RosterConfig

  // Live-substitution locking: while the gameweek is in-flight, players whose
  // club has kicked off can no longer be subbed.
  const { gameweekId, live } = await isGameweekLive()
  const lockedPlayerIds =
    live && gameweekId !== null
      ? Array.from(await getLockedPlayerIds(myTeam.id, gameweekId))
      : []

  // Current formation + its active boost (driven by the saved starting XI).
  const startingPositions = slots
    .filter(s => s.isStarting && s.player)
    .map(s => ({ position: s.player!.position as Position }))
  const formationKey = getFormationKey(startingPositions)
  const formationBoost = resolveFormationBoost(formationKey, league.formationBoostConfig)

  // Season-to-date points (league-scoped). Preseason ⇒ empty map ⇒ render "—".
  const seasonPoints = await getSeasonPlayerPoints(leagueId, slots.map(s => s.playerId!))
  const seasonStarted = seasonPoints.size > 0

  const pitchSlots = slots
    .filter(s => s.player)
    .map(s => ({
      slotId: s.id,
      playerId: s.playerId!,
      playerName: s.player!.webName,
      position: s.player!.position,
      clubShort: s.player!.fplTeam.shortName,
      totalPoints: seasonStarted ? (seasonPoints.get(s.playerId!) ?? 0) : null,
      gwPoints: statsMap.get(s.playerId!) ?? null,
      isStarting: s.isStarting,
    }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{myTeam.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {pitchSlots.filter(s => s.isStarting).length} starters · {pitchSlots.filter(s => !s.isStarting).length} bench
            {activeGW && <span className="ml-2 text-muted-foreground">· {activeGW.name}</span>}
          </p>
        </div>
      </div>

      {formationBoost && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="font-mono text-lg font-bold text-primary">{formationKey}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{formationBoost.label}</p>
            {formationBoost.description && (
              <p className="text-xs text-foreground mt-0.5">{formationBoost.description}</p>
            )}
          </div>
        </div>
      )}

      <RosterPitch
        teamId={myTeam.id}
        slots={pitchSlots}
        rosterConfig={rosterConfig}
        lockedPlayerIds={lockedPlayerIds}
        live={live}
      />

      {league.type === "DYNASTY" && (
        <DynastyPanel
          teamId={myTeam.id}
          rosterCap={getRosterSize(rosterConfig)}
          canCut={league.status === "SETUP"}
          players={slots
            .filter(s => s.player)
            .map(s => ({
              slotId: s.id,
              playerName: s.player!.webName,
              position: s.player!.position,
              clubShort: s.player!.fplTeam.shortName,
              totalPoints: seasonStarted ? (seasonPoints.get(s.playerId!) ?? 0) : null,
              yearsOwned: s.dynastyYearsOwned ?? 0,
              acquireType: s.acquireType,
            }))}
        />
      )}

      {league.type === "DYNASTY" && league.youthSquadEnabled && (
        <YouthPanel teamId={myTeam.id} />
      )}
    </div>
  )
}
