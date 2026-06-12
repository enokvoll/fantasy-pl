# Deploying for testers (Fly.io)

The app is a **custom Node server** (`server.ts`) running Next + a Socket.io `/draft` namespace, so it
needs a host that runs one persistent process with WebSockets — **not** Vercel serverless. These steps
deploy a single-machine instance on Fly.io backed by Neon Postgres, seeded with the player pool so
testers can register and draft for the 2026/27 season.

> **Single instance only.** Draft timers/state live in process memory
> (`src/server/socket-server.ts`), so do not scale beyond one machine until that's moved to the DB.

## Prerequisites
- `flyctl` installed and `fly auth login` done.
- A Postgres database — a fresh **Neon** database (or branch) keeps test data isolated from local dev.

## One-time setup
1. **Create the app** (from this directory):
   ```sh
   fly launch --no-deploy        # name it, pick a region; keep the committed fly.toml
   ```
   Your URL will be `https://<app>.fly.dev`.

2. **Set secrets** (runtime env):
   ```sh
   fly secrets set \
     DATABASE_URL="postgresql://…neon…?sslmode=require" \
     AUTH_SECRET="$(openssl rand -base64 32)" \
     NEXTAUTH_URL="https://<app>.fly.dev" \
     CRON_SECRET="$(openssl rand -base64 32)"
   ```

## Deploy
```sh
fly deploy --build-arg NEXT_PUBLIC_SOCKET_URL="https://<app>.fly.dev"
```
- `NEXT_PUBLIC_SOCKET_URL` is baked into the client bundle at build time, so it must be passed here.
- The `release_command` in `fly.toml` runs `prisma migrate deploy` against the prod DB automatically.

## Seed the player pool (once, after the first deploy)
```sh
fly ssh console -C "npm run db:seed:prod"
```
Pulls FPL teams/players/fixtures (currently 2025/26 squads — an acceptable pre-season pool). Re-run
later once FPL publishes 2026/27 squads.

## Smoke test
- `https://<app>.fly.dev/api/health` returns `{ ok: true }`.
- Register an account → create a 2026/27 league (add bots) → open the draft room and start the draft;
  confirm the websocket connects (Network tab shows a `101` to `/draft`) and picks broadcast live.
- Open a second account/browser, join the same league, and draft concurrently.
- `fly logs` is clean.

## Share
Send testers `https://<app>.fly.dev`. Registration is open; they self-register and join via invite code
or create their own leagues.

## Known limitations (fine for trusted testing)
- The draft socket trusts the client-supplied `teamId` and has no commissioner gate on start/pause —
  harden before any wider/public exposure.
- No live scoring is wired here. To enable it later, schedule `/api/sync/scores` + `/api/sync/fixtures`
  (Bearer `CRON_SECRET`) via a Fly cron / GitHub Action.
- Open registration has no rate limiting.
