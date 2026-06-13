import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { DraftRoom } from "@/components/draft/DraftRoom"
import { shuffle } from "@/lib/draft-engine"
import type { RosterConfig } from "@/types/draft"

export default async function DraftPage({
  params,
}: {
  params: Promise<{ leagueId: string }>
}) {
  const { leagueId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const userId = session.user.id

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        orderBy: { draftOrder: "asc" },
        include: { user: { select: { name: true } } },
      },
    },
  })
  if (!league) notFound()

  // Ensure draft row exists
  let draft = await prisma.draft.findFirst({ where: { leagueId } })
  if (!draft) {
    // Assign a random draft order
    const shuffled = shuffle(league.teams)
    for (let i = 0; i < shuffled.length; i++) {
      await prisma.team.update({ where: { id: shuffled[i].id }, data: { draftOrder: i + 1 } })
    }
    draft = await prisma.draft.create({ data: { leagueId } })
  }

  const myTeam = league.teams.find(t => t.userId === userId)
  const isCommissioner = league.teams[0]?.userId === userId

  // FPL clubs for the player-table team filter (no separate endpoint needed).
  const fplTeams = await prisma.fplTeam.findMany({
    orderBy: { shortName: "asc" },
    select: { id: true, name: true, shortName: true },
  })

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 120px)" }}>
      <DraftRoom
        leagueId={leagueId}
        initialDraftId={draft.id}
        myTeamId={myTeam?.id ?? null}
        myTeamName={myTeam?.name ?? "Spectator"}
        isCommissioner={isCommissioner}
        teams={league.teams.map(t => ({
          id: t.id,
          name: t.name,
          draftOrder: t.draftOrder,
          userId: t.userId,
          isBot: t.isBot,
        }))}
        rosterConfig={league.rosterConfig as unknown as RosterConfig}
        isYouthDraft={draft.isYouthDraft}
        fplTeams={fplTeams}
      />
    </div>
  )
}
