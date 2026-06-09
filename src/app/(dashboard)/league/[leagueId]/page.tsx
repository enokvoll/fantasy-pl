import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { BotControls } from "./BotControls"

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">{league.name}</h1>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge className="bg-slate-800 text-slate-300">{league.type}</Badge>
            <Badge className="bg-slate-800 text-slate-300">{league.draftType} draft</Badge>
            <Badge className="bg-slate-800 text-slate-300">{league.scoringType}</Badge>
            <Badge className="bg-slate-800 text-slate-300">{league.season}</Badge>
          </div>
        </div>
        {league.status === "SETUP" && (
          <Link href={`/league/${leagueId}/draft`} className={cn(buttonVariants(), "bg-emerald-500 hover:bg-emerald-400 text-white font-semibold")}>
            {isCommissioner ? "Start draft" : "Draft room"}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Teams ({league.teams.length}/{league.maxTeams})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {league.teams.map((team, i) => (
              <div key={team.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                <span className="text-slate-500 text-sm w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {team.isBot && <span className="mr-1">🤖</span>}
                    {team.name}
                  </p>
                  {!team.isBot && <p className="text-slate-400 text-xs truncate">{team.user.name}</p>}
                  {team.isBot && <p className="text-slate-500 text-xs">Auto-pick bot</p>}
                </div>
                {team.userId === userId && (
                  <Badge className="text-xs bg-emerald-600/20 text-emerald-400 border-0">You</Badge>
                )}
              </div>
            ))}

            {/* Bot controls for commissioner */}
            {isCommissioner && league.status === "SETUP" && (
              <div className="pt-3 border-t border-slate-800">
                {spotsLeft > 0 || botCount > 0 ? (
                  <BotControls
                    leagueId={leagueId}
                    spotsLeft={spotsLeft}
                    botCount={botCount}
                  />
                ) : null}
                {spotsLeft > 0 && (
                  <p className="text-slate-500 text-xs mt-2">
                    Invite code: <span className="text-slate-300 font-mono">{league.inviteCode}</span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base">League settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["League type", league.type],
              ["Season", league.season],
              ["Draft format", `${league.draftType} draft`],
              ["Pick time", `${league.draftPickTimeSeconds}s per pick`],
              ["Scoring", league.scoringType],
              ["Waivers", league.waiverType],
              ["Max teams", league.maxTeams.toString()],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-400">{k}</span>
                <span className="text-slate-200">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
