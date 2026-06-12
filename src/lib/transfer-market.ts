import { prisma } from "@/lib/prisma"
import { getRosterSize } from "@/lib/dynasty-engine"
import type { RosterConfig } from "@/types/draft"

/**
 * Transfer market — free-agent open-ascending (eBay-style) auctions.
 *
 * Replaces blind waivers for leagues whose `waiverType` is MARKETPLACE. Managers
 * bid against each other with their existing FAAB balance; bids are visible and
 * can be outbid until the auction's deadline. A late bid extends the deadline
 * (anti-snipe). At settle time the standing high bid wins, FAAB is deducted, and
 * the player is added to the winner's roster (dropping a player if at the cap).
 */

/**
 * FAAB a team has tied up in *other* open auctions where it is the standing high
 * bidder. Available FAAB for a new/raised bid = faabBalance − committed.
 */
export async function getCommittedFaab(teamId: string, excludeAuctionId?: string): Promise<number> {
  const open = await prisma.transferAuction.findMany({
    where: {
      status: "OPEN",
      currentBidTeamId: teamId,
      ...(excludeAuctionId ? { id: { not: excludeAuctionId } } : {}),
    },
    select: { currentBid: true },
  })
  return open.reduce((sum, a) => sum + a.currentBid, 0)
}

/** Available FAAB = balance − funds committed to other open auctions. */
export async function getAvailableFaab(teamId: string, excludeAuctionId?: string): Promise<number> {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } })
  const committed = await getCommittedFaab(teamId, excludeAuctionId)
  return (team.faabBalance ?? 0) - committed
}

async function assertFreeAgent(leagueId: string, playerId: number): Promise<void> {
  const owned = await prisma.rosterSlot.findFirst({
    where: { playerId, team: { leagueId } },
  })
  if (owned) throw new Error("That player is already on a roster in this league")
}

/** Start a new auction for a free agent with an opening bid. */
export async function startAuction(
  leagueId: string,
  teamId: string,
  playerId: number,
  openingBid: number,
  dropPlayerId?: number
): Promise<string> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })
  if (league.waiverType !== "MARKETPLACE") {
    throw new Error("This league does not use the transfer market")
  }
  if (openingBid < 1) throw new Error("Opening bid must be at least 1")

  await assertFreeAgent(leagueId, playerId)

  // No duplicate open auction for the same player.
  const existing = await prisma.transferAuction.findFirst({
    where: { leagueId, playerId, status: "OPEN" },
  })
  if (existing) throw new Error("There is already an open auction for that player")

  const available = await getAvailableFaab(teamId)
  if (openingBid > available) {
    throw new Error(`Opening bid exceeds your available FAAB (${available})`)
  }

  const endsAt = new Date(Date.now() + league.auctionWindowHours * 60 * 60 * 1000)

  const auction = await prisma.transferAuction.create({
    data: {
      leagueId,
      playerId,
      startedByTeamId: teamId,
      currentBid: openingBid,
      currentBidTeamId: teamId,
      minIncrement: league.auctionMinIncrement,
      endsAt,
      bids: { create: { teamId, amount: openingBid, dropPlayerId: dropPlayerId ?? null } },
    },
  })
  return auction.id
}

/** Place a bid that outbids the current high bid by at least minIncrement. */
export async function placeBid(
  auctionId: string,
  teamId: string,
  amount: number,
  dropPlayerId?: number
): Promise<{ currentBid: number; endsAt: Date }> {
  const auction = await prisma.transferAuction.findUniqueOrThrow({ where: { id: auctionId } })
  if (auction.status !== "OPEN") throw new Error("This auction is closed")
  if (new Date() >= auction.endsAt) throw new Error("This auction has ended")

  const minNext = auction.currentBid + auction.minIncrement
  if (amount < minNext) {
    throw new Error(`Bid must be at least ${minNext}`)
  }

  // Re-validate the player is still a free agent (could have been awarded elsewhere).
  await assertFreeAgent(auction.leagueId, auction.playerId)

  const available = await getAvailableFaab(teamId, auctionId)
  if (amount > available) {
    throw new Error(`Bid exceeds your available FAAB (${available})`)
  }

  const league = await prisma.league.findUniqueOrThrow({ where: { id: auction.leagueId } })

  // Anti-snipe: a bid inside the window extends the deadline so others can react.
  const windowMs = league.auctionAntiSnipeMinutes * 60 * 1000
  const now = Date.now()
  const newEndsAt =
    auction.endsAt.getTime() - now < windowMs ? new Date(now + windowMs) : auction.endsAt

  const updated = await prisma.$transaction(async (tx) => {
    await tx.transferBid.create({
      data: { auctionId, teamId, amount, dropPlayerId: dropPlayerId ?? null },
    })
    return tx.transferAuction.update({
      where: { id: auctionId },
      data: { currentBid: amount, currentBidTeamId: teamId, endsAt: newEndsAt },
    })
  })

  return { currentBid: updated.currentBid, endsAt: updated.endsAt }
}

