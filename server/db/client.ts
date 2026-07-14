import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL ?? "./data/masterchess.db";
const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const sqlite = new Database(resolvedPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
// better-sqlite3 has no busy timeout by default — a second connection
// (e.g. a concurrent test worker, or the dev server plus a CLI script)
// hitting a momentary write lock fails immediately with "database is
// locked" instead of waiting. A short timeout lets WAL mode's normal
// concurrent-reader/single-writer model actually queue instead of erroring.
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
export const rawSqlite = sqlite;
