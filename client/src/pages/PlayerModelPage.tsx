import { useEffect, useState } from "react";
import type { EvidenceReceipt, PlayerHistoryResponse, PlayerModelResponse, SkillSummary } from "@shared/api";
import * as api from "../api";
import { RadarChart } from "../components/RadarChart";
import { SkillTooltip } from "../components/SkillTooltip";
import { MasterySparkline } from "../components/MasterySparkline";

const CATEGORY_COLOR: Record<string, string> = {
  OPENING: "var(--cat-opening)",
  MIDDLEGAME: "var(--cat-middlegame)",
  ENDGAME: "var(--cat-endgame)",
  PSYCHOLOGY_MENTAL: "var(--cat-mental)",
};

const TREND_GLYPH: Record<string, string> = { up: "↗", down: "↘", flat: "→" };
const TREND_COLOR: Record<string, string> = { up: "var(--best)", down: "var(--blunder)", flat: "var(--text-muted)" };

/** A representative 8-skill subset for the radar overview; the full 27 are listed below it. */
const RADAR_SKILL_IDS = [
  "opening_principles",
  "tactical_pattern_recognition",
  "calculation_precision",
  "strategic_planning",
  "prophylaxis",
  "converting_advantages",
  "endgame_principles",
  "time_management",
];
const RADAR_LABELS: Record<string, string> = {
  opening_principles: "Openings",
  tactical_pattern_recognition: "Tactics",
  calculation_precision: "Calculation",
  strategic_planning: "Strategy",
  prophylaxis: "Prophylaxis",
  converting_advantages: "Conversion",
  endgame_principles: "Endgame",
  time_management: "Time",
};

function barColor(mastery: number): string {
  if (mastery >= 65) return "var(--best)";
  if (mastery >= 50) return "var(--gold)";
  return "var(--mistake)";
}

const CLASS_BADGE: Record<string, { badge: string; color: string }> = {
  for: { badge: "✓", color: "var(--best)" },
  against: { badge: "✕", color: "var(--blunder)" },
  neutral: { badge: "·", color: "var(--text-fainter)" },
};

