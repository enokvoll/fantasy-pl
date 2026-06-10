import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { LeagueSidebar } from "@/components/layout/league-sidebar"

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const session = await auth()
  const userId = session!.user!.id!

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { _count: { select: { teams: true } } },
  })
  if (!league) notFound()

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId } })

  return (
    <div className="flex gap-6">
      <LeagueSidebar league={league} myTeam={myTeam} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
