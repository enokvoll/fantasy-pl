import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_COLORS = {
  SETUP: "bg-slate-600 text-slate-200",
  DRAFTING: "bg-yellow-600 text-yellow-100",
  IN_SEASON: "bg-emerald-600 text-emerald-100",
  COMPLETED: "bg-slate-700 text-slate-400",
}

export default async function HomePage() {
  const session = await auth()
  const userId = session!.user!.id!

  const teams = await prisma.team.findMany({
    where: { userId },
    include: {
      league: { include: { _count: { select: { teams: true } } } },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">My Leagues</h1>
          <p className="text-slate-400 mt-1">Manage your fantasy teams</p>
        </div>
        <div className="flex gap-3">
          <Link href="/leagues/join" className={cn(buttonVariants({ variant: "outline" }), "border-slate-700 text-slate-300 hover:bg-slate-800")}>
            Join league
          </Link>
          <Link href="/leagues/new" className={cn(buttonVariants(), "bg-emerald-500 hover:bg-emerald-400 text-white font-semibold")}>
            + Create league
          </Link>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-slate-800 rounded-xl">
          <p className="text-4xl mb-4">🏆</p>
          <h2 className="text-xl font-bold text-white mb-2">No leagues yet</h2>
          <p className="text-slate-400 mb-6">Create your first league or join one with an invite code</p>
          <Link href="/leagues/new" className={cn(buttonVariants(), "bg-emerald-500 hover:bg-emerald-400 text-white font-semibold")}>
            Create a league
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(({ league, ...team }) => (
            <Link key={team.id} href={`/league/${league.id}`}>
              <Card className="bg-slate-900 border-slate-800 hover:border-emerald-600/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-white text-lg leading-tight">{league.name}</CardTitle>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[league.status]}`}>
                      {league.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm">{team.name}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-slate-400">
                    <span>{league._count.teams}/{league.maxTeams} teams</span>
                    <span>•</span>
                    <span>{league.type}</span>
                    <span>•</span>
                    <span>{league.draftType} draft</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Badge variant="secondary" className="text-xs bg-slate-800 text-slate-300">{league.scoringType}</Badge>
                    <Badge variant="secondary" className="text-xs bg-slate-800 text-slate-300">{league.season}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
