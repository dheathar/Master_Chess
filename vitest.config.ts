import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    // Tests run against a dedicated, disposable SQLite file (data/test.db),
    // created and migrated fresh by the global setup, so `npm test` never
    // pollutes the real dev database (data/masterchess.db) with fixture rows.
    env: { DATABASE_URL: "./data/test.db" },
    globalSetup: "./vitest.globalSetup.ts",
    // Test files share one SQLite file and use transactions — running them in
    // parallel opens multiple concurrent connections and causes spurious
    // "database is locked" errors even with a busy_timeout set. Serializing
    // test files avoids the whole class of contention.
    fileParallelism: false,
  },
});
