import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { cutPlayer } from "@/lib/dynasty-engine"
import { z } from "zod"

const schema = z.object({
  rosterSlotId: z.string().min(1),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params

  // Verify user owns this team
  const team = await prisma.team.findUnique({ where: { id: teamId } })
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 })
  if (team.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    await cutPlayer(teamId, parsed.data.rosterSlotId)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed to cut player" }, { status: 400 })
  }

  return Response.json({ ok: true })
}
