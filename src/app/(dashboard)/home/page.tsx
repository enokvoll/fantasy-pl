import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_COLORS = {
  SETUP: "bg-muted text-muted-foreground",
  DRAFTING: "bg-warn/15 text-warn",
  IN_SEASON: "bg-success/15 text-success",
  COMPLETED: "bg-muted text-muted-foreground",
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
          <h1 className="text-3xl font-bold text-foreground">My Leagues</h1>
          <p className="text-muted-foreground mt-1">Manage your fantasy teams</p>
        </div>
        <div className="flex gap-3">
          <Link href="/leagues/join" className={cn(buttonVariants({ variant: "outline" }), "border-border text-foreground hover:bg-muted")}>
            Join league
          </Link>
          <Link href="/leagues/new" className={cn(buttonVariants(), "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold")}>
            + Create league
          </Link>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-border rounded-xl">
          <p className="text-4xl mb-4">🏆</p>
          <h2 className="text-xl font-bold text-foreground mb-2">No leagues yet</h2>
          <p className="text-muted-foreground mb-6">Create your first league or join one with an invite code</p>
          <Link href="/leagues/new" className={cn(buttonVariants(), "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold")}>
            Create a league
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(({ league, ...team }) => (
            <Link key={team.id} href={`/league/${league.id}`}>
              <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-foreground text-lg leading-tight">{league.name}</CardTitle>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[league.status]}`}>
                      {league.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">{team.name}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{league._count.teams}/{league.maxTeams} teams</span>
                    <span>•</span>
                    <span>{league.type}</span>
                    <span>•</span>
                    <span>{league.draftType} draft</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Badge variant="secondary" className="text-xs bg-muted text-foreground">{league.scoringType}</Badge>
                    <Badge variant="secondary" className="text-xs bg-muted text-foreground">{league.season}</Badge>
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
