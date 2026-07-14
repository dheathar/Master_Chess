import { useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import * as api from "../api";
import { Board } from "../components/Board";
import { useAuthStore } from "../store/useAuthStore";

const LEVELS: { value: number; label: string; blurb: string }[] = [
  { value: 1, label: "Beginner", blurb: "Shallow search, often plays a weaker move" },
  { value: 2, label: "Casual", blurb: "Loose play, punishes big mistakes" },
  { value: 3, label: "Club", blurb: "Solid; picks a strong move most of the time" },
  { value: 4, label: "Strong", blurb: "Deep search, near-optimal" },
  { value: 5, label: "Max", blurb: "Always the engine's best move" },
];

function resultString(game: Chess): string {
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.isGameOver()) return "1/2-1/2"; // stalemate, repetition, insufficient material, 50-move
  return "*";
}

export function PlayPage({ onOpenGame }: { onOpenGame: (gameId: string) => void }) {
  const { user } = useAuthStore();
  const gameRef = useRef(new Chess());

  const [started, setStarted] = useState(false);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [difficulty, setDifficulty] = useState(3);

  const [fen, setFen] = useState(gameRef.current.fen());
  const [selected, setSelected] = useState<string | null>(null);
  const [legalForSel, setLegalForSel] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState("");
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const game = gameRef.current;
  const myTurn = !over && !thinking && game.turn() === playerColor[0];

  function refresh() {
    setFen(game.fen());
  }

  function computeStatus() {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === playerColor[0] ? "you lose" : "you win"}.`;
    if (game.isGameOver()) return "Draw.";
    if (game.inCheck()) return `${game.turn() === playerColor[0] ? "You are" : "Engine is"} in check.`;
    return game.turn() === playerColor[0] ? "Your move." : "Engine to move…";
  }

  async function engineReply() {
    if (game.isGameOver()) {
      finish();
      return;
    }
    setThinking(true);
    setStatus("Engine to move…");
    try {
      const { uci } = await api.requestEngineMove(game.fen(), difficulty);
      const mv = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as never });
      if (mv) setLastMove({ from: mv.from, to: mv.to });
      refresh();
      if (game.isGameOver()) {
        finish();
      } else {
        setStatus(computeStatus());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The engine could not move.");
    } finally {
      setThinking(false);
    }
  }

  function applyPlayerMove(from: string, to: string) {
    const candidate = legalForSel.find((m) => m.to === to);
    const promotion = candidate?.promotion ? "q" : undefined; // auto-queen
    const mv = game.move({ from, to, promotion });
    if (!mv) return;
    setLastMove({ from: mv.from, to: mv.to });
    setSelected(null);
    setLegalForSel([]);
    refresh();
    if (game.isGameOver()) {
      finish();
    } else {
      void engineReply();
    }
  }

  function onSquareClick(square: string) {
    if (!myTurn) return;
    if (selected) {
      if (legalForSel.some((m) => m.to === square)) {
        applyPlayerMove(selected, square);
        return;
      }
      // reselect or clear
    }
    const piece = game.get(square as never);
    if (piece && piece.color === playerColor[0]) {
      setSelected(square);
      setLegalForSel(game.moves({ square: square as never, verbose: true }) as Move[]);
    } else {
      setSelected(null);
      setLegalForSel([]);
    }
  }

  function start() {
    const fresh = new Chess();
    gameRef.current = fresh;
    setStarted(true);
    setOver(false);
    setError(null);
    setSelected(null);
    setLegalForSel([]);
    setLastMove(null);
    setFen(fresh.fen());
    setStatus(playerColor === "white" ? "Your move." : "Engine to move…");
    if (playerColor === "black") void engineReply();
  }

  async function finish() {
    setOver(true);
    setSelected(null);
    setLegalForSel([]);
    setStatus(computeStatus());
  }

  async function saveAndAnalyse() {
    setSaving(true);
    setError(null);
    try {
      const me = user?.displayName ?? "You";
      const opponent = `Stockfish (Level ${difficulty})`;
      game.header("Event", "Play vs AI");
      game.header("White", playerColor === "white" ? me : opponent);
      game.header("Black", playerColor === "black" ? me : opponent);
      game.header("Result", resultString(game));
      const pgn = game.pgn();
      const res = await api.uploadGames({ pgn, source: "manual", playerName: me });
      const gameId = res.games[0]?.game.id;
      if (!gameId) throw new Error("Game could not be saved.");
      onOpenGame(gameId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the game.");
      setSaving(false);
    }
  }

  // ── Setup screen ──
  if (!started) {
    return (
      <div className="page">
        <header className="page-header" style={{ display: "block" }}>
          <div className="dashboard-header-eyebrow">play</div>
          <h1 style={{ fontSize: 28 }}>Play vs AI</h1>
          <p className="muted mono" style={{ margin: "6px 0 0", fontSize: 12.5, textTransform: "uppercase" }}>
            No game to upload? Play one — it feeds your player model
          </p>
        </header>
        <main className="page-content" style={{ maxWidth: 640 }}>
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Your colour</h2>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {(["white", "black"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`play-choice ${playerColor === c ? "active" : ""}`}
                  onClick={() => setPlayerColor(c)}
                >
                  {c === "white" ? "♔ White" : "♚ Black"}
                </button>
              ))}
            </div>
            <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Difficulty</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  className={`play-level ${difficulty === l.value ? "active" : ""}`}
                  onClick={() => setDifficulty(l.value)}
                >
                  <span className="play-level-name">{l.label}</span>
                  <span className="play-level-blurb">{l.blurb}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={start}>
              Start game →
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Game screen ──
  return (
    <div className="page">
      <header className="page-header" style={{ display: "block" }}>
        <div className="dashboard-header-eyebrow">play · Stockfish level {difficulty}</div>
        <h1 style={{ fontSize: 28 }}>Play vs AI</h1>
      </header>
      <main className="page-content" style={{ maxWidth: 1000 }}>
        {error ? <p className="error-text">{error}</p> : null}
        <div style={{ display: "grid", gridTemplateColumns: "440px minmax(0,1fr)", gap: 28, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div className="drill-board-wrapper">
              <Board
                fen={fen}
                orientation={playerColor}
                lastMoveSquares={lastMove}
                selectedSquare={selected}
                targetSquares={legalForSel.map((m) => m.to)}
                onSquareClick={onSquareClick}
              />
            </div>
            <div className="mono" style={{ fontSize: 12, textTransform: "uppercase", color: "var(--text-muted)" }}>
              {thinking ? "Engine thinking…" : status}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!over ? (
              <div className="card">
                <div className="card-eyebrow" style={{ marginBottom: 8 }}>You are {playerColor}</div>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                  Click one of your pieces, then a highlighted square to move. The engine replies at the level you chose.
                </p>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    game.header("Result", playerColor === "white" ? "0-1" : "1-0");
                    void finish();
                  }}
                >
                  Resign
                </button>
              </div>
            ) : (
              <div className="card" style={{ borderColor: "var(--gold)" }}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 15 }}>{status}</p>
                <p className="muted" style={{ margin: "0 0 14px", fontSize: 13 }}>
                  Save this game to analyse it move-by-move and feed your player model and drills (uses one analysis).
                </p>
                <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={saving} onClick={() => void saveAndAnalyse()}>
                  {saving ? "Saving & analysing…" : "Save & analyse this game →"}
                </button>
                <button type="button" className="btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={start}>
                  Play again
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
