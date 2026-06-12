# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The import above is intentional: this project pins **bleeding-edge versions with breaking
> changes from training data** (Next.js 16, React 19, Prisma 7, Tailwind v4, NextAuth v5 beta,
> Zod v4). Read the relevant guide under `node_modules/next/dist/docs/` before writing
> framework/Prisma code. The most load-bearing gotchas are listed under "Stack gotchas" below.

## Commands

Run everything from the `fantasy-pl/` directory.

- **Dev server:** `npm run dev` — runs the **custom server** (`server.ts` via `tsx`), not `next dev`.
  This is required because the draft room needs Socket.io. (`npm run dev:next` runs plain Next without
  websockets — only use it for non-realtime UI work.)
- **Build / start:** `npm run build` (`next build`) / `npm run start`.
- **Lint:** `npm run lint` (`eslint`). CI-equivalent gate; keep it clean.
- **Typecheck:** `npx tsc --noEmit` (there is no `typecheck` script).
- **Unit tests:** `npm run test:unit` — DB-free smoke tests in `scripts/test-features.ts` (run via
  `tsx`; sets a dummy `DATABASE_URL` then dynamic-imports pure functions). Add new pure-logic tests
  here. Run a single check by editing/commenting the `test(...)` calls in that file — there is no
  per-test filter (it is a hand-rolled runner, not vitest/jest).
- **E2E:** `npm run test:e2e` (Playwright).
- **Database:** `npm run db:migrate` (`prisma migrate dev`), `db:deploy`, `db:generate`,
  `db:studio`, `db:seed`. The DB is a live Neon Postgres (connection in `.env`, loaded via
  `prisma.config.ts`). After any `schema.prisma` change you must `db:generate` (or migrate) before
  `tsc`/build will see the new types.

## Stack gotchas (these will bite)

- **Prisma client is generated to `src/generated/prisma`** — import from `@/generated/prisma/client`,
  **never** `@prisma/client`. The client needs the pg adapter (see `src/lib/prisma.ts`, which throws
  if `DATABASE_URL` is unset). JSON columns require an `as unknown as T` double-cast on read and a
  `Prisma.InputJsonValue` cast on write.
- **Next 16:** `params`/`searchParams` are async `Promise`s (`await params`). `middleware` is renamed
  `proxy`. Turbopack is default.
- **Tailwind v4:** no `tailwind.config.js`. The theme lives in `src/app/globals.css` via `@theme inline`
  + `:root`/`.dark` CSS variables. `npm run build` fails on unknown color utilities, so it is the real
  check that styling compiles.
- **NextAuth v5:** `export const { handlers, auth, signIn, signOut } = NextAuth(...)` in `src/auth.ts`;
  JWT sessions; `session.user.id` is populated via callbacks.

## Architecture

A draft-based Fantasy Premier League platform: managers draft real PL players (exclusive ownership),
set lineups, and are scored against synced FPL stats in H2H/roto/total-points leagues.

**Request path.** `server.ts` (root) boots Next via a custom HTTP server and attaches
`src/server/socket-server.ts`. App Router lives in `src/app` with route groups `(auth)` and
`(dashboard)`; the league area is `(dashboard)/league/[leagueId]/*`. API routes are colocated under
`src/app/api/**/route.ts`.

**Realtime.** Only the **draft room** is websocket-driven (`/draft` namespace in `socket-server.ts`:
pick timer, bot auto-picks, queue, chat, presence). Everything else (live auctions, lineup locks,
matchup scores) uses **client polling** via React Query — there is no general websocket layer.

**Domain engines (`src/lib/`) are the heart of the app** — most business logic lives here, not in
routes/components, which are thin wrappers:
- `scoring.ts` — `calculatePlayerPoints` (FPL rules + optional formation multipliers) and
  `calculateTeamScore` (auto-subs 0-minute starters, applies formation boosts, persists
  `TeamGameweekScore` with a breakdown `meta` entry).
- `sim-runner.ts` — drives a whole season: auto-draft → per-gameweek lineup + scoring → matchup
  resolution → standings. The simulate endpoints exercise scoring end-to-end without live play.
- `draft-engine.ts` (rookie-aware picks), `dynasty-engine.ts` (offseason rollover, cuts, roster cap),
  `waiver-engine.ts` (legacy blind waivers), `trade-engine.ts` (multi-team, multi-asset trades +
  counter-offers), `transfer-market.ts` (open-ascending FAAB auctions for `MARKETPLACE` leagues),
  `formation-boosts.ts` (config-driven, stored on `League.formationBoostConfig`),
  `lineup-lock.ts` (a player locks once their club's fixture kicks off — drives live substitutions),
  `roster-validator.ts`, `matchup-generator.ts`, `draft-pick-slots.ts`.
- `fpl-api.ts` / `fpl-sync.ts` — pull players, fixtures, gameweeks, and live stats from the public FPL
  API into the DB. `Player`/`Fixture`/`GameWeek`/`PlayerGameweekStat` mirror FPL source data; league
  entities (`League`, `Team`, `RosterSlot`, `Draft`, `Trade`, `WaiverClaim`, `TransferAuction`, …)
  reference players by FPL id.

**Scoring is post-hoc, not live.** Stats are synced from FPL; `calculateTeamScore` computes points
after the fact (including settle-time auto-subs). "Live" features (lineup locks, auctions) gate
*actions* during a gameweek but do not stream points.

**Design system.** Token-driven (see the design-system memory / `src/lib/ui.ts`): indigo/violet
accent, light+dark via `next-themes`, Space Grotesk headings. **Do not hardcode `slate-*`/`emerald-*`/
`text-white`** — use tokens (`bg-card`, `text-muted-foreground`, `text-primary`, semantic
`text-success`/`warn`/`danger`) and the `POSITION_BADGE`/`statusBadge` helpers in `src/lib/ui.ts`.

## Git workflow (commit and push regularly)

Commit and push to GitHub frequently so work is never lost — do not let completed work sit
uncommitted. The repo is `https://github.com/enokvoll/fantasy-pl` (note: username is `enokvoll`).

- **Commit at every stable checkpoint** — after a feature, fix, or coherent unit of work passes
  `npm run lint` and `npx tsc --noEmit`. Prefer several small, focused commits over one large one.
- **Push after committing** (`git push`) so GitHub always reflects the latest state. Don't end a work
  session with local-only commits.
- **Write clean, descriptive messages** — imperative mood, explain the *what* and *why*, e.g.
  `Add live substitution locking to lineup editor`, not `wip` / `fixes` / `update`.
- Never commit secrets (`.env` stays untracked). Don't commit a broken build — get lint + typecheck
  green first.

## Conventions

- Path alias `@/*` → `src/*`.
- Keep heavy logic in `src/lib/*` engines and unit-test the pure parts in `scripts/test-features.ts`;
  routes/components stay thin.
- Commit messages and PRs follow the harness footer rules already in effect for this repo.
