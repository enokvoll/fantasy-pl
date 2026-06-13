# Fantasy PL — custom Next.js + Socket.io server, run via tsx.
# Multi-stage: install deps → build (next build) → lean runtime that ships the
# TS source (the custom server runs through tsx) alongside the compiled .next.

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
# OpenSSL is handy for Prisma/pg TLS; libc is fine on slim otherwise.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# Playwright (a devDependency) auto-downloads browser binaries in its postinstall;
# the server image never runs browser tests, so skip that download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Use `npm install`, not `npm ci`: the lock is generated on Windows and omits the
# linux-only WASM-fallback subtree (@emnapi/core, @emnapi/runtime — transitive deps
# of @img/sharp-wasm32 and @unrs/resolver-binding-wasm32-wasi). `npm ci` treats that
# as "out of sync" and fails on linux; `npm install` reconciles it while still
# honoring the locked versions of everything present.
RUN npm install --no-audit --no-fund

# ── build ───────────────────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* must be present at build time (baked into the client bundle).
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_TELEMETRY_DISABLED=1
# Regenerate the Prisma client for this platform, then build (lazy prisma means
# this build does not need DATABASE_URL).
RUN npx prisma generate && npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# The custom server is executed by tsx, so the runtime needs the TS source plus
# tsconfig (for the @/* path alias), the built .next output, deps, and prisma.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/next.config.* ./
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "run", "start"]
