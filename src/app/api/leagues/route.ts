import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { z } from "zod"

const createLeagueSchema = z.object({
  name: z.string().min(3).max(50),
  type: z.enum(["REDRAFT", "KEEPER", "DYNASTY"]).default("REDRAFT"),
  scoringType: z.enum(["H2H", "ROTO", "TOTAL_POINTS"]).default("H2H"),
  maxTeams: z.number().int().min(2).max(20).default(12),
  season: z.string().default("2025-26"),
  draftType: z.enum(["SNAKE", "AUCTION", "SLOW"]).default("SNAKE"),
  draftDate: z.string().datetime().optional(),
  draftPickTimeSeconds: z.number().int().min(30).max(300).default(90),
  slowDraftHoursPerPick: z.number().int().optional(),
  rosterConfig: z.object({
    GK: z.number().default(1),
    DEF: z.number().default(4),
    MID: z.number().default(4),
    FWD: z.number().default(2),
    BENCH: z.number().default(5),
    FLEX: z.number().default(0),
  }).default({ GK: 1, DEF: 4, MID: 4, FWD: 2, BENCH: 5, FLEX: 0 }),
  waiverType: z.enum(["FAAB", "ROLLING", "REVERSE_STANDINGS", "CONTINUOUS", "FREE_AGENT"]).default("ROLLING"),
  faabBudget: z.number().int().optional(),
  keeperSlots: z.number().int().default(0),
  teamName: z.string().min(2).max(30),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const leagues = await prisma.league.findMany({
    where: { teams: { some: { userId: session.user.id } } },
    include: {
      teams: { select: { id: true, name: true, userId: true } },
      _count: { select: { teams: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return Response.json({ leagues })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = createLeagueSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  const league = await prisma.league.create({
    data: {
      name: data.name,
      type: data.type,
      scoringType: data.scoringType,
      maxTeams: data.maxTeams,
      season: data.season,
      draftType: data.draftType,
      draftDate: data.draftDate ? new Date(data.draftDate) : null,
      draftPickTimeSeconds: data.draftPickTimeSeconds,
      slowDraftHoursPerPick: data.slowDraftHoursPerPick,
      rosterConfig: data.rosterConfig,
      waiverType: data.waiverType,
      faabBudget: data.faabBudget,
      keeperSlots: data.keeperSlots,
      teams: {
        create: {
          name: data.teamName,
          userId: session.user.id,
          faabBalance: data.waiverType === "FAAB" ? (data.faabBudget ?? 1000) : null,
          waiverPriority: 1,
        },
      },
    },
    include: { teams: true },
  })

  return Response.json({ league }, { status: 201 })
}
