# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────
# Builder: install all deps (compiles the better-sqlite3 native addon) and
# build the client bundle. Uses the full bookworm image, which ships the
# gcc/g++/make/python toolchain node-gyp needs.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS builder
WORKDIR /app

# Install deps against the lockfile first for cache-friendly rebuilds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the Vite client → dist/client (server runs from TS via tsx, no build).
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────
# Runtime: slim image + the Stockfish engine. Reuses the builder's
# node_modules (same glibc/arch, so the compiled better-sqlite3 binding is
# valid) and runs the server through tsx.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production

# Stockfish provides the analysis engine; tini reaps zombies / forwards signals.
RUN apt-get update \
 && apt-get install -y --no-install-recommends stockfish tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY tsconfig.json vite.config.ts drizzle.config.ts ./
COPY server ./server
COPY shared ./shared
COPY client ./client

# SQLite lives here — mount a persistent volume at /app/data in production,
# or the database (users, games, library) resets on every redeploy.
RUN mkdir -p /app/data

ENV PORT=8030 \
    DATABASE_URL=./data/masterchess.db \
    STOCKFISH_BIN=/usr/games/stockfish \
    ENGINE_POOL_SIZE=2 \
    ENGINE_DEPTH=16 \
    ENGINE_MULTIPV=4

EXPOSE 8030

# Migrations + the golden-library seed run automatically on first boot
# (see server/index.ts). npm start = NODE_ENV=production tsx server/index.ts.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
