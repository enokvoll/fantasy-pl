import { prisma } from "@/lib/prisma"

export interface TradeAssetInput {
  fromTeamId: string
  toTeamId: string
  playerId?: number
  draftPickSlotId?: string
}

/**
 * Propose a trade between 2+ teams.
 * Creates the Trade, its TradeAssets, and TradeParticipant rows
 * (proposer = ACCEPTED, all other involved teams = PENDING).
 */
export async function proposeTrade(
  leagueId: string,
  proposerTeamId: string,
  participantTeamIds: string[],
  assets: TradeAssetInput[],
  notes?: string,
  expiresAt?: Date
): Promise<string> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })

  // De-dupe + ensure proposer is included
  const teamIds = Array.from(new Set([proposerTeamId, ...participantTeamIds]))
  if (teamIds.length < 2) throw new Error("A trade needs at least two teams")
  if (assets.length === 0) throw new Error("A trade needs at least one asset")

  // Validate every asset belongs to its fromTeam and routes to an involved team
  for (const asset of assets) {
    if (!teamIds.includes(asset.fromTeamId) || !teamIds.includes(asset.toTeamId)) {
      throw new Error("Assets must move between teams involved in the trade")
    }
    if (asset.fromTeamId === asset.toTeamId) {
      throw new Error("An asset cannot move to the same team")
    }
    if (asset.playerId) {
      const slot = await prisma.rosterSlot.findFirst({
        where: { teamId: asset.fromTeamId, playerId: asset.playerId },
      })
      if (!slot) throw new Error(`A selected player is not on the offering team's roster`)
    }
    if (asset.draftPickSlotId) {
      const pick = await prisma.draftPickSlot.findFirst({
        where: { id: asset.draftPickSlotId, teamId: asset.fromTeamId },
      })
      if (!pick) throw new Error(`A selected draft pick is not owned by the offering team`)
    }
  }

  // Trade deadline check
  if (league.tradeDeadlineGameweek) {
    const currentGW = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
    if (currentGW && currentGW.id >= league.tradeDeadlineGameweek) {
      throw new Error("Trade deadline has passed")
    }
  }

  const receivingTeamId = teamIds.find(id => id !== proposerTeamId)!

  const trade = await prisma.trade.create({
    data: {
      leagueId,
      offeringTeamId: proposerTeamId,
      receivingTeamId,
      isMultiTeam: teamIds.length > 2,
      notes,
      expiresAt,
      votesRequired: 0,
      assets: {
        create: assets.map(a => ({
          fromTeamId: a.fromTeamId,
          toTeamId: a.toTeamId,
          playerId: a.playerId ?? null,
          draftPickSlotId: a.draftPickSlotId ?? null,
        })),
      },
      participants: {
        create: teamIds.map(id => ({
          teamId: id,
          role: id === proposerTeamId ? "PROPOSER" : "RECIPIENT",
          status: id === proposerTeamId ? "ACCEPTED" : "PENDING",
        })),
      },
    },
  })

  return trade.id
}

/**
 * A team accepts or rejects a trade.
 * - Reject by anyone → trade REJECTED.
 * - When all non-proposer participants have ACCEPTED → execute.
 */
export async function respondToTrade(
  tradeId: string,
  teamId: string,
  accept: boolean
): Promise<{ status: string }> {
  const trade = await prisma.trade.findUniqueOrThrow({
    where: { id: tradeId },
    include: { participants: true },
  })
  if (trade.status !== "PENDING") throw new Error("This trade is no longer pending")

  const participant = trade.participants.find(p => p.teamId === teamId)
  if (!participant) throw new Error("Your team is not part of this trade")
  if (participant.role === "PROPOSER") throw new Error("The proposer cannot respond to their own trade")
  if (participant.status !== "PENDING") throw new Error("You have already responded to this trade")

  if (!accept) {
    await prisma.$transaction([
      prisma.tradeParticipant.update({ where: { id: participant.id }, data: { status: "REJECTED" } }),
      prisma.trade.update({ where: { id: tradeId }, data: { status: "REJECTED" } }),
    ])
    return { status: "REJECTED" }
  }

  await prisma.tradeParticipant.update({ where: { id: participant.id }, data: { status: "ACCEPTED" } })

  // All non-proposer participants accepted?
  const fresh = await prisma.tradeParticipant.findMany({ where: { tradeId } })
  const allAccepted = fresh.filter(p => p.role === "RECIPIENT").every(p => p.status === "ACCEPTED")

  if (allAccepted) {
    await prisma.trade.update({ where: { id: tradeId }, data: { status: "ACCEPTED" } })
    await executeTrade(tradeId)
    return { status: "COMPLETED" }
  }

  return { status: "PENDING" }
}

