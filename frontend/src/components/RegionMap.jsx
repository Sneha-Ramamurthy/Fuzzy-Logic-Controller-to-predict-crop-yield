import React, { useEffect, useMemo, useState } from "react";
import { getCropRecords } from "../api/client";
import geo from "../data/districts.json"; // simplified GADM v4.1 level-2 boundaries (Maharashtra, Punjab, Karnataka)

// Dataset spelling -> GADM spelling
const ALIAS = { Ahmednagar: "Ahmadnagar" };
const gadmName = (n) => ALIAS[n] || n;

function colorFor(yieldVal, lowT, highT) {
  if (yieldVal <= lowT) return "var(--low)";
  if (yieldVal >= highT) return "var(--high)";
  return "var(--med)";
}

// Equirectangular projection, corrected for latitude, fitted to a state's bounding box
function buildProjection(districts, width = 360, pad = 8) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  districts.forEach((d) => d.polygons.forEach((poly) => poly[0].forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  })));
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = (width - 2 * pad) / ((maxX - minX) * k);
  const height = (maxY - minY) * scale + 2 * pad;
  const project = ([x, y]) => [pad + (x - minX) * k * scale, pad + (maxY - y) * scale];
  return { project, width, height };
}

const pathFor = (d, project) =>
  d.polygons
    .map((poly) =>
      poly.map((ring) => "M" + ring.map((pt) => project(pt).map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("")
    )
    .join("");

// Rough label anchor: centre of the largest ring's bounding box
function labelPoint(d, project) {
  let best = null, bestArea = -1;
  d.polygons.forEach((poly) => {
    const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
    const a = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (a > bestArea) { bestArea = a; best = { c: [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2], w: Math.max(...xs) - Math.min(...xs) }; }
  });
  const [x, y] = project(best.c);
  const [x2] = project([best.c[0] + best.w, best.c[1]]);
  return [x, y, x2 - x]; // third value: approx. pixel width of the district
}

export default function RegionMap({ crop }) {
  const [byDistrict, setByDistrict] = useState([]);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!crop) return;
    getCropRecords(crop, { limit: 1000 }).then((records) => {
      const grouped = {};
      records.forEach((r) => {
        grouped[r.District] ||= { district: r.District, state: r.State, sum: 0, n: 0 };
        grouped[r.District].sum += r.Yield_tonnes_per_ha;
        grouped[r.District].n += 1;
      });
      setByDistrict(Object.values(grouped).map((g) => ({ ...g, avg: g.sum / g.n })));
    });
  }, [crop]);

  const lookup = useMemo(() => {
    const m = {};
    byDistrict.forEach((d) => { m[`${d.state}|${gadmName(d.district)}`] = d; });
    return m;
  }, [byDistrict]);

  const projections = useMemo(() => {
    const out = {};
    Object.entries(geo).forEach(([state, districts]) => { out[state] = buildProjection(districts); });
    return out;
  }, []);

  if (byDistrict.length === 0) {
    return <div className="card"><h2>District-average yield</h2><span style={{ color: "var(--sub)" }}>Loading…</span></div>;
  }

  const avgs = byDistrict.map((d) => d.avg).sort((a, b) => a - b);
  const lowT = avgs[Math.floor(avgs.length * 0.33)];
  const highT = avgs[Math.floor(avgs.length * 0.66)];
  const states = Object.keys(geo).filter((s) => byDistrict.some((d) => d.state === s));

  return (
    <div className="card">
      <h2>District-average yield — {crop}
        <span className="sub">{hover ? `${hover.district}, ${hover.state}: ${hover.avg.toFixed(2)} t/ha` : "hover a district"}</span>
      </h2>
      <div className="grid3">
        {states.map((state) => {
          const { project, width, height } = projections[state];
          return (
            <div key={state}>
              <label>{state}</label>
              <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
                {geo[state].map((d) => {
                  const hit = lookup[`${state}|${d.name}`];
                  return (
                    <path
                      key={d.name}
                      d={pathFor(d, project)}
                      className="region"
                      fill={hit ? colorFor(hit.avg, lowT, highT) : "var(--line)"}
                      stroke="var(--panel)"
                      strokeWidth={hit ? 1.2 : 0.8}
                      fillRule="evenodd"
                      onMouseEnter={() => hit && setHover(hit)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <title>{hit ? `${hit.district}: ${hit.avg.toFixed(2)} t/ha` : `${d.name} (no data)`}</title>
                    </path>
                  );
                })}
                {geo[state].map((d) => {
                  const hit = lookup[`${state}|${d.name}`];
                  if (!hit) return null;
                  const [x, y, w] = labelPoint(d, project);
                  const showName = w > 55;
                  return (
                    <g key={d.name} pointerEvents="none" textAnchor="middle" fill="#fff">
                      {showName && <text x={x} y={y - 2} fontSize="10" fontWeight="650" stroke="rgba(0,0,0,.35)" strokeWidth="2.5" paintOrder="stroke">{hit.district}</text>}
                      <text x={x} y={showName ? y + 10 : y + 4} fontSize="10" fontWeight="700" stroke="rgba(0,0,0,.35)" strokeWidth="2.5" paintOrder="stroke">{hit.avg.toFixed(2)}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 14 }}>
        <span><i style={{ background: "var(--low)" }} /> Low (≤ {lowT.toFixed(2)})</span>
        <span><i style={{ background: "var(--med)" }} /> Medium</span>
        <span><i style={{ background: "var(--high)" }} /> High (≥ {highT.toFixed(2)})</span>
        <span><i style={{ background: "var(--line)" }} /> No data</span>
      </div>
      <div className="footnote" style={{ margin: "10px 0 0" }}>
        Boundaries: GADM v4.1 district polygons (simplified). Colour = tercile of average yield (t/ha) across the districts in the dataset.
      </div>
    </div>
  );
}
