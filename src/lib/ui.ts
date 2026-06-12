import type { Position } from "@/generated/prisma/client"

/**
 * Shared visual tokens so position pills and status badges look identical (and
 * legible in both light + dark) everywhere. Replaces the per-component POS_COLORS
 * maps that previously drifted across roster / market / trades / waivers / draft.
 */

/** GK / DEF / MID / FWD pill classes. Distinct hues, readable on both themes. */
export const POSITION_BADGE: Record<Position, string> = {
  GK: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DEF: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  MID: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  FWD: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
}

/** Fallback for string-typed positions. */
export function positionBadge(position: string): string {
  return POSITION_BADGE[position as Position] ?? "bg-muted text-muted-foreground"
}

type Tone = "success" | "warn" | "danger" | "info" | "muted"

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success/15 text-success",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  info: "bg-primary/15 text-primary",
  muted: "bg-muted text-muted-foreground",
}

/** Map a trade / claim / auction status to a tone class. */
export function statusBadge(status: string): string {
  switch (status) {
    case "APPROVED":
    case "ACCEPTED":
    case "COMPLETED":
    case "SETTLED":
      return TONE_CLASS.success
    case "PENDING":
    case "OPEN":
    case "PROCESSING":
      return TONE_CLASS.warn
    case "REJECTED":
    case "VETOED":
    case "CANCELLED":
      return TONE_CLASS.danger
    case "COUNTERED":
      return TONE_CLASS.info
    default:
      return TONE_CLASS.muted
  }
}

export const tone = TONE_CLASS
