# Deploying Master Chess to Dokploy

Master Chess ships as a **single container** (Express serves both the `/api`
and the built React client) plus a **persistent volume** for its SQLite
database. Dokploy builds the committed `Dockerfile` straight from the public
GitHub repo.

## What the image contains

- Node 22 runtime running the server via `tsx` (`npm start`).
- The **Stockfish** engine (`/usr/games/stockfish`) for game analysis.
- The prebuilt client bundle (`dist/client`), served in production mode.
- Migrations and the golden-library seed run automatically on first boot.

## Application settings (Dokploy → Chess Master → application)

| Setting | Value |
|---|---|
| Source | Git — `https://github.com/dheathar/Master_Chess.git`, branch `main` |
| Build type | Dockerfile (`Dockerfile`, context `/`) |
| Container port | `8030` |

### Environment variables

```
NODE_ENV=production
PORT=8030
DATABASE_URL=./data/masterchess.db
STOCKFISH_BIN=/usr/games/stockfish
ENGINE_POOL_SIZE=2
ENGINE_DEPTH=16
ENGINE_MULTIPV=4
# Optional — seeds an admin account on first boot (min 12 chars):
# ADMIN_BOOTSTRAP_PASSWORD=<a-strong-password>
```

The LLM narrator defaults to Ollama; with no Ollama reachable it falls back to
the deterministic, engine-only summary — so no LLM config is required to run.

### Persistent volume (required)

Mount a volume at **`/app/data`** so the database (users, games, library)
survives redeploys. Without it, every deploy starts from an empty DB and
re-seeds the ~6,170-game library from scratch.

### Domain

Add a domain pointing at container port `8030`; Dokploy issues Let's Encrypt TLS
via Traefik. The client calls the API same-origin, so no extra config is needed.

## First boot

Seeding the golden library parses ~6,170 games and takes ~30–60s on first start
only (skipped once the volume has data). Health check: `GET /api/health`.

## Local production-parity test

```bash
docker compose up --build   # then open http://localhost:8030
```
