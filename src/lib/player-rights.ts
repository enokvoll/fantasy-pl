import { prisma } from "@/lib/prisma"
import { getRosterSize } from "@/lib/dynasty-engine"
import type { RosterConfig } from "@/types/draft"

/**
 * Player Rights lifecycle.
 *
 * When a rostered player leaves the Premier League (their club is relegated or they
 * transfer abroad and drop out of the FPL dataset), the owning team keeps an exclusive
 * claim. The roster slot is freed so the team isn't stuck under-roster. If the player
 * later returns to the PL the holding team gets first refusal to re-sign them; no other
 * team may acquire a player with active rights.
 */

/**
 * A rostered player has left the FPL pool. For every team that holds them (one per
 * league), record HELD rights and free the roster slot. Idempotent per (league, player).
 */
export async function handlePlayerDeparture(playerId: number, reason?: string): Promise<void> {
  const slots = await prisma.rosterSlot.findMany({
    where: { playerId },
    include: { team: { select: { id: true, leagueId: true } } },
  })
  if (slots.length === 0) return // unrostered departure → no rights

  for (const slot of slots) {
    await prisma.$transaction([
      prisma.playerRights.upsert({
        where: { leagueId_playerId: { leagueId: slot.team.leagueId, playerId } },
        create: {
          leagueId: slot.team.leagueId,
          teamId: slot.team.id,
          playerId,
          status: "HELD",
          reason,
        },
        // Keep the existing holder; just ensure it's marked HELD again on re-departure.
        update: { status: "HELD", reason },
      }),
      prisma.rosterSlot.delete({ where: { id: slot.id } }),
    ])
  }
}

/** A player is back in the FPL pool: flip any held rights to re-signable. */
export async function handlePlayerReturn(playerId: number): Promise<void> {
  await prisma.playerRights.updateMany({
    where: { playerId, status: "HELD" },
    data: { status: "AVAILABLE_TO_RESIGN" },
  })
}

/**
 * Re-sign a returned player onto the holding team's roster. The right must be
 * AVAILABLE_TO_RESIGN and belong to this team. Respects the senior roster cap; pass
 * `dropPlayerId` to make room. Consumes the rights row on success.
 */
export async function resignPlayer(
  teamId: string,
  playerId: number,
  dropPlayerId?: number
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { league: true },
  })
  if (!team) throw new Error("Team not found")

  const rights = await prisma.playerRights.findUnique({
    where: { leagueId_playerId: { leagueId: team.leagueId, playerId } },
  })
  if (!rights || rights.teamId !== teamId) throw new Error("Your team does not hold rights to this player")
  if (rights.status !== "AVAILABLE_TO_RESIGN")
    throw new Error("This player has not returned to the Premier League yet")

  const player = await prisma.player.findUnique({ where: { id: playerId } })
  if (!player) throw new Error("Player not found")

  const cap = getRosterSize(team.league.rosterConfig as unknown as RosterConfig)
  const seniorCount = await prisma.rosterSlot.count({
    where: { teamId, slotType: { not: "YOUTH" } },
  })

  await prisma.$transaction(async (tx) => {
    let openSpots = cap - seniorCount
    if (dropPlayerId !== undefined) {
      const dropped = await tx.rosterSlot.findFirst({
        where: { teamId, playerId: dropPlayerId, slotType: { not: "YOUTH" } },
      })
      if (!dropped) throw new Error("Drop player is not on your senior roster")
      await tx.rosterSlot.delete({ where: { id: dropped.id } })
      openSpots += 1
    }
    if (openSpots < 1) throw new Error("Roster is full — drop a player to re-sign")

    await tx.rosterSlot.create({
      data: {
        teamId,
        playerId,
        slotType: "BENCH",
        position: player.position,
        isStarting: false,
        acquireType: "FREE_AGENT",
      },
    })
    await tx.playerRights.delete({ where: { id: rights.id } })
  })
}

/**
 * Guard for acquisition paths: throw if another team holds active rights to the player.
 * Pass `byTeamId` to allow the holder through (e.g. their own re-sign).
 */
export async function assertNotRightsHeld(
  leagueId: string,
  playerId: number,
  byTeamId?: string
): Promise<void> {
  const rights = await prisma.playerRights.findUnique({
    where: { leagueId_playerId: { leagueId, playerId } },
  })
  if (rights && rights.teamId !== byTeamId) {
    throw new Error("Another team holds the rights to this player")
  }
}
