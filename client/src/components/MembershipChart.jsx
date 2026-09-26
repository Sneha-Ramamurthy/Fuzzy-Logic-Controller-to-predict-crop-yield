import React from "react";

function tri(x, a, b, c) {
  if (x <= a || x >= c) return x === b ? 1 : 0;
  if (x === b) return 1;
  if (x < b) return (x - a) / (b - a || 1);
  return (c - x) / (c - b || 1);
}

export default function MembershipChart({ mf, unit, marker }) {
  if (!mf) return null;
  const all = [...mf.low, ...mf.medium, ...mf.high];
  const min = Math.min(...all), max = Math.max(...all);
  const W = 220, H = 110, PAD = 8;
  const sx = (v) => PAD + ((v - min) / (max - min || 1)) * (W - 2 * PAD);
  const sy = (v) => H - 14 - v * (H - 28);

  const path = (term, color) => {
    const [a, b, c] = mf[term];
    const pts = [[a, 0], [b, 1], [c, 0]];
    return (
      <polyline
        key={term}
        points={pts.map((p) => `${sx(p[0])},${sy(p[1])}`).join(" ")}
        fill="none" stroke={color} strokeWidth="2"
      />
    );
  };

  const markerX = marker != null ? sx(Math.min(Math.max(marker, min), max)) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <line x1={PAD} y1={H - 14} x2={W - PAD} y2={H - 14} stroke="var(--line)" />
      {path("low", "var(--low)")}
      {path("medium", "var(--med)")}
      {path("high", "var(--high)")}
      {markerX != null && (
        <line x1={markerX} y1={H - 14} x2={markerX} y2={6} stroke="var(--ink)" strokeWidth="1.3" strokeDasharray="3,2" opacity="0.6" />
      )}
      <text x={PAD} y={H - 2} fontSize="9" fill="var(--sub)">{min.toFixed(0)}</text>
      <text x={W - PAD} y={H - 2} fontSize="9" fill="var(--sub)" textAnchor="end">{max.toFixed(0)}{unit}</text>
    </svg>
  );
}
