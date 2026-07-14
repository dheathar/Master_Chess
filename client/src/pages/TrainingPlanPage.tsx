import { useEffect, useState } from "react";
import type { TrainingPlanResponse } from "@shared/api";
import * as api from "../api";

export function TrainingPlanPage() {
  const [plan, setPlan] = useState<TrainingPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTrainingPlan()
      .then(setPlan)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load training plan."));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <div className="dashboard-header-eyebrow">prescription</div>
        <h1 style={{ fontSize: 28 }}>Your training plan</h1>
        <p className="muted mono" style={{ margin: "6px 0 0", fontSize: 12.5, textTransform: "uppercase" }}>
          Prescribed from your diagnosis, not a generic curriculum
        </p>
      </header>

      <main className="page-content" style={{ maxWidth: 900 }}>
        {error ? <p className="error-text">{error}</p> : null}

        {plan === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="coach-card" style={{ background: "var(--ink)", marginBottom: 24 }}>
              <div className="card-eyebrow" style={{ marginBottom: 8, color: "var(--yellow)" }}>
                The hypothesis{plan.plateauId ? ` · ${plan.plateauId.replace(/_/g, " ")}` : ""}
              </div>
              <p style={{ margin: 0 }}>{plan.hypothesis}</p>
            </div>

            {plan.focusBlocks.length === 0 ? (
              <div className="empty-state">
                <p>No focus blocks yet.</p>
                <p className="muted">
                  Skills need at least 3 pieces of evidence before we'll prescribe them — upload more analyzed games to build this out.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {plan.focusBlocks.map((block, i) => (
                  <div key={block.skillId} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div className="card-eyebrow">Focus {i + 1}</div>
                        <h2 style={{ fontSize: 20, margin: "2px 0 0", textTransform: "uppercase" }}>{block.skillName}</h2>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{block.mastery}</div>
                        <div className="mono" style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-faint)" }}>
                          mastery · {block.sampleCount} evidence
                        </div>
                      </div>
                    </div>
                    <p className="mono" style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 14px" }}>
                      {block.rationale}
                    </p>
                    {block.books.length > 0 ? (
                      <>
                        <div className="card-eyebrow" style={{ marginBottom: 8 }}>
                          Matched reading
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {block.books.map((book) => (
                            <div
                              key={book.title}
                              style={{
                                border: "2px solid var(--border)",
                                padding: "10px 12px",
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                alignItems: "baseline",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{book.title}</div>
                                <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  {book.author} · {book.level}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
