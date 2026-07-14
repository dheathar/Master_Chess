import { useEffect, useState } from "react";
import type { GameSummary } from "@shared/api";
import * as api from "../api";
import { useAuthStore } from "../store/useAuthStore";

function accuracyColor(accuracy: number): string {
  if (accuracy >= 85) return "var(--best)";
  if (accuracy >= 75) return "var(--gold)";
  return "var(--mistake)";
}

function resultColor(result: string | null, playerColor: GameSummary["playerColor"]): string {
  if (!result || !playerColor) return "var(--text-muted)";
  const playerWon = (playerColor === "white" && result === "1-0") || (playerColor === "black" && result === "0-1");
  const playerLost = (playerColor === "white" && result === "0-1") || (playerColor === "black" && result === "1-0");
  if (playerWon) return "var(--best)";
  if (playerLost) return "var(--blunder)";
  return "var(--text-muted)";
}

export function DashboardPage({
  onOpenGame,
  onUpload,
}: {
  onOpenGame: (gameId: string) => void;
  onUpload: () => void;
}) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    api
      .listGames()
      .then((response) => setGames(response.games))
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Failed to load games."));
  }, []);

  const analyzedCount = games?.filter((game) => game.analysisStatus === "done").length ?? 0;
  const accuracies = games?.filter((game) => game.accuracy !== null).map((game) => game.accuracy!) ?? [];
  const avgAccuracy = accuracies.length > 0 ? Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length) : null;
  const blunderCount = games?.filter((game) => game.hadBlunder).length ?? 0;

  return (
    <div className="page">
      <header className="dashboard-header">
        <div>
          <div className="dashboard-header-eyebrow">dashboard</div>
          <h1>Welcome back, {user?.displayName}</h1>
          <p>Upload a game to start building your player model.</p>
        </div>
        <button className="btn-primary" onClick={onUpload} type="button" style={{ marginTop: 0 }}>
          + Upload games
        </button>
      </header>

      <main className="page-content" style={{ maxWidth: 1080 }}>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Games analysed</div>
            <div className="stat-card-value">{analyzedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Avg accuracy</div>
            <div className="stat-card-value accent">{avgAccuracy ?? "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Games with a blunder</div>
            <div className="stat-card-value">{blunderCount}</div>
          </div>
        </div>

        {loadError ? <p className="error-text">{loadError}</p> : null}

        <div className="section-heading-row">
          <h2>Recent games</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Click any game to open the review
          </span>
        </div>

        {games === null ? (
          <p className="muted">Loading…</p>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <p>No games analyzed yet.</p>
            <p className="muted">Upload a PGN export from Chess.com or Lichess to get started.</p>
            <button className="btn-primary" onClick={onUpload} type="button" style={{ marginTop: 8 }}>
              Upload your first game
            </button>
          </div>
        ) : (
          <div className="game-list">
            {games.map((game) => (
              <button key={game.id} className="game-row" onClick={() => onOpenGame(game.id)} type="button">
                <div className="game-row-eco">{game.openingEco ?? "—"}</div>
                <div style={{ minWidth: 210 }}>
                  <div className="game-row-players">
                    <span className={game.playerColor === "white" ? "you" : ""}>{game.white}</span>
                    <span className="vs">vs</span>
                    <span className={game.playerColor === "black" ? "you" : ""}>{game.black}</span>
                  </div>
                  <div className="game-row-opening">{game.openingName ?? game.openingEco ?? ""}</div>
                </div>
                <div className="game-row-result" style={{ color: resultColor(game.result, game.playerColor) }}>
                  {game.result ?? "—"}
                </div>
                <div className="game-row-meta">
                  {game.timeControl ?? "—"} · {game.plyCount} plies
                </div>
                <div className="game-row-tail">
                  {game.hadBlunder ? <span className="game-row-tag" style={{ color: "var(--blunder)" }}>blunder</span> : null}
                  <div className="game-row-acc">
                    <div className="game-row-acc-value" style={{ color: game.accuracy !== null ? accuracyColor(game.accuracy) : "var(--text-fainter)" }}>
                      {game.accuracy !== null ? Math.round(game.accuracy) : game.analysisStatus === "done" ? "—" : "…"}
                    </div>
                    <div className="game-row-acc-label">accuracy</div>
                  </div>
                  <span className="game-row-date">{new Date(game.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
