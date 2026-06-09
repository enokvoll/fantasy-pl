import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  const inviteCode = req.nextUrl.searchParams.get("inviteCode")
  if (!inviteCode) return Response.json({ error: "Missing inviteCode" }, { status: 400 })

  const league = await prisma.league.findUnique({
    where: { inviteCode },
    select: { id: true, name: true },
  })

  if (!league) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json({ leagueId: league.id, name: league.name })
}
