import { useEffect, useMemo, useState } from "react";
import type { EngineLineSummary, GameDetailResponse, MoveClassification } from "@shared/api";
import * as api from "../api";
import { Board } from "../components/Board";
import { EvalBar } from "../components/EvalBar";

function formatThinkTime(ms: number): string {
  const seconds = ms / 1000;
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s thought` : `${seconds.toFixed(1)}s thought`;
}

function formatLineEval(line: EngineLineSummary): string {
  if (line.mate !== null) return line.mate === 0 ? "#" : `M${Math.abs(line.mate)}`;
  if (line.cp === null) return "—";
  return `${line.cp > 0 ? "+" : ""}${(line.cp / 100).toFixed(1)}`;
}

const CLASSIFICATION_LABEL: Record<MoveClassification, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

const CLASSIFICATION_BADGE: Record<MoveClassification, string> = {
  best: "✓",
  good: "○",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

const CLASSIFICATION_COLOR_VAR: Record<MoveClassification, string> = {
  best: "var(--best)",
  good: "var(--good)",
  inaccuracy: "var(--inaccuracy)",
  mistake: "var(--mistake)",
  blunder: "var(--blunder)",
};

const CLASSIFICATION_ORDER: MoveClassification[] = ["best", "good", "inaccuracy", "mistake", "blunder"];

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function GameReviewPage({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<GameDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ply, setPly] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const response = await api.getGame(gameId);
        if (cancelled) return;
        setDetail(response);
        setError(null); // a transient fetch failure must not leave a permanent error page
        if (response.analysis.status === "running" || response.analysis.status === "queued") {
          if (!interval) interval = setInterval(load, 1500);
        } else if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load game.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [gameId]);

  const currentFen = useMemo(() => {
    if (!detail) return START_FEN;
    if (ply === 0) return START_FEN;
    return detail.moves[ply - 1]?.fenAfter ?? START_FEN;
  }, [detail, ply]);

  const currentMove = detail && ply > 0 ? detail.moves[ply - 1] : null;
  const lastMoveSquares = currentMove ? { from: currentMove.uci.slice(0, 2), to: currentMove.uci.slice(2, 4) } : null;

  // Arrow-key navigation: ←/→ step one ply, Home/End jump to start/final position.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!detail) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPly((p) => Math.max(0, p - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPly((p) => Math.min(detail.moves.length, p + 1));
      } else if (event.key === "Home") {
        event.preventDefault();
        setPly(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setPly(detail.moves.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detail]);

  if (error) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
        <button className="btn-ghost" onClick={onBack} type="button">
          ← Back
        </button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const { game, analysis, moves } = detail;
  const isAnalyzing = analysis.status === "queued" || analysis.status === "running";
  const playerColor = game.playerColor;

  const ownCounts = playerColor === "black" ? analysis.summary?.blackCounts : analysis.summary?.whiteCounts;
  const ownAccuracy = playerColor === "black" ? analysis.summary?.blackAccuracy : analysis.summary?.whiteAccuracy;

  // Deterministic, engine-grounded summary — no LLM narration exists yet (that's
  // M4). Every sentence here is a direct readout of real classification data.
  const ownMoves = moves.filter((move) => move.color === playerColor);
  const worstMove = ownMoves
    .filter((move) => move.cpLoss !== null)
    .sort((a, b) => (b.cpLoss ?? 0) - (a.cpLoss ?? 0))[0];
  const blunderCount = ownCounts?.blunder ?? 0;
  const mistakeCount = ownCounts?.mistake ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn-icon" onClick={onBack} type="button">
            ←
          </button>
          <div>
            <div className="review-header-title">
              <span>{game.white}</span>
              <span className="vs">vs</span>
              <span>{game.black}</span>
            </div>
            <div className="review-header-meta">
              <span>{game.openingName ?? game.openingEco ?? "Unknown opening"}</span>
              <span>·</span>
              <span>{game.timeControl ?? "—"}</span>
              <span>·</span>
              <span>{game.result ?? "*"}</span>
              <span>·</span>
              <span>{game.playedAt ?? new Date(game.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="review-status">
          <span>{isAnalyzing ? "Analyzing…" : analysis.status === "failed" ? "Analysis failed" : "Analysis complete"}</span>
          <span className={`status-dot ${isAnalyzing ? "pending" : ""}`} style={analysis.status === "failed" ? { background: "var(--blunder)" } : undefined} />
        </div>
      </header>

      <main className="review-layout">
        <section className="review-board-column">
          <div className="board-with-eval">
            <EvalBar cp={currentMove?.evalCpAfter ?? (ply === 0 ? 20 : null)} />
            <Board fen={currentFen} lastMoveSquares={lastMoveSquares} orientation={playerColor === "black" ? "black" : "white"} />
          </div>

          <div className="ply-nav">
            <button onClick={() => setPly(0)} disabled={ply === 0} type="button">
              ⏮
            </button>
            <button onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} type="button">
              ◀
            </button>
            <span className="ply-label">{ply === 0 ? "Starting position" : `Move ${Math.ceil(ply / 2)} · ${ply % 2 ? "White" : "Black"}`}</span>
            <button onClick={() => setPly((p) => Math.min(moves.length, p + 1))} disabled={ply === moves.length} type="button">
              ▶
            </button>
            <button onClick={() => setPly(moves.length)} disabled={ply === moves.length} type="button">
              ⏭
            </button>
          </div>

          {currentMove?.classification ? (
            <div className={`move-callout classification-${currentMove.classification}`}>
              <div className="move-callout-top">
                <span className="move-callout-badge" style={{ background: CLASSIFICATION_COLOR_VAR[currentMove.classification] }}>
                  {CLASSIFICATION_BADGE[currentMove.classification]}
                </span>
                <span className="move-callout-san">{currentMove.san}</span>
                <span className="move-callout-class" style={{ color: CLASSIFICATION_COLOR_VAR[currentMove.classification] }}>
                  {CLASSIFICATION_LABEL[currentMove.classification]}
                </span>
                {currentMove.cpLoss !== null && currentMove.cpLoss > 5 ? (
                  <span className="move-callout-loss">{currentMove.cpLoss >= 9000 ? "missed mate" : `${currentMove.cpLoss}cp lost`}</span>
                ) : null}
                {currentMove.moveTimeMs !== null ? (
                  <span className="move-callout-think-time mono">{formatThinkTime(currentMove.moveTimeMs)}</span>
                ) : null}
              </div>
              {currentMove.classification !== "best" && currentMove.bestMoveSan ? (
                <div className="move-callout-better">
                  <span className="move-callout-better-label">Engine prefers</span>
                  <span className="move-callout-better-san">{currentMove.bestMoveSan}</span>
                </div>
              ) : null}
              {currentMove.topLines.length > 0 ? (
                <div className="move-callout-lines">
                  <span className="move-callout-lines-label">Top engine lines</span>
                  <div className="move-callout-lines-list">
                    {currentMove.topLines.map((line) => (
                      <div key={line.rank} className="move-callout-line-row">
                        <span className="mono">{line.rank}.</span>
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {line.san ?? "—"}
                        </span>
                        <span className="mono move-callout-line-eval">{formatLineEval(line)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="review-sidebar">
          {isAnalyzing ? (
            <div className="card">
              <div className="job-progress-track">
                <div className="job-progress-fill" style={{ width: `${Math.round(analysis.progress * 100)}%` }} />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                Analyzing with Stockfish… {Math.round(analysis.progress * 100)}%
              </span>
            </div>
          ) : null}

          {analysis.summary ? (
            <div className="card">
              <div className="card-label-row">
                <span className="card-eyebrow">Game accuracy</span>
                <span className="card-meta">depth {analysis.engineDepth} · Stockfish</span>
              </div>
              <div className="accuracy-grid">
                <div>
                  <div className="accuracy-value-row">
                    <span className="accuracy-value">{analysis.summary.whiteAccuracy ?? "—"}</span>
                    <span className="accuracy-of">/ 100</span>
                  </div>
                  <div className="accuracy-who">
                    {game.white} {playerColor === "white" ? "(You, White)" : "(White)"}
                  </div>
                </div>
                <div>
                  <div className="accuracy-value-row">
                    <span className="accuracy-value" style={{ color: "var(--gold)" }}>
                      {analysis.summary.blackAccuracy ?? "—"}
                    </span>
                    <span className="accuracy-of">/ 100</span>
                  </div>
                  <div className="accuracy-who">
                    {game.black} {playerColor === "black" ? "(You, Black)" : "(Black)"}
                  </div>
                </div>
              </div>
              {ownCounts ? (
                <div className="classification-tally">
                  {CLASSIFICATION_ORDER.map((key) => (
                    <div key={key} className="classification-tally-item">
                      <span className="classification-tally-count" style={{ color: CLASSIFICATION_COLOR_VAR[key] }}>
                        {ownCounts[key]}
                      </span>
                      <span className="classification-tally-label">{CLASSIFICATION_LABEL[key]}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="move-list">
            {Array.from({ length: Math.ceil(moves.length / 2) }, (_, moveNumber) => {
              const white = moves[moveNumber * 2];
              const black = moves[moveNumber * 2 + 1];
              return (
                <div key={moveNumber} className="move-list-row">
                  <span className="move-number">{moveNumber + 1}.</span>
                  <button
                    className={`move-chip ${ply === moveNumber * 2 + 1 ? "active" : ""}`}
                    onClick={() => setPly(moveNumber * 2 + 1)}
                    type="button"
                  >
                    <span className={`move-chip-dot classification-${white?.classification ?? "none"}`} />
                    {white?.san}
                  </button>
                  {black ? (
                    <button
                      className={`move-chip ${ply === moveNumber * 2 + 2 ? "active" : ""}`}
                      onClick={() => setPly(moveNumber * 2 + 2)}
                      type="button"
                    >
                      <span className={`move-chip-dot classification-${black.classification ?? "none"}`} />
                      {black.san}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {analysis.llmNarrative ? (
            <div className="coach-card">
              <div className="coach-card-top">
                <span style={{ fontSize: 16 }}>♞</span>
                <span className="coach-card-title">Engine summary</span>
                <span className="coach-card-pill" style={{ background: "var(--best)" }}>
                  engine-grounded
                </span>
              </div>
              <p>{analysis.llmNarrative.narrative}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-fainter)" }}>
                Written by {analysis.llmNarrative.model} — verified against this game's real moves and evaluations before
                being shown.
              </p>
            </div>
          ) : analysis.summary && worstMove ? (
            <div className="coach-card">
              <div className="coach-card-top">
                <span style={{ fontSize: 16 }}>♞</span>
                <span className="coach-card-title">Engine summary</span>
                <span className="coach-card-pill">deterministic</span>
              </div>
              <p>
                {blunderCount > 0
                  ? `You made ${blunderCount} blunder${blunderCount === 1 ? "" : "s"} and ${mistakeCount} mistake${mistakeCount === 1 ? "" : "s"} this game.`
                  : mistakeCount > 0
                    ? `No blunders — but ${mistakeCount} mistake${mistakeCount === 1 ? "" : "s"} cost accuracy.`
                    : "A clean game by the engine's count — no mistakes or blunders."}{" "}
                Your biggest loss was <strong style={{ color: "var(--text-1)" }}>{worstMove.san}</strong> (move{" "}
                {Math.ceil(worstMove.ply / 2)}), giving up {worstMove.cpLoss}cp.
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-fainter)" }}>
                This is a direct readout of the engine's numbers — the LLM coaching layer (M4) couldn't produce a
                verified note for this game, so you're seeing the deterministic fallback.
              </p>
            </div>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
