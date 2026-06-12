import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { validateLineup, validateLiveSubstitution } from "@/lib/roster-validator"
import { getLockedPlayerIds, isGameweekLive } from "@/lib/lineup-lock"
import type { RosterConfig } from "@/types/draft"
import { z } from "zod"

const schema = z.object({
  starters: z.array(z.number()).min(1),
})

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params

  const slots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null }, slotType: { notIn: ["IR", "YOUTH"] } },
    include: {
      player: {
        include: { fplTeam: { select: { shortName: true } } },
      },
    },
    orderBy: { lineupPosition: "asc" },
  })

  const { gameweekId, live } = await isGameweekLive()
  const lockedPlayerIds =
    live && gameweekId !== null
      ? Array.from(await getLockedPlayerIds(teamId, gameweekId))
      : []

  return Response.json({ slots, live, lockedPlayerIds })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params

  // Verify user owns this team
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { league: true },
  })
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 })
  if (team.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { starters } = parsed.data
  const rosterConfig = team.league.rosterConfig as unknown as RosterConfig

  // Get all slots for this team
  const allSlots = await prisma.rosterSlot.findMany({
    where: { teamId, playerId: { not: null }, slotType: { notIn: ["IR", "YOUTH"] } },
    include: { player: true },
  })

  // Validate: check starters are actually on this team
  const teamPlayerIds = new Set(allSlots.map(s => s.playerId!))
  const invalidPicks = starters.filter(id => !teamPlayerIds.has(id))
  if (invalidPicks.length > 0) {
    return Response.json({ error: `Players not on your team: ${invalidPicks.join(", ")}` }, { status: 400 })
  }

  const starterSet = new Set(starters)
  const starterSlots = allSlots.filter(s => starterSet.has(s.playerId!))
  const benchSlots = allSlots.filter(s => !starterSet.has(s.playerId!))

  const validation = validateLineup(
    [...starterSlots.map(s => ({ ...s, isStarting: true })),
     ...benchSlots.map(s => ({ ...s, isStarting: false }))],
    rosterConfig
  )

  if (!validation.valid) {
    return Response.json({ error: validation.errors.join("; ") }, { status: 400 })
  }

  // Live-substitution guard: while the gameweek is in-flight, players whose club
  // has kicked off are locked and may not change starting/bench status.
  const { gameweekId, live } = await isGameweekLive()
  if (live && gameweekId !== null) {
    const lockedPlayerIds = await getLockedPlayerIds(teamId, gameweekId)
    const liveCheck = validateLiveSubstitution(allSlots, starters, lockedPlayerIds)
    if (!liveCheck.valid) {
      return Response.json({ error: liveCheck.errors.join("; ") }, { status: 400 })
    }
  }

  // Apply the lineup
  await prisma.$transaction([
    prisma.rosterSlot.updateMany({
      where: { teamId },
      data: { isStarting: false },
    }),
    ...starters.map((playerId, i) =>
      prisma.rosterSlot.updateMany({
        where: { teamId, playerId },
        data: { isStarting: true, lineupPosition: i },
      })
    ),
  ])

  return Response.json({ ok: true })
}
