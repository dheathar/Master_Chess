import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import type { DrillAttemptResult, DrillStats, DueDrill } from "@shared/api";
import * as api from "../api";
import { Board } from "../components/Board";

interface Choice {
  uci: string;
  san: string;
}

function formatInterval(days: number): string {
  const minutes = days * 24 * 60;
  if (minutes < 60) return `~${Math.max(1, Math.round(minutes))} minute${Math.round(minutes) === 1 ? "" : "s"}`;
  if (minutes < 24 * 60) return `~${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`;
  return `~${days.toFixed(1)} days`;
}

function buildChoices(fen: string, correctUci: string): Choice[] {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  const correctMove = legal.find((move) => `${move.from}${move.to}${move.promotion ?? ""}` === correctUci);
  const distractorPool = legal.filter((move) => `${move.from}${move.to}${move.promotion ?? ""}` !== correctUci);

  // Deterministic-enough shuffle for a client-only, non-security-sensitive
  // pick of distractors — no need for crypto randomness here.
  const shuffled = [...distractorPool].sort(() => Math.random() - 0.5).slice(0, 3);
  const choices: Choice[] = shuffled.map((move) => ({ uci: `${move.from}${move.to}${move.promotion ?? ""}`, san: move.san }));
  if (correctMove) {
    choices.push({ uci: correctUci, san: correctMove.san });
  } else {
    choices.push({ uci: correctUci, san: correctUci });
  }
  return choices.sort(() => Math.random() - 0.5);
}

