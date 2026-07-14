import { useEffect, useState } from "react";
import type { JourneyResponse } from "@shared/api";
import * as api from "../api";
import { useAuthStore } from "../store/useAuthStore";
import type { SidebarView } from "../components/Sidebar";

export function ProgressPage({ onNavigate, onUpload }: { onNavigate: (v: SidebarView) => void; onUpload: () => void }) {
  const [journey, setJourney] = useState<JourneyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    api
      .getJourney()
      .then(setJourney)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load your progress."));
  }, []);

  function goToNextAction(screen: JourneyResponse["nextAction"]["screen"]) {
    if (screen === "upload") onUpload();
    else onNavigate(screen);
  }

  return (
    <div className="page">
      <header className="dashboard-header">
        <div>
          <div className="dashboard-header-eyebrow">progress</div>
          <h1>Your progress, {user?.displayName}</h1>
          <p>Where you are, what you've achieved, and the single best thing to do next.</p>
        </div>
      </header>

      <main className="page-content" style={{ maxWidth: 900 }}>
        {error ? <p className="error-text">{error}</p> : null}
        {journey === null && !error ? <p className="muted">Reading your journey…</p> : null}

        {journey ? (
          <>
            {/* Coach's summary */}
            <div className="progress-coach card">
              <div className="progress-coach-eyebrow">
                Coach's summary {journey.llmAvailable ? "" : "· offline"}
              </div>
              <p className="progress-coach-text">{journey.narrative}</p>
            </div>

            {/* Next action — the guide to success */}
            <div className="progress-next">
              <div className="progress-next-label">Your next move</div>
              <div className="progress-next-title">{journey.nextAction.title}</div>
              <p className="progress-next-detail">{journey.nextAction.detail}</p>
              <button type="button" className="btn-primary" onClick={() => goToNextAction(journey.nextAction.screen)}>
                Go →
              </button>
            </div>

            {/* Stats */}
            <div className="stat-grid" style={{ marginTop: 8 }}>
              <div className="stat-card">
                <div className="stat-card-label">Games analysed</div>
                <div className="stat-card-value">{journey.stats.gamesAnalyzed}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Skills with evidence</div>
                <div className="stat-card-value">{journey.stats.evidencedSkillCount}/27</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Level</div>
                <div className="stat-card-value">{journey.stats.level ?? "—"}</div>
                {journey.stats.levelName ? <div className="stat-card-sub">{journey.stats.levelName}</div> : null}
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Drills due</div>
                <div className="stat-card-value">{journey.stats.dueDrills}</div>
                {journey.stats.retentionPct !== null ? (
                  <div className="stat-card-sub">{journey.stats.retentionPct}% retention</div>
                ) : null}
              </div>
            </div>

            {/* Achievements */}
            {journey.achievements.length > 0 ? (
              <div className="progress-achievements card">
                <h2>What you've done</h2>
                <ul>
                  {journey.achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
