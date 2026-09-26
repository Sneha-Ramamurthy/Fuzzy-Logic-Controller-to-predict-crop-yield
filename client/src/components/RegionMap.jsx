import React, { useEffect, useState } from "react";
import { getCropRecords } from "../api/client";

function colorFor(yieldVal, lowT, highT) {
  if (yieldVal <= lowT) return "var(--low)";
  if (yieldVal >= highT) return "var(--high)";
  return "var(--med)";
}

export default function RegionMap({ crop }) {
  const [byDistrict, setByDistrict] = useState([]);

  useEffect(() => {
    if (!crop) return;
    getCropRecords(crop, { limit: 1000 }).then((records) => {
      const grouped = {};
      records.forEach((r) => {
        grouped[r.District] ||= { district: r.District, state: r.State, sum: 0, n: 0 };
        grouped[r.District].sum += r.Yield_tonnes_per_ha;
        grouped[r.District].n += 1;
      });
      const rows = Object.values(grouped).map((g) => ({ ...g, avg: g.sum / g.n }));
      setByDistrict(rows.sort((a, b) => a.district.localeCompare(b.district)));
    });
  }, [crop]);

  if (byDistrict.length === 0) {
    return <div className="card"><h2>District-average yield</h2><span style={{ color: "var(--sub)" }}>Loading…</span></div>;
  }

  const avgs = byDistrict.map((d) => d.avg).sort((a, b) => a - b);
  const lowT = avgs[Math.floor(avgs.length * 0.33)];
  const highT = avgs[Math.floor(avgs.length * 0.66)];

  const cols = 4;
  const cellW = 100, cellH = 70, gap = 10;

  return (
    <div className="card">
      <h2>District-average yield — {crop}</h2>
      <div className="footnote" style={{ margin: "0 0 12px" }}>
        Placeholder grid layout, not real geography — a real choropleth needs an actual district boundary file (GADM/IMD shapefile), which hasn't been supplied yet. Color = tercile of average yield (low/medium/high).
      </div>
      <svg viewBox={`0 0 ${cols * (cellW + gap)} ${Math.ceil(byDistrict.length / cols) * (cellH + gap)}`} width="100%">
        {byDistrict.map((d, i) => {
          const x = (i % cols) * (cellW + gap);
          const y = Math.floor(i / cols) * (cellH + gap);
          return (
            <g key={d.district} transform={`translate(${x},${y})`}>
              <rect className="region" width={cellW} height={cellH} rx="6" fill={colorFor(d.avg, lowT, highT)} />
              <text x={8} y={20} fontSize="11" fill="#fff" fontWeight="600">{d.district}</text>
              <text x={8} y={38} fontSize="10" fill="#fff" opacity="0.85">{d.state}</text>
              <text x={8} y={56} fontSize="13" fill="#fff" fontWeight="700">{d.avg.toFixed(2)} t/ha</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