export function PlayerModelPage() {
  const [model, setModel] = useState<PlayerModelResponse | null>(null);
  const [history, setHistory] = useState<PlayerHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null);
  const [receipts, setReceipts] = useState<EvidenceReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  useEffect(() => {
    api
      .getPlayerModel()
      .then((response) => {
        setModel(response);
        const worst = response.skills
          .filter((skill) => skill.hasEvidence)
          .sort((a, b) => a.mastery - b.mastery)[0];
        if (worst) void selectSkill(worst);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load player model."));
    api.getPlayerHistory().then(setHistory).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectSkill(skill: SkillSummary) {
    setSelectedSkill(skill);
    if (!skill.hasEvidence) {
      setReceipts([]);
      return;
    }
    setLoadingReceipts(true);
    try {
      const response = await api.getSkillEvidence(skill.skillId);
      setReceipts(response.receipts);
    } finally {
      setLoadingReceipts(false);
    }
  }

  if (error) {
    return (
      <div className="page-content">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="page-content">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const radarAxes = RADAR_SKILL_IDS.map((id) => {
    const skill = model.skills.find((s) => s.skillId === id);
    return { label: RADAR_LABELS[id], value: skill?.mastery ?? 0 };
  });

  return (
    <div className="page">
      <header className="page-header" style={{ display: "block" }}>
        <div className="dashboard-header-eyebrow">player model</div>
        <h1 style={{ fontSize: 28 }}>Your player model</h1>
        <p className="muted mono" style={{ margin: "6px 0 0", fontSize: 12.5, textTransform: "uppercase" }}>
          Every score has a receipt. No black box.
        </p>
      </header>

      <div className="model-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="model-level-card">
            <div className="model-level-eyebrow">Current level</div>
            {model.level ? (
              <div className="model-level-value">
                <span className="model-level-l">{model.level}</span>
                <span className="model-level-name">{model.levelName}</span>
              </div>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#c4beb0" }}>
                Upload games with rating headers (Chess.com/Lichess exports include these) to place you on the 7-level scale.
              </p>
            )}
            <div className="model-divider" />
            <div className="model-level-eyebrow">Diagnosed plateau</div>
            {model.plateau ? (
              <>
                <div className="model-plateau-name">{model.plateau.name}</div>
                <p className="model-plateau-desc">{model.plateau.whatHappens}</p>
              </>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#c4beb0" }}>
                Not enough evidence yet to diagnose a plateau — analyze more games in the skills this rating band depends on.
              </p>
            )}
          </div>

          <div className="model-radar-card">
            <div className="model-radar-title">Skill profile (8-skill overview)</div>
            <RadarChart axes={radarAxes} />
          </div>

          <div className="model-radar-card">
            <div className="model-radar-title">Mastery over time</div>
            <div style={{ padding: "14px 16px" }}>
              {history ? (
                <MasterySparkline snapshots={history.snapshots} />
              ) : (
                <div className="skill-empty">Loading…</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="model-skills-card">
            <div className="model-skills-header">
              <h2>27 skills, tracked by evidence</h2>
              <span className="card-meta mono" style={{ color: "var(--text-faint)" }}>
                Bayesian estimate
              </span>
            </div>
            <div style={{ padding: "18px 20px" }}>
              {model.skills.map((skill) => (
                <button
                  key={skill.skillId}
                  type="button"
                  onClick={() => skill.hasEvidence && void selectSkill(skill)}
                  className="skill-row"
                  style={{
                    width: "100%",
                    background: selectedSkill?.skillId === skill.skillId ? "var(--surface-sunk)" : "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: skill.hasEvidence ? "pointer" : "default",
                  }}
                >
                  <span className="skill-row-dot" style={{ background: CATEGORY_COLOR[skill.category] }} />
                  <span className={`skill-row-name ${skill.mastery < 50 && skill.hasEvidence ? "weak" : ""}`}>{skill.name}</span>
                  <SkillTooltip skill={skill} />
                  <span className="skill-row-track">
                    <span
                      className={`skill-row-fill ${skill.hasEvidence ? "" : "no-data"}`}
                      style={{ width: `${skill.hasEvidence ? skill.mastery : 100}%`, background: skill.hasEvidence ? barColor(skill.mastery) : undefined }}
                    />
                  </span>
                  <span className={`skill-row-mastery ${skill.hasEvidence ? "" : "no-data"}`}>{skill.hasEvidence ? skill.mastery : "—"}</span>
                  <span className="skill-row-trend" style={{ color: skill.hasEvidence ? TREND_COLOR[skill.trend] : "transparent" }}>
                    {skill.hasEvidence ? TREND_GLYPH[skill.trend] : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="model-evidence-card">
            <div className="model-evidence-header">
              <h2>{selectedSkill ? `Evidence → "${selectedSkill.name}: ${selectedSkill.mastery}"` : "Evidence"}</h2>
              <p>The exact moves the score is built from</p>
            </div>
            <div className="model-evidence-card-body">
              {!selectedSkill ? (
                <div className="skill-empty">Analyze a game to start building your player model.</div>
              ) : loadingReceipts ? (
                <div className="skill-empty">Loading…</div>
              ) : receipts.length === 0 ? (
                <div className="skill-empty">No evidence recorded for this skill yet.</div>
              ) : (
                receipts.map((receipt) => {
                  const badge = CLASS_BADGE[receipt.direction];
                  return (
                    <div key={receipt.id} className="evidence-row" style={{ borderLeftColor: badge.color }}>
                      <span className="evidence-badge" style={{ background: badge.color }}>
                        {badge.badge}
                      </span>
                      <div className="evidence-body">
                        <div className="evidence-move-row">
                          <span className="evidence-san">
                            {Math.ceil(receipt.move.ply / 2)}
                            {receipt.move.color === "black" ? "…" : "."} {receipt.move.san}
                          </span>
                          <span className="evidence-game">
                            {receipt.game.white} vs {receipt.game.black}
                          </span>
                          <span
                            className="evidence-dir"
                            style={{ color: receipt.direction === "for" ? "var(--best)" : "var(--blunder)" }}
                          >
                            {receipt.direction === "for" ? "supports strength" : "counts against"}
                          </span>
                        </div>
                        {receipt.note ? <p className="evidence-note">{receipt.note}</p> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
