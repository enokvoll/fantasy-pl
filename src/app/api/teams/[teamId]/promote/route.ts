import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { promoteProspect } from "@/lib/prospects"
import { z } from "zod"

const schema = z.object({ rosterSlotId: z.string().min(1) })

// POST — promote a youth prospect to the senior squad.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params
  const team = await prisma.team.findUnique({ where: { id: teamId } })
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 })
  if (team.userId !== session.user.id) return Response.json({ error: "Forbidden" }, { status: 403 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 })

  try {
    await promoteProspect(teamId, parsed.data.rosterSlotId)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
