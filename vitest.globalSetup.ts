import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";

/**
 * Tests run against a dedicated, disposable SQLite file (data/test.db) rather
 * than the real dev database. This keeps `npm test` from accumulating fixture
 * rows (Alice/Bob games, throwaway users) in data/masterchess.db. The file is
 * rebuilt fresh each run and migrated to the current schema. `test.env` in
 * vitest.config.ts points DATABASE_URL here for the worker processes.
 */
export default function setup(): void {
  const testDbPath = path.resolve(process.cwd(), "data/test.db");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      fs.rmSync(testDbPath + suffix);
    } catch {
      /* not present — fine */
    }
  }
  fs.mkdirSync(path.dirname(testDbPath), { recursive: true });

  const sqlite = new Database(testDbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "./server/db/migrations" });
  sqlite.close();
}
