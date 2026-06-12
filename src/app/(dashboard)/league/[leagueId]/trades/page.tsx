import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { TradeCenter } from "@/components/trade/TradeCenter"

export default async function TradesPage({ params }: { params: Promise<{ leagueId: string }> }) {
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

  return <TradeCenter leagueId={leagueId} />
}
