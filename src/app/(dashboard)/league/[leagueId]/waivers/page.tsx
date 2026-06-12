import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { WaiverManager } from "@/components/waiver/WaiverManager"

export default async function WaiversPage({ params }: { params: Promise<{ leagueId: string }> }) {
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

  // Current roster for drop dropdown
  const slots = await prisma.rosterSlot.findMany({
    where: { teamId: myTeam.id, playerId: { not: null } },
    include: { player: { include: { fplTeam: { select: { shortName: true } } } } },
  })

  const roster = slots
    .filter(s => s.player)
    .map(s => ({
      playerId: s.playerId!,
      name: s.player!.webName,
      position: s.player!.position,
      club: s.player!.fplTeam.shortName,
    }))

  const isCommissioner = await prisma.team.findFirst({
    where: { leagueId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  }).then(t => t?.userId === session.user!.id)

  return (
    <WaiverManager
      leagueId={leagueId}
      waiverType={league.waiverType}
      faabBudget={league.faabBudget}
      myFaabBalance={myTeam.faabBalance}
      myWaiverPriority={myTeam.waiverPriority}
      roster={roster}
      isCommissioner={isCommissioner}
    />
  )
}
