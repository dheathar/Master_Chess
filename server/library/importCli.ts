import fs from "node:fs";
import { importLibraryPgn, type LibrarySource } from "./importer";

/**
 * CLI entry point for growing the master-game library from downloaded
 * corpora (TWIC weekly files, Lichess elite exports, etc.) without needing
 * a running server. Usage:
 *
 *   npm run library:import -- path/to/file.pgn --source twic
 */
function parseArgs(argv: string[]): { filePath: string | null; source: LibrarySource } {
  const [filePath, ...rest] = argv;
  const sourceFlagIndex = rest.indexOf("--source");
  const rawSource = sourceFlagIndex >= 0 ? rest[sourceFlagIndex + 1] : "upload";
  const validSources: LibrarySource[] = ["classic", "twic", "lichess", "upload"];
  const source = validSources.includes(rawSource as LibrarySource) ? (rawSource as LibrarySource) : "upload";
  return { filePath: filePath ?? null, source };
}

const { filePath, source } = parseArgs(process.argv.slice(2));

if (!filePath) {
  console.error("Usage: npm run library:import -- <file.pgn> [--source classic|twic|lichess|upload]");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(filePath, "utf8");
const result = importLibraryPgn(raw, source);

console.log(`Imported ${result.imported}, duplicates ${result.duplicates}, rejected ${result.rejected.length}.`);
for (const rejection of result.rejected) {
  console.log(`  rejected game #${rejection.index}: ${rejection.reason}`);
}
