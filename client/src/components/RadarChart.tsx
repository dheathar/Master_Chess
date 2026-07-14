interface RadarAxis {
  label: string;
  value: number; // 0-100
}

function point(cx: number, cy: number, radius: number, index: number, count: number, ratio: number): [number, number] {
  const angle = (-90 + index * (360 / count)) * (Math.PI / 180);
  return [cx + radius * ratio * Math.cos(angle), cy + radius * ratio * Math.sin(angle)];
}

export function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const cx = 155;
  const cy = 150;
  const radius = 112;
  const count = axes.length;

  const rings = [0.25, 0.5, 0.75, 1].map((ratio) =>
    axes.map((_, i) => point(cx, cy, radius, i, count, ratio).join(",")).join(" "),
  );

  const axisLines = axes.map((axis, i) => {
    const [x2, y2] = point(cx, cy, radius, i, count, 1);
    const [lx, ly] = point(cx, cy, radius, i, count, 1.2);
    const anchor: "start" | "middle" | "end" = lx > cx + 4 ? "start" : lx < cx - 4 ? "end" : "middle";
    return { x2, y2, lx, ly: ly + 3, anchor, label: axis.label };
  });

  const dataPoints = axes.map((axis, i) => point(cx, cy, radius, i, count, axis.value / 100));
  const dataPolygon = dataPoints.map((p) => p.join(",")).join(" ");

  return (
    <svg viewBox="0 0 310 300" width="100%" height="272" style={{ display: "block", padding: "6px 0" }}>
      {rings.map((ring, i) => (
        <polygon key={i} points={ring} fill="none" stroke="#d8cfb8" strokeWidth={1.5} />
      ))}
      {axisLines.map((axis, i) => (
        <line key={i} x1={cx} y1={cy} x2={axis.x2} y2={axis.y2} stroke="#c7bca0" strokeWidth={1.5} />
      ))}
      {axisLines.map((axis, i) => (
        <text
          key={i}
          x={axis.lx}
          y={axis.ly}
          textAnchor={axis.anchor}
          fontFamily="Space Mono"
          fontSize={10}
          fontWeight={700}
          fill="#444"
        >
          {axis.label}
        </text>
      ))}
      <polygon points={dataPolygon} fill="rgba(229,67,28,.18)" stroke="var(--red)" strokeWidth={2.5} />
      {dataPoints.map((p, i) => (
        <rect key={i} x={p[0] - 3} y={p[1] - 3} width={6} height={6} fill="var(--ink)" />
      ))}
    </svg>
  );
}
