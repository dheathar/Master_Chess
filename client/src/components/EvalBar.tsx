import { winProbability } from "@shared/classification";

export function EvalBar({ cp }: { cp: number | null }) {
  const wp = cp === null ? 0.5 : winProbability(cp);
  const whitePercent = Math.round(wp * 1000) / 10;
  // Mate scores are encoded server-side as ±(100000 - mateIn*100), so the
  // distance is recoverable: 99900 → M1, 99700 → M3, exactly ±100000 → mate
  // already delivered on the board.
  let label: string;
  if (cp === null) {
    label = "—";
  } else if (Math.abs(cp) >= 90_000) {
    const mateIn = Math.round((100_000 - Math.abs(cp)) / 100);
    const text = mateIn === 0 ? "#" : `M${mateIn}`;
    label = cp > 0 ? text : `-${text}`;
  } else {
    label = `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(1)}`;
  }

  const whiteWinning = (cp ?? 0) >= 0;

  return (
    <div className="eval-bar" title={`White win probability: ${whitePercent}%`}>
      <div className="eval-bar-black" style={{ height: `${100 - whitePercent}%` }} />
      <div
        className="eval-bar-label"
        style={{
          [whiteWinning ? "bottom" : "top"]: 5,
          color: whiteWinning ? "var(--text-3)" : "var(--surface-sunk)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
