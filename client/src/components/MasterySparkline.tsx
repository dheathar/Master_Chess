import type { PlayerSnapshotSummary } from "@shared/api";

const WIDTH = 600;
const HEIGHT = 120;
const PAD = 10;

export function MasterySparkline({ snapshots }: { snapshots: PlayerSnapshotSummary[] }) {
  const points = snapshots.filter((snapshot) => snapshot.avgMasteryOfEvidencedSkills !== null);

  if (points.length < 2) {
    return (
      <div className="skill-empty">
        {points.length === 0 ? "No analyzed games yet." : "Analyze one more game to see a trend line."}
      </div>
    );
  }

  const minTime = points[0].takenAt;
  const maxTime = points[points.length - 1].takenAt;
  const timeSpan = Math.max(1, maxTime - minTime);

  const coords = points.map((point) => {
    const x = PAD + ((point.takenAt - minTime) / timeSpan) * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - (point.avgMasteryOfEvidencedSkills! / 100) * (HEIGHT - PAD * 2);
    return { x, y, point };
  });

  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} style={{ display: "block" }}>
      <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="var(--border-dashed)" strokeWidth={1.5} />
      <path d={path} fill="none" stroke="var(--red)" strokeWidth={2.5} />
      {coords.map((c, i) => (
        <rect key={i} x={c.x - 3} y={c.y - 3} width={6} height={6} fill="var(--ink)" />
      ))}
      <text x={last.x} y={last.y - 10} textAnchor="end" fontFamily="Space Mono" fontSize={12} fontWeight={700} fill="var(--ink)">
        {last.point.avgMasteryOfEvidencedSkills}
      </text>
    </svg>
  );
}
