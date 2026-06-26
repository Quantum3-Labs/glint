# syntax=docker/dockerfile:1.7

# --- 1. deps: install node_modules via pnpm --------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Force pnpm 10.33.0 — corepack otherwise pulls pnpm 11, which hard-fails the
# install on ignored build scripts (ERR_PNPM_IGNORED_BUILDS). 10.x only warns.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- 2. builder: compile Next.js to .next/standalone -----------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm build

# --- 3. runner: minimal image that serves the standalone output -----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run overrides PORT at runtime; 3000 is the local-dev default.
ENV PORT=3000
# Must bind to all interfaces or the container port is unreachable.
ENV HOSTNAME=0.0.0.0

# Non-root user — Cloud Run doesn't require it, but it's good hygiene.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Next.js standalone layout:
#   .next/standalone/       → minimal server.js + trimmed node_modules
#   .next/standalone/public/  ← copied manually (standalone excludes it)
#   .next/standalone/.next/static/ ← copied manually (standalone excludes it)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Writable dir for the JSONFileStore (local / single-instance demo only).
# Override with CREATORS_STORE_PATH=/some/other/path if mounting a volume.
RUN mkdir -p /app/.data && chown nextjs:nodejs /app/.data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
