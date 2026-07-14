import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, rawSqlite } from "./client";

migrate(db, { migrationsFolder: "./server/db/migrations" });
console.log("Migrations applied.");
rawSqlite.close();
