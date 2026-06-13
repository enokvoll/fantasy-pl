import { prisma } from "@/lib/prisma"
import { makePick, getAutoPickPlayer, getTeamForPick } from "@/lib/draft-engine"
import { generateMatchupSchedule } from "@/lib/matchup-generator"
import type { RosterConfig } from "@/types/draft"

export type DraftPhase = "YOUTH_DRAFT_PENDING" | "SEASON"

/**
 * Auto-pick every remaining pick of a draft until it is COMPLETED. Works for the
 * startup, rookie, and youth drafts alike — `makePick` decides completion per
 * draft type, so this loop just relies on the draft's status flipping to
 * COMPLETED. No matchup/season side effects (see `finalizeDraftCompletion`).
 */
export async function finishDraftPicks(draftId: string): Promise<{ picks: number }> {
  const draft = await prisma.draft.findUniqueOrThrow({
    where: { id: draftId },
    include: { league: { include: { teams: { orderBy: { draftOrder: "asc" } } } } },
  })

  // A draft must be IN_PROGRESS for makePick to accept picks. Auto-finishing a
  // not-yet-started or paused draft just resumes it; a COMPLETED draft is a no-op.
  if (draft.status === "PENDING" || draft.status === "PAUSED") {
    await prisma.draft.update({
      where: { id: draftId },
      data: { status: "IN_PROGRESS", startedAt: draft.startedAt ?? new Date() },
    })
  } else if (draft.status !== "IN_PROGRESS") {
    return { picks: 0 }
  }

  const rosterConfig = draft.league.rosterConfig as unknown as RosterConfig
  const teamIds = draft.league.teams.map((t) => t.id)
  // Offseason drafts (rookie/youth) with REVERSE_STANDINGS use a linear order.
  const snake = !((draft.isRookieDraft || draft.isYouthDraft) && draft.league.rookieDraftOrder === "REVERSE_STANDINGS")

  // Safety bound so a stuck auto-pick can never loop forever.
  const maxPicks = teamIds.length * 40
  let picks = 0

  for (let i = 0; i < maxPicks; i++) {
    const current = await prisma.draft.findUniqueOrThrow({ where: { id: draftId } })
    if (current.status === "COMPLETED") break

    const currentTeamId = getTeamForPick(teamIds, current.currentPick, snake)
    try {
      const playerId = await getAutoPickPlayer(currentTeamId, draftId, rosterConfig)
      await makePick(draftId, currentTeamId, playerId, true)
      picks++
    } catch {
      break
    }
  }

  return { picks }
}

/**
 * Run the post-draft transition. Called after the final pick of a draft lands.
 *
 * For the *main* draft of a dynasty league with a youth squad, we pause so the
 * commissioner can run the initial youth draft (the league stays SETUP and the
 * "Start youth draft" button appears). In every other case — youth draft done,
 * or a non-youth league — we generate the H2H schedule and open the season.
 */
export async function finalizeDraftCompletion(
  leagueId: string,
  { pauseForYouth }: { pauseForYouth: boolean }
): Promise<{ nextPhase: DraftPhase }> {
  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })
  const draft = await prisma.draft.findFirst({ where: { leagueId } })

  const youthSquad = league.type === "DYNASTY" && league.youthSquadEnabled
  const mainDraftJustFinished = !!draft && !draft.isYouthDraft

  if (pauseForYouth && youthSquad && mainDraftJustFinished) {
    return { nextPhase: "YOUTH_DRAFT_PENDING" }
  }

  if (league.scoringType === "H2H") {
    await generateMatchupSchedule(leagueId)
  }
  await prisma.league.update({
    where: { id: leagueId },
    data: { status: "IN_SEASON" },
  })

  return { nextPhase: "SEASON" }
}
