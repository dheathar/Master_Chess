import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import type { ExplorerMoveStat, ExplorerResponse } from "@shared/api";
import * as api from "../api";
import { Board } from "./Board";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function StatBar({ stat }: { stat: ExplorerMoveStat }) {
  const total = Math.max(1, stat.total);
  const whitePct = (stat.whiteWins / total) * 100;
  const drawPct = (stat.draws / total) * 100;
  const blackPct = (stat.blackWins / total) * 100;
  return (
    <div className="explorer-stat-bar" title={`${stat.whiteWins}W / ${stat.draws}D / ${stat.blackWins}B`}>
      <div style={{ width: `${whitePct}%`, background: "var(--good)" }} />
      <div style={{ width: `${drawPct}%`, background: "var(--text-fainter)" }} />
      <div style={{ width: `${blackPct}%`, background: "var(--ink)" }} />
    </div>
  );
}

function MoveStatList({ stats, onPick, emptyLabel }: { stats: ExplorerMoveStat[]; onPick: (uci: string) => void; emptyLabel: string }) {
  if (stats.length === 0) {
    return <div className="skill-empty">{emptyLabel}</div>;
  }
  return (
    <div className="explorer-move-list">
      {stats.map((stat) => (
        <button key={stat.uci} type="button" className="explorer-move-row" onClick={() => onPick(stat.uci)}>
          <span className="explorer-move-san">{stat.san}</span>
          <StatBar stat={stat} />
          <span className="explorer-move-total">{stat.total}</span>
        </button>
      ))}
    </div>
  );
}

export function OpeningExplorer() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(START_FEN);
  const [sanTrail, setSanTrail] = useState<string[]>([]);
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getExplorer(fen)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load explorer data.");
      });
    return () => {
      cancelled = true;
    };
  }, [fen]);

  function playUci(uci: string) {
    try {
      chess.load(fen);
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) return;
      setSanTrail((trail) => [...trail, move.san]);
      setFen(chess.fen());
    } catch {
      // illegal/malformed uci from a stale response — ignore
    }
  }

  function reset() {
    chess.reset();
    setFen(START_FEN);
    setSanTrail([]);
  }

  function stepBack() {
    if (sanTrail.length === 0) return;
    chess.reset();
    const next = sanTrail.slice(0, -1);
    for (const san of next) chess.move(san);
    setSanTrail(next);
    setFen(chess.fen());
  }

  return (
    <div className="explorer-layout">
      <div className="explorer-board-column">
        <Board fen={fen} />
        <div className="explorer-breadcrumb mono">{sanTrail.length === 0 ? "Starting position" : sanTrail.join(" ")}</div>
        <div className="ply-nav">
          <button type="button" onClick={reset} disabled={sanTrail.length === 0}>
            ⏮
          </button>
          <button type="button" onClick={stepBack} disabled={sanTrail.length === 0}>
            ◀
          </button>
        </div>
      </div>

      <div className="explorer-stats-column">
        {error ? <p className="error-text">{error}</p> : null}
        <div className="card">
          <div className="card-label-row">
            <span className="card-eyebrow">Masters</span>
            <span className="card-meta">local library</span>
          </div>
          {data ? (
            <MoveStatList stats={data.master} onPick={playUci} emptyLabel="No master games reach this position yet." />
          ) : (
            <div className="skill-empty">Loading…</div>
          )}
        </div>
        <div className="card">
          <div className="card-label-row">
            <span className="card-eyebrow">Your games</span>
            <span className="card-meta">personal</span>
          </div>
          {data ? (
            <MoveStatList stats={data.personal} onPick={playUci} emptyLabel="You haven't reached this position in an analyzed game." />
          ) : (
            <div className="skill-empty">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
