import { useEffect, useRef, useState } from "react";
import * as api from "../api";

interface JobProgress {
  gameId: string;
  label: string;
  progress: number;
  status: string;
}

export function UploadPage({ onDone, onBack }: { onDone: (gameId: string) => void; onBack: () => void }) {
  const [pgn, setPgn] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [source, setSource] = useState<"chesscom" | "lichess" | "manual">("manual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Array<{ index: number; reason: string }>>([]);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const streamClosers = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Close any live SSE streams when leaving the page — an EventSource left
    // open auto-reconnects forever.
    return () => {
      for (const close of streamClosers.current) close();
      streamClosers.current = [];
    };
  }, []);

  function onFileSelected(file: File): void {
    file.text().then(setPgn);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setRejected([]);
    try {
      const response = await api.uploadGames({ pgn, source, playerName: playerName || undefined });
      setRejected(response.rejected);
      const newJobs = response.games.map((entry) => ({
        gameId: entry.game.id,
        label: `${entry.game.white} vs ${entry.game.black}`,
        progress: 0,
        status: "queued",
      }));
      setJobs(newJobs);

      for (const entry of response.games) {
        const close = api.streamAnalysisProgress(entry.analysisId, (event) => {
          setJobs((current) =>
            current.map((job) =>
              job.gameId === entry.game.id ? { ...job, progress: event.progress, status: event.status } : job,
            ),
          );
          if (event.status === "done" || event.status === "failed") {
            close();
            // Auto-open the review only for a clean single-game upload — if
            // anything was rejected, keep the user here to read the warnings.
            if (event.status === "done" && response.games.length === 1 && response.rejected.length === 0) {
              onDone(entry.game.id);
            }
          }
        });
        streamClosers.current.push(close);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header" style={{ gap: 14 }}>
        <button className="btn-icon" onClick={onBack} type="button">
          ←
        </button>
        <div>
          <h1 style={{ fontSize: 20 }}>Upload games</h1>
          <p className="muted" style={{ margin: "3px 0 0", fontSize: 13 }}>
            Paste a PGN export from Chess.com or Lichess. We analyse every move with Stockfish.
          </p>
        </div>
      </header>

      <main className="page-content narrow">
        <form onSubmit={onSubmit} className="upload-form">
          <label>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="manual">Manual / other</option>
              <option value="chesscom">Chess.com export</option>
              <option value="lichess">Lichess export</option>
            </select>
          </label>

          <label>
            Your username in this PGN <span className="form-hint">(auto-detects which colour you played)</span>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="e.g. your Chess.com handle" />
          </label>

          <label>
            Paste PGN
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              rows={10}
              placeholder="[Event ...]&#10;&#10;1. e4 e5 2. Nf3 ..."
              required
            />
          </label>

          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) onFileSelected(file);
            }}
          >
            <span className="dropzone-icon">⇩</span>
            <input
              type="file"
              accept=".pgn,text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileSelected(file);
              }}
            />
            <span>
              or drop a <strong style={{ color: "var(--text-3)" }}>.pgn</strong> file here
            </span>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="btn-primary" disabled={submitting || !pgn.trim()}>
            {submitting ? "Uploading…" : "Analyze"}
          </button>
        </form>

        {rejected.length > 0 ? (
          <div className="warning-box">
            <strong>{rejected.length} game(s) could not be parsed:</strong>
            <ul>
              {rejected.map((entry) => (
                <li key={entry.index}>
                  Game #{entry.index + 1}: {entry.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {jobs.length > 0 ? (
          <div className="job-list">
            {jobs.map((job) => (
              <div key={job.gameId} className="job-row">
                <div className="job-row-top">
                  <span>{job.label}</span>
                  <span className="muted">{job.status}</span>
                </div>
                <div className="job-progress-track">
                  <div className="job-progress-fill" style={{ width: `${Math.round(job.progress * 100)}%` }} />
                </div>
                {job.status === "done" ? (
                  <button className="btn-ghost" onClick={() => onDone(job.gameId)} type="button">
                    View analysis →
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
