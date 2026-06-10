import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { RosterPitch } from "@/components/roster/RosterPitch"
import { DynastyPanel } from "@/components/roster/DynastyPanel"
import { getRosterSize } from "@/lib/dynasty-engine"
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
        <p className="text-slate-400">You don&apos;t have a team in this league.</p>
      </div>
    )
  }

  const currentGW = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
  const latestGW = await prisma.gameWeek.findFirst({ where: { finished: true }, orderBy: { id: "desc" } })
  const activeGW = currentGW ?? latestGW

  const slots = await prisma.rosterSlot.findMany({
    where: { teamId: myTeam.id, playerId: { not: null } },
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
        <h2 className="text-xl font-bold text-white mb-2">No roster yet</h2>
        <p className="text-slate-400">Complete the draft first to see your players here.</p>
      </div>
    )
  }

  const rosterConfig = league.rosterConfig as unknown as RosterConfig

  const pitchSlots = slots
    .filter(s => s.player)
    .map(s => ({
      slotId: s.id,
      playerId: s.playerId!,
      playerName: s.player!.webName,
      position: s.player!.position,
      clubShort: s.player!.fplTeam.shortName,
      totalPoints: s.player!.totalPoints,
      gwPoints: statsMap.get(s.playerId!) ?? null,
      isStarting: s.isStarting,
    }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">{myTeam.name}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {pitchSlots.filter(s => s.isStarting).length} starters · {pitchSlots.filter(s => !s.isStarting).length} bench
            {activeGW && <span className="ml-2 text-slate-500">· {activeGW.name}</span>}
          </p>
        </div>
      </div>

      <RosterPitch teamId={myTeam.id} slots={pitchSlots} rosterConfig={rosterConfig} />

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
              totalPoints: s.player!.totalPoints,
              yearsOwned: s.dynastyYearsOwned ?? 0,
              acquireType: s.acquireType,
            }))}
        />
      )}
    </div>
  )
}