/** Proposer cancels their own pending trade. */
export async function cancelTrade(tradeId: string, teamId: string): Promise<void> {
  const trade = await prisma.trade.findUniqueOrThrow({
    where: { id: tradeId },
    include: { participants: true },
  })
  if (trade.status !== "PENDING") throw new Error("Only pending trades can be cancelled")
  const proposer = trade.participants.find(p => p.role === "PROPOSER")
  if (proposer?.teamId !== teamId) throw new Error("Only the proposer can cancel this trade")

  await prisma.trade.update({ where: { id: tradeId }, data: { status: "CANCELLED" } })
}

/** Commissioner force-executes or cancels any trade. */
export async function commissionerAction(
  tradeId: string,
  action: "force" | "cancel"
): Promise<void> {
  if (action === "cancel") {
    await prisma.trade.update({ where: { id: tradeId }, data: { status: "CANCELLED" } })
    return
  }
  // force
  await prisma.$transaction([
    prisma.tradeParticipant.updateMany({ where: { tradeId }, data: { status: "ACCEPTED" } }),
    prisma.trade.update({ where: { id: tradeId }, data: { status: "ACCEPTED", adminOverride: true } }),
  ])
  await executeTrade(tradeId)
}

/** Move all assets between teams atomically, after re-validating ownership. */
export async function executeTrade(tradeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.findUniqueOrThrow({
      where: { id: tradeId },
      include: { assets: true },
    })
    if (trade.status !== "ACCEPTED") throw new Error("Trade not in ACCEPTED state")

    await tx.trade.update({ where: { id: tradeId }, data: { status: "PROCESSING" } })

    // Re-validate ownership inside the transaction
    for (const asset of trade.assets) {
      if (asset.playerId) {
        const slot = await tx.rosterSlot.findFirst({
          where: { teamId: asset.fromTeamId, playerId: asset.playerId },
        })
        if (!slot) throw new Error("A player in this trade is no longer owned by the offering team")
      }
      if (asset.draftPickSlotId) {
        const pick = await tx.draftPickSlot.findFirst({
          where: { id: asset.draftPickSlotId, teamId: asset.fromTeamId },
        })
        if (!pick) throw new Error("A draft pick in this trade is no longer owned by the offering team")
      }
    }

    // Move assets
    for (const asset of trade.assets) {
      if (asset.playerId) {
        await tx.rosterSlot.updateMany({
          where: { teamId: asset.fromTeamId, playerId: asset.playerId },
          data: { teamId: asset.toTeamId, acquireType: "TRADE", isStarting: false, isOnTradeBlock: false },
        })
      }
      if (asset.draftPickSlotId) {
        await tx.draftPickSlot.update({
          where: { id: asset.draftPickSlotId },
          data: { teamId: asset.toTeamId },
        })
      }
    }

    await tx.trade.update({
      where: { id: tradeId },
      data: { status: "COMPLETED", processedAt: new Date() },
    })
  })
}

export async function validateTrade(tradeId: string): Promise<{ valid: boolean; errors: string[] }> {
  const trade = await prisma.trade.findUniqueOrThrow({
    where: { id: tradeId },
    include: { assets: { include: { player: true } } },
  })

  const errors: string[] = []
  if (trade.expiresAt && new Date() > trade.expiresAt) errors.push("Trade has expired")

  for (const asset of trade.assets) {
    if (asset.playerId) {
      const slot = await prisma.rosterSlot.findFirst({
        where: { teamId: asset.fromTeamId, playerId: asset.playerId },
      })
      if (!slot) errors.push(`${asset.player?.webName ?? "A player"} is no longer on the offering team`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/** Toggle a player's trade-block flag. */
export async function setTradeBlock(teamId: string, playerId: number, on: boolean): Promise<void> {
  await prisma.rosterSlot.updateMany({
    where: { teamId, playerId },
    data: { isOnTradeBlock: on },
  })
}
