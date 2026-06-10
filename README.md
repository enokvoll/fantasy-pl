# Fantasy Premier League — Draft Platform

A full fantasy football platform for the English Premier League: create leagues, run live
real-time drafts (snake / slow), manage rosters and weekly lineups, process waivers and trades,
and simulate full seasons against real FPL scoring. Supports **Redraft**, **Keeper**, and
**Dynasty** league modes (dynasty rosters carry over season-to-season with a rookie draft).

## Tech stack

- **Next.js 16** (App Router) + **React 19**, **Tailwind CSS v4**
- **Prisma 7** + **PostgreSQL** (the project uses a managed Neon database)
- **NextAuth v5** (credentials / email + password, JWT sessions)
- **Socket.io** for the live draft room (served by a custom Node server — see below)
- **TanStack Query** for client data fetching, **Zod** for validation

> ⚠️ The live draft requires a long-lived Node process for Socket.io. The app is served by a
> **custom server** (`server.ts`), so `npm run dev` / `npm start` run that — not the bare
> `next` CLI. This also means it **cannot be deployed to Vercel serverless**; use a Node host
> (Railway / Render / Fly).

---

## Local setup

Prerequisites: Node 20+, a PostgreSQL database (e.g. a free [Neon](https://neon.tech) project).

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env      # then fill in the values (see below)

# 3. Apply the database schema
npm run db:migrate         # runs prisma migrate dev

# 4. Load real FPL data (teams, players, gameweeks, fixtures, historical stats)
npm run db:seed            # hits the public FPL API; takes ~1 min

# 5. Run it (custom server with Socket.io + HMR)
npm run dev                # → http://localhost:3000
```

Then register an account at `/register`, create a league, add bots to fill it, and start a draft.

### Environment variables (`.env`)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (Neon, with `?sslmode=require`) |
| `NEXTAUTH_URL` | App origin — `http://localhost:3000` locally; the public URL in prod. Also used for Socket.io CORS. |
| `NEXTAUTH_SECRET` | Session signing secret — `openssl rand -base64 32` |
| `CRON_SECRET` | Bearer token protecting the `/api/sync/*` endpoints |
| `NEXT_PUBLIC_SOCKET_URL` | Origin the browser connects the draft socket to — same as `NEXTAUTH_URL` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Optional OAuth; not required (credentials auth works without them) |

### Useful scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Custom server (Next + Socket.io) with HMR |
| `npm run dev:next` | Plain `next dev` (no Socket.io) — fallback only |
| `npm run build` | Production build |
| `npm start` | Production custom server (`NODE_ENV=production`) |
| `npm run db:migrate` | Create + apply a dev migration |
| `npm run db:deploy` | Apply migrations in CI/prod (`prisma migrate deploy`) |
| `npm run db:seed` | Bootstrap FPL data |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright smoke test (see below) |

---

## Deploying a public demo (Railway / Render / Fly)

Vercel can't host the Socket.io server — pick a host that runs a persistent Node process.

1. Create the service from this repo. Provision a PostgreSQL database (or reuse the Neon one).
2. Set the env vars above, with `NEXTAUTH_URL` **and** `NEXT_PUBLIC_SOCKET_URL` set to the
   public URL (e.g. `https://your-app.up.railway.app`).
3. **Build command:** `npm run build`
4. **Release / pre-start step:** `npm run db:deploy` (applies migrations), then seed once with
   `npm run db:seed` (or run it manually against the prod DB the first time).
5. **Start command:** `npm start`

The custom server reads `PORT` from the environment, which these hosts set automatically.

---

## Testing

A Playwright happy-path smoke test covers the core journey
(register → create league → add bots → simulate a season → standings populate).

```bash
npx playwright install chromium   # one-time
npm run test:e2e
```

Prerequisites: the database must be migrated and seeded (steps 3–4 above) so player/stat data
exists. The Playwright config starts the dev server automatically.

---

## Project layout

- `src/app/(dashboard)/…` — league UI (overview, draft, roster, waivers, trades, standings, simulate)
- `src/app/api/…` — REST endpoints (leagues, draft, waivers, trades, sync, simulate, rollover)
- `src/lib/…` — engines: `draft-engine`, `dynasty-engine`, `waiver-engine`, `trade-engine`,
  `scoring`, `sim-runner`, `fpl-sync` / `fpl-api`
- `server.ts` + `src/server/socket-server.ts` — custom HTTP server + live draft socket
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts` — data layer
