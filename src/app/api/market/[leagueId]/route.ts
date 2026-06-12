import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getAvailableFaab, getCommittedFaab } from "@/lib/transfer-market"

// GET — transfer-market context: open auctions (+ standing bids), my FAAB.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { leagueId } = await params

  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) return Response.json({ error: "Not found" }, { status: 404 })

  const myTeam = await prisma.team.findFirst({ where: { leagueId, userId: session.user.id } })
  if (!myTeam) return Response.json({ error: "No team in this league" }, { status: 403 })

  const auctions = await prisma.transferAuction.findMany({
    where: { leagueId, status: "OPEN" },
    include: {
      player: { include: { fplTeam: { select: { shortName: true } } } },
      bids: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { team: { select: { id: true, name: true } } },
      },
    },
    orderBy: { endsAt: "asc" },
  })

  // Resolve the standing high-bidder team names.
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true },
  })
  const teamName = new Map(teams.map((t) => [t.id, t.name]))

  const committed = await getCommittedFaab(myTeam.id)
  const available = await getAvailableFaab(myTeam.id)

  return Response.json({
    waiverType: league.waiverType,
    settings: {
      windowHours: league.auctionWindowHours,
      antiSnipeMinutes: league.auctionAntiSnipeMinutes,
      minIncrement: league.auctionMinIncrement,
    },
    myTeam: {
      id: myTeam.id,
      faabBalance: myTeam.faabBalance ?? 0,
      committed,
      available,
    },
    auctions: auctions.map((a) => ({
      id: a.id,
      player: {
        id: a.player.id,
        name: a.player.webName,
        position: a.player.position,
        club: a.player.fplTeam.shortName,
      },
      currentBid: a.currentBid,
      currentBidTeamId: a.currentBidTeamId,
      currentBidTeamName: a.currentBidTeamId ? teamName.get(a.currentBidTeamId) ?? null : null,
      minIncrement: a.minIncrement,
      endsAt: a.endsAt,
      startedByTeamId: a.startedByTeamId,
      bids: a.bids.map((b) => ({ teamId: b.teamId, teamName: b.team.name, amount: b.amount, createdAt: b.createdAt })),
    })),
  })
}
