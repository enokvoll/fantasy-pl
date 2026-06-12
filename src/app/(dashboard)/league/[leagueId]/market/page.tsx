import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { MarketClient } from "@/components/market/MarketClient"

export default async function MarketPage({ params }: { params: Promise<{ leagueId: string }> }) {
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

  if (league.waiverType !== "MARKETPLACE") {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-4xl">🏷️</p>
        <p className="text-foreground">This league doesn&apos;t use the transfer market.</p>
        <Link href={`/league/${leagueId}/waivers`} className="text-primary text-sm hover:underline">
          Go to Waivers & Free Agency →
        </Link>
      </div>
    )
  }

  // Current roster for the "drop" dropdown when winning a contested player.
  const slots = await prisma.rosterSlot.findMany({
    where: { teamId: myTeam.id, playerId: { not: null } },
    include: { player: { include: { fplTeam: { select: { shortName: true } } } } },
  })
  const roster = slots
    .filter((s) => s.player)
    .map((s) => ({
      playerId: s.playerId!,
      name: s.player!.webName,
      position: s.player!.position,
      club: s.player!.fplTeam.shortName,
    }))

  return <MarketClient leagueId={leagueId} myTeamId={myTeam.id} roster={roster} />
}
