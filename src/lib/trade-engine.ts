import { prisma } from "@/lib/prisma"
import type { TradeAsset } from "@/generated/prisma/client"

export async function proposeTrade(
  leagueId: string,
  offeringTeamId: string,
  receivingTeamId: string,
  assets: Array<{ fromTeamId: string; toTeamId: string; playerId?: number; draftPickSlotId?: string }>,
  notes?: string,
  expiresAt?: Date
): Promise<string> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })

  // Validate all assets belong to their fromTeam
  for (const asset of assets) {
    if (asset.playerId) {
      const slot = await prisma.rosterSlot.findFirst({
        where: { teamId: asset.fromTeamId, playerId: asset.playerId },
      })
      if (!slot) throw new Error(`Player ${asset.playerId} not on team ${asset.fromTeamId}`)
    }
  }

  // Check trade deadline
  if (league.tradeDeadlineGameweek) {
    const currentGW = await prisma.gameWeek.findFirst({ where: { isCurrent: true } })
    if (currentGW && currentGW.id >= league.tradeDeadlineGameweek) {
      throw new Error("Trade deadline has passed")
    }
  }

  const trade = await prisma.trade.create({
    data: {
      leagueId,
      offeringTeamId,
      receivingTeamId,
      notes,
      expiresAt,
      votesRequired: 0,
      assets: {
        create: assets.map((a) => ({
          fromTeamId: a.fromTeamId,
          toTeamId: a.toTeamId,
          playerId: a.playerId ?? null,
          draftPickSlotId: a.draftPickSlotId ?? null,
        })),
      },
    },
  })

  return trade.id
}

export async function executeTrade(tradeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.findUniqueOrThrow({
      where: { id: tradeId },
      include: { assets: true },
    })

    if (trade.status !== "ACCEPTED") throw new Error("Trade not in ACCEPTED state")

    await tx.trade.update({
      where: { id: tradeId },
      data: { status: "PROCESSING" },
    })

    for (const asset of trade.assets) {
      if (asset.playerId) {
        // Move player from fromTeam to toTeam
        await tx.rosterSlot.updateMany({
          where: { teamId: asset.fromTeamId, playerId: asset.playerId },
          data: { teamId: asset.toTeamId, acquireType: "TRADE" },
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

export async function validateTrade(
  tradeId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const trade = await prisma.trade.findUniqueOrThrow({
    where: { id: tradeId },
    include: { assets: { include: { player: true } } },
  })

  const errors: string[] = []

  if (trade.expiresAt && new Date() > trade.expiresAt) {
    errors.push("Trade has expired")
  }

  // Verify all player assets still on the fromTeam
  for (const asset of trade.assets) {
    if (asset.playerId) {
      const slot = await prisma.rosterSlot.findFirst({
        where: { teamId: asset.fromTeamId, playerId: asset.playerId },
      })
      if (!slot) {
        errors.push(`Player ${asset.player?.webName ?? asset.playerId} is no longer on the offering team`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
