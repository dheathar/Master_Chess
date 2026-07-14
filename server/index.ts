import "dotenv/config";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth";
import { gamesRouter } from "./routes/games";
import { playerModelRouter } from "./routes/playerModel";
import { libraryRouter } from "./routes/library";
import { drillsRouter } from "./routes/drills";
import { prescriptionRouter } from "./routes/prescription";
import { helpRouter } from "./routes/help";
import { journeyRouter } from "./routes/journey";
import { attachUser } from "./auth/middleware";
import { ensureSeedAdmin, purgeExpiredSessions } from "./auth/authService";
import { resumeInterruptedAnalyses } from "./pipeline/analysisQueue";
import { ensureLibrarySeeded } from "./library/importer";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, rawSqlite } from "./db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

migrate(db, { migrationsFolder: path.join(root, "server/db/migrations") });
await ensureSeedAdmin();
ensureLibrarySeeded();
resumeInterruptedAnalyses();
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 60 * 60 * 1000).unref();

const app = express();
app.use(helmet());
app.set("trust proxy", true);
app.use(express.json({ limit: "10mb" }));
app.use(attachUser);

app.use("/api/auth", authRouter);
app.use("/api/games", gamesRouter);
app.use("/api/player-model", playerModelRouter);
app.use("/api/library", libraryRouter);
app.use("/api/drills", drillsRouter);
app.use("/api/prescription", prescriptionRouter);
app.use("/api/help", helpRouter);
app.use("/api/journey", journeyRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, engine: process.env.STOCKFISH_BIN ?? "stockfish" });
});

const distClient = path.join(root, "dist/client");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distClient));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distClient, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // JSON parsing errors (including entity.parse.failed)
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "Malformed JSON in request body." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

const port = Number(process.env.PORT ?? 8030);
app.listen(port, () => {
  console.log(`Master Chess API listening on :${port}`);
});

process.on("SIGTERM", () => {
  rawSqlite.close();
  process.exit(0);
});