/** Settle a single auction whose deadline has passed. Idempotent on status. */
export async function settleAuction(auctionId: string): Promise<{ awarded: boolean; reason?: string }> {
  const auction = await prisma.transferAuction.findUniqueOrThrow({
    where: { id: auctionId },
    include: { league: true, bids: { orderBy: { createdAt: "desc" } } },
  })
  if (auction.status !== "OPEN") return { awarded: false, reason: "Already settled" }
  if (new Date() < auction.endsAt) return { awarded: false, reason: "Auction still open" }

  const winnerTeamId = auction.currentBidTeamId
  if (!winnerTeamId) {
    await prisma.transferAuction.update({
      where: { id: auctionId },
      data: { status: "CANCELLED", settledAt: new Date(), failReason: "No bids" },
    })
    return { awarded: false, reason: "No bids" }
  }

  // Player must still be available.
  const owned = await prisma.rosterSlot.findFirst({
    where: { playerId: auction.playerId, team: { leagueId: auction.leagueId } },
  })
  if (owned) {
    await prisma.transferAuction.update({
      where: { id: auctionId },
      data: { status: "CANCELLED", settledAt: new Date(), failReason: "Player already owned" },
    })
    return { awarded: false, reason: "Player already owned" }
  }

  // The winning bid carries the optional drop.
  const winningBid = auction.bids.find((b) => b.teamId === winnerTeamId)
  const dropPlayerId = winningBid?.dropPlayerId ?? null

  // Roster-cap guard (reuses the dynasty roster-size math).
  const rosterConfig = auction.league.rosterConfig as unknown as RosterConfig
  const maxRoster = getRosterSize(rosterConfig)
  const rosterCount = await prisma.rosterSlot.count({
    where: { teamId: winnerTeamId, playerId: { not: null }, slotType: { not: "YOUTH" } },
  })
  if (rosterCount >= maxRoster && !dropPlayerId) {
    await prisma.transferAuction.update({
      where: { id: auctionId },
      data: { status: "CANCELLED", settledAt: new Date(), failReason: "Winner roster full — no drop specified" },
    })
    return { awarded: false, reason: "Winner roster full — no drop specified" }
  }

  await prisma.$transaction(async (tx) => {
    if (dropPlayerId) {
      await tx.rosterSlot.updateMany({
        where: { teamId: winnerTeamId, playerId: dropPlayerId },
        data: { playerId: null, isStarting: false },
      })
    }
    const player = await tx.player.findUniqueOrThrow({ where: { id: auction.playerId } })
    await tx.rosterSlot.create({
      data: {
        teamId: winnerTeamId,
        playerId: auction.playerId,
        slotType: "BENCH",
        position: player.position,
        isStarting: false,
        acquireType: "FREE_AGENT",
      },
    })
    await tx.team.update({
      where: { id: winnerTeamId },
      data: { faabBalance: { decrement: auction.currentBid } },
    })
    await tx.transferAuction.update({
      where: { id: auctionId },
      data: { status: "SETTLED", settledAt: new Date() },
    })
  })

  return { awarded: true }
}

/** Settle every due (past-deadline) open auction in a league. */
export async function settleDueAuctions(leagueId: string): Promise<{ settled: number; cancelled: number }> {
  const due = await prisma.transferAuction.findMany({
    where: { leagueId, status: "OPEN", endsAt: { lte: new Date() } },
    select: { id: true },
  })
  let settled = 0
  let cancelled = 0
  for (const a of due) {
    const res = await settleAuction(a.id)
    if (res.awarded) settled++
    else cancelled++
  }
  return { settled, cancelled }
}
