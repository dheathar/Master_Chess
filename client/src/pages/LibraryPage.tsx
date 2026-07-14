import { useEffect, useState } from "react";
import type { LibraryGameSummary, LibrarySort } from "@shared/api";
import * as api from "../api";
import { OpeningExplorer } from "../components/OpeningExplorer";

const PAGE_SIZE = 24;

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "white_asc", label: "White (A–Z)" },
  { value: "black_asc", label: "Black (A–Z)" },
  { value: "plies_desc", label: "Longest" },
  { value: "plies_asc", label: "Shortest" },
];

const RESULT_OPTIONS = [
  { value: "", label: "Any result" },
  { value: "1-0", label: "White won" },
  { value: "0-1", label: "Black won" },
  { value: "1/2-1/2", label: "Draw" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "classic", label: "Classic" },
  { value: "twic", label: "TWIC" },
  { value: "lichess", label: "Lichess" },
  { value: "upload", label: "Upload" },
];

export function LibraryPage({ onOpenGame }: { onOpenGame: (gameId: string) => void }) {
  const [tab, setTab] = useState<"classics" | "explorer">("classics");
  const [games, setGames] = useState<LibraryGameSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [eco, setEco] = useState("");
  const [result, setResult] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<LibrarySort>("date_desc");
  const [page, setPage] = useState(1);

  // Debounce the free-text search so we don't fetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, eco, result, source, sort]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listLibraryGames({
        search: debouncedSearch || undefined,
        eco: eco.trim() || undefined,
        result: result || undefined,
        source: (source || undefined) as never,
        sort,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return;
        setGames(response.games);
        setTotal(response.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load library.");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, eco, result, source, sort, page]);

  async function onPlay(game: LibraryGameSummary) {
    setLoadingId(game.id);
    setError(null);
    try {
      const { gameId } = await api.loadLibraryGame(game.id);
      onOpenGame(gameId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this game.");
      setLoadingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = debouncedSearch || eco || result || source;

  function clearFilters() {
    setSearch("");
    setEco("");
    setResult("");
    setSource("");
    setSort("date_desc");
  }

  return (
    <div className="page">
      <header className="page-header" style={{ display: "block" }}>
        <div className="dashboard-header-eyebrow">library</div>
        <h1 style={{ fontSize: 28 }}>Master game library</h1>
        <p className="muted mono" style={{ margin: "6px 0 0", fontSize: 12.5, textTransform: "uppercase" }}>
          Classic games, fully analysed by Stockfish — no upload required
        </p>
        <div className="auth-tabs" style={{ maxWidth: 320, marginTop: 16 }}>
          <button type="button" className={tab === "classics" ? "active" : ""} onClick={() => setTab("classics")}>
            Games
          </button>
          <button type="button" className={tab === "explorer" ? "active" : ""} onClick={() => setTab("explorer")}>
            Opening explorer
          </button>
        </div>
      </header>

      {tab === "explorer" ? (
        <main className="page-content" style={{ maxWidth: 1100 }}>
          <OpeningExplorer />
        </main>
      ) : (
        <main className="page-content" style={{ maxWidth: 900 }}>
          {/* Search + filter toolbar */}
          <div className="library-toolbar">
            <input
              className="library-search"
              type="search"
              placeholder="Search players, opening, or event…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the library"
            />
            <div className="library-filters">
              <input
                className="library-eco"
                type="text"
                placeholder="ECO"
                maxLength={3}
                value={eco}
                onChange={(e) => setEco(e.target.value.toUpperCase())}
                aria-label="Filter by ECO code"
              />
              <select value={result} onChange={(e) => setResult(e.target.value)} aria-label="Filter by result">
                {RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as LibrarySort)}
                aria-label="Sort games"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {hasFilters ? (
                <button type="button" className="btn-ghost" onClick={clearFilters}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          {games === null ? (
            <p className="muted">Loading…</p>
          ) : games.length === 0 ? (
            <p className="muted">
              {hasFilters ? "No games match these filters." : "The library is empty — import games with npm run library:import."}
            </p>
          ) : (
            <>
              <div className="library-result-count muted mono">
                {total} game{total === 1 ? "" : "s"}
                {hasFilters ? " match" : ""} · page {page} of {totalPages}
              </div>
              <div className="game-list">
                {games.map((game) => (
                  <button
                    key={game.id}
                    className="game-row"
                    onClick={() => onPlay(game)}
                    disabled={loadingId !== null}
                    type="button"
                  >
                    <div className="game-row-eco">{game.eco ?? "—"}</div>
                    <div style={{ minWidth: 260 }}>
                      <div className="game-row-players">
                        <span>{game.white}</span>
                        {game.whiteElo ? <span className="game-row-elo"> ({game.whiteElo})</span> : null}
                        <span className="vs">vs</span>
                        <span>{game.black}</span>
                        {game.blackElo ? <span className="game-row-elo"> ({game.blackElo})</span> : null}
                      </div>
                      <div className="game-row-opening">
                        {game.event ? `${game.event} · ` : ""}
                        {game.opening ?? game.eco ?? ""}
                      </div>
                    </div>
                    <div className="game-row-result">{game.result}</div>
                    <div className="game-row-meta">{game.plyCount} plies</div>
                    <div className="game-row-tail">
                      <span className="game-row-date">{game.playedAt ?? ""}</span>
                      <span className="btn-ghost" style={{ pointerEvents: "none" }}>
                        {loadingId === game.id ? "Loading…" : "Play through →"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="library-pager">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span className="muted mono">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>
      )}
    </div>
  );
}
