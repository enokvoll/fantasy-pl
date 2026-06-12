import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { BotControls } from "./BotControls"
import { RolloverButton } from "./RolloverButton"
import { YouthDraftButton } from "./YouthDraftButton"

export default async function LeagueOverviewPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const session = await auth()
  const userId = session!.user!.id!

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!league) notFound()

  const isCommissioner = league.teams[0]?.userId === userId
  const spotsLeft = league.maxTeams - league.teams.length
  const botCount = league.teams.filter(t => t.isBot).length

  // Youth squad (dynasty): the youth draft is a sequential phase after the main draft.
  const youthEnabled = league.type === "DYNASTY" && league.youthSquadEnabled
  const draft = youthEnabled
    ? await prisma.draft.findFirst({ where: { leagueId }, select: { isYouthDraft: true, status: true } })
    : null
  const youthDraftActive = draft?.isYouthDraft && draft.status !== "COMPLETED"
  const canStartYouthDraft = youthEnabled && isCommissioner && league.status === "IN_SEASON" && !youthDraftActive

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{league.name}</h1>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge className="bg-muted text-foreground">{league.type}</Badge>
            <Badge className="bg-muted text-foreground">{league.draftType} draft</Badge>
            <Badge className="bg-muted text-foreground">{league.scoringType}</Badge>
            <Badge className="bg-muted text-foreground">{league.season}</Badge>
          </div>
        </div>
        {league.status === "SETUP" && (
          <Link href={`/league/${leagueId}/draft`} className={cn(buttonVariants(), "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold")}>
            {isCommissioner ? "Start draft" : "Draft room"}
          </Link>
        )}
        {league.status === "COMPLETED" && league.type === "DYNASTY" && isCommissioner && (
          <RolloverButton leagueId={leagueId} />
        )}
        {youthDraftActive && (
          <Link href={`/league/${leagueId}/draft`} className={cn(buttonVariants(), "bg-accent2 hover:bg-accent2/90 text-accent2-foreground font-semibold")}>
            Resume youth draft 🌱
          </Link>
        )}
        {canStartYouthDraft && <YouthDraftButton leagueId={leagueId} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Teams ({league.teams.length}/{league.maxTeams})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {league.teams.map((team, i) => (
              <div key={team.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className="text-muted-foreground text-sm w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">
                    {team.isBot && <span className="mr-1">🤖</span>}
                    {team.name}
                  </p>
                  {!team.isBot && <p className="text-muted-foreground text-xs truncate">{team.user.name}</p>}
                  {team.isBot && <p className="text-muted-foreground text-xs">Auto-pick bot</p>}
                </div>
                {team.userId === userId && (
                  <Badge className="text-xs bg-primary/20 text-primary border-0">You</Badge>
                )}
              </div>
            ))}

            {/* Bot controls for commissioner */}
            {isCommissioner && league.status === "SETUP" && (
              <div className="pt-3 border-t border-border">
                {spotsLeft > 0 || botCount > 0 ? (
                  <BotControls
                    leagueId={leagueId}
                    spotsLeft={spotsLeft}
                    botCount={botCount}
                  />
                ) : null}
                {spotsLeft > 0 && (
                  <p className="text-muted-foreground text-xs mt-2">
                    Invite code: <span className="text-foreground font-mono">{league.inviteCode}</span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">League settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["League type", league.type],
              ["Season", league.season],
              ["Draft format", `${league.draftType} draft`],
              ["Pick time", `${league.draftPickTimeSeconds}s per pick`],
              ...(league.type === "DYNASTY"
                ? ([
                    ["Rookie draft", `${league.rookieDraftRounds} round${league.rookieDraftRounds === 1 ? "" : "s"}`],
                    ["Rookie order", league.rookieDraftOrder.replace(/_/g, " ").toLowerCase()],
                  ] as [string, string][])
                : []),
              ["Scoring", league.scoringType],
              ["Waivers", league.waiverType],
              ["Max teams", league.maxTeams.toString()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-foreground">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
