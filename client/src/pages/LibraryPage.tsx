import { useEffect, useState } from "react";
import type { LibraryGameSummary } from "@shared/api";
import * as api from "../api";
import { OpeningExplorer } from "../components/OpeningExplorer";

export function LibraryPage({ onOpenGame }: { onOpenGame: (gameId: string) => void }) {
  const [tab, setTab] = useState<"classics" | "explorer">("classics");
  const [games, setGames] = useState<LibraryGameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listLibraryGames()
      .then((response) => setGames(response.games))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load library."));
  }, []);

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
            Classics
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
        {error ? <p className="error-text">{error}</p> : null}

        {games === null ? (
          <p className="muted">Loading…</p>
        ) : (
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
                    <span className="vs">vs</span>
                    <span>{game.black}</span>
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
        )}
      </main>
      )}
    </div>
  );
}