export function DrillPage() {
  const [drills, setDrills] = useState<DueDrill[] | null>(null);
  const [stats, setStats] = useState<DrillStats | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DrillAttemptResult | null>(null);
  const [chosenUci, setChosenUci] = useState<string | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const [hinted, setHinted] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);

  useEffect(() => {
    api
      .getDueDrills()
      .then((response) => {
        setDrills(response.drills);
        setShownAt(Date.now());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load drills."));
    api.getDrillStats().then(setStats).catch(() => {});
  }, []);

  const current = drills?.[index] ?? null;
  const choices = useMemo(() => (current ? buildChoices(current.fen, current.correctUci) : []), [current?.id]);
  const sideToMove = current ? (current.fen.split(" ")[1] === "b" ? "black" : "white") : "white";

  async function onChoose(choice: Choice) {
    if (!current || submitting || result) return;
    setChosenUci(choice.uci);
    setSubmitting(true);
    try {
      const response = await api.submitDrillAttempt(current.id, choice.uci, Date.now() - shownAt, hinted);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onHint() {
    if (!current || hintBusy || result) return;
    const level = hints.length + 1;
    if (level > 3) return;
    setHintBusy(true);
    try {
      const r = await api.getDrillHint(current.id, level);
      setHints((h) => [...h, r.hint]);
      setHinted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch a hint.");
    } finally {
      setHintBusy(false);
    }
  }

  function onNext() {
    setResult(null);
    setChosenUci(null);
    setHints([]);
    setHinted(false);
    setIndex((i) => i + 1);
    setShownAt(Date.now());
    api.getDrillStats().then(setStats).catch(() => {});
  }

  return (
    <div className="page">
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="dashboard-header-eyebrow">drills</div>
          <h1 style={{ fontSize: 28 }}>Own-mistake drills</h1>
          <p className="muted mono" style={{ margin: "6px 0 0", fontSize: 12.5, textTransform: "uppercase" }}>
            Every position here is one you actually reached and misplayed
          </p>
        </div>
        {stats ? (
          <div style={{ display: "flex", gap: 0, border: "2.5px solid var(--border)", boxShadow: "4px 4px 0 var(--border)" }}>
            <div style={{ textAlign: "center", padding: "10px 16px", borderRight: "2.5px solid var(--border)" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.dueToday}</div>
              <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-faint)" }}>
                due
              </div>
            </div>
            <div style={{ textAlign: "center", padding: "10px 16px", borderRight: "2.5px solid var(--border)" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--best)" }}>{stats.dayStreak}</div>
              <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-faint)" }}>
                streak
              </div>
            </div>
            <div style={{ textAlign: "center", padding: "10px 16px" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--red)" }}>{stats.retentionPct ?? "—"}%</div>
              <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-faint)" }}>
                retention
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="page-content" style={{ maxWidth: 1000 }}>
        {error ? <p className="error-text">{error}</p> : null}

        {drills === null ? (
          <p className="muted">Loading…</p>
        ) : drills.length === 0 ? (
          <div className="empty-state">
            <p>No drills due right now.</p>
            <p className="muted">Drills are generated automatically from mistakes in your analyzed games — upload more to build your queue.</p>
          </div>
        ) : !current ? (
          <div className="empty-state">
            <p>You've cleared today's queue. 🎉</p>
            <p className="muted">Come back tomorrow for the next batch.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0,1fr)", gap: 28, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div className="drill-board-wrapper">
                <Board fen={current.fen} orientation={sideToMove} />
              </div>
              <div className="mono" style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-muted)" }}>
                {sideToMove === "white" ? "White" : "Black"} to move · drill {index + 1} of {drills.length}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="card">
                <div className="card-eyebrow" style={{ marginBottom: 8 }}>
                  Spaced repetition · SM-2
                </div>
                <h2 style={{ fontSize: 20, margin: "0 0 6px", textTransform: "uppercase" }}>Find the move that avoids your mistake</h2>
                <p className="mono" style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>
                  Skill: {current.skillName}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {choices.map((choice) => {
                    const isChosen = chosenUci === choice.uci;
                    const isCorrectChoice = result && choice.uci === result.correctUci;
                    const borderColor = result
                      ? isCorrectChoice
                        ? "var(--best)"
                        : isChosen
                          ? "var(--blunder)"
                          : "var(--border)"
                      : "var(--border)";
                    return (
                      <button
                        key={choice.uci}
                        type="button"
                        disabled={!!result || submitting}
                        onClick={() => onChoose(choice)}
                        style={{
                          padding: 16,
                          background: "#fff",
                          border: `2.5px solid ${borderColor}`,
                          fontFamily: "var(--font-mono)",
                          fontSize: 17,
                          fontWeight: 700,
                          cursor: result ? "default" : "pointer",
                          boxShadow: `4px 4px 0 ${borderColor}`,
                        }}
                      >
                        {choice.san}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Coach: graded Socratic hints (engine-grounded). Using one marks the drill hinted → partial credit. */}
              {!result ? (
                <div className="drill-coach">
                  <div className="drill-coach-head">
                    <span className="drill-coach-title">🧭 Coach</span>
                    {hinted ? <span className="drill-coach-note">hinted → partial credit</span> : null}
                  </div>
                  {hints.map((h, i) => (
                    <p key={i} className="drill-hint">
                      <span className="drill-hint-level">Hint {i + 1}</span> {h}
                    </p>
                  ))}
                  {hints.length < 3 ? (
                    <button type="button" className="drill-hint-btn" onClick={() => void onHint()} disabled={hintBusy || submitting}>
                      {hintBusy ? "Thinking…" : hints.length === 0 ? "💡 Need a hint?" : "Show another hint"}
                    </button>
                  ) : (
                    <p className="drill-coach-note" style={{ margin: "4px 0 0" }}>That's the last hint — make your move.</p>
                  )}
                </div>
              ) : null}

              {result ? (
                <div className="card" style={{ borderColor: result.correct ? "var(--best)" : "var(--blunder)" }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>
                    {result.correct ? "✓ Correct." : `✕ Not quite — the move was ${result.correctSan ?? result.correctUci}.`}
                  </p>
                  <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    {result.correct
                      ? `This position moves out ${formatInterval(result.nextDueInDays)}.`
                      : "It's back tomorrow — until the gap is closed for good."}
                  </p>
                  <button type="button" className="btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={onNext}>
                    Next drill →
                  </button>
                </div>
              ) : (
                <div className="coach-card" style={{ background: "var(--ink)" }}>
                  <p style={{ margin: 0 }}>
                    Right → this position moves out days. Wrong → it's back tomorrow, until the gap is closed for good.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
