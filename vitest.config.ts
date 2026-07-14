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
    // Several test files share the real dev SQLite file (matching this
    // project's convention of testing against a live DB rather than a mock)
    // and use transactions — running test files in parallel opens multiple
    // concurrent connections to one file and causes spurious "database is
    // locked" errors even with a busy_timeout set. Serializing test files
    // avoids the whole class of contention.
    fileParallelism: false,
  },
});
