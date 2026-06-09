import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

const BOT_NAMES = [
  "Fergie's Furies", "Wenger's Wonders", "Klopp's Reds", "Pep's Machine",
  "Mourinho's Blues", "Conte's Foxes", "Arteta's Gunners", "Potter's Seagulls",
  "Howe's Magpies", "Lampard's Lions", "Gerrard's Lions", "Vieira's Eagles",
  "Silva's Hammers", "Nuno's Wolves", "Brentford Bees", "Brendan's Bhoys",
  "Eddie's Toffees", "David's Canaries", "Bilic's Baggies", "Dyche's Clarets",
]

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: true },
  })
  if (!league) return Response.json({ error: "Not found" }, { status: 404 })

  // Only commissioner can add bots
  if (league.teams[0]?.userId !== session.user.id) {
    return Response.json({ error: "Only the commissioner can add bots" }, { status: 403 })
  }
  if (league.status !== "SETUP") {
    return Response.json({ error: "Cannot add bots after draft has started" }, { status: 400 })
  }
  if (league.teams.length >= league.maxTeams) {
    return Response.json({ error: "League is full" }, { status: 400 })
  }

  // Pick an unused bot name
  const usedNames = new Set(league.teams.map(t => t.name))
  const botName = BOT_NAMES.find(n => !usedNames.has(n)) ?? `Bot ${league.teams.length + 1}`

  // Create a unique bot user (one per bot team so userId+leagueId unique constraint is satisfied)
  const botUser = await prisma.user.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { name: botName, email: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}@fantaspl.internal` } as any,
  })

  const teamCount = league.teams.length
  const team = await prisma.team.create({
    data: {
      name: botName,
      userId: botUser.id,
      leagueId,
      isBot: true,
      waiverPriority: teamCount + 1,
      faabBalance: league.waiverType === "FAAB" ? (league.faabBudget ?? 1000) : null,
    },
  })

  return Response.json({ team }, { status: 201 })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { orderBy: { createdAt: "desc" } } },
  })
  if (!league) return Response.json({ error: "Not found" }, { status: 404 })
  if (league.teams[0]?.userId !== session.user.id) {
    return Response.json({ error: "Only the commissioner can remove bots" }, { status: 403 })
  }

  // Remove the most recently added bot
  const lastBot = league.teams.find(t => t.isBot)
  if (!lastBot) return Response.json({ error: "No bots to remove" }, { status: 400 })

  await prisma.team.delete({ where: { id: lastBot.id } })
  await prisma.user.delete({ where: { id: lastBot.userId } })

  return Response.json({ ok: true })
}
