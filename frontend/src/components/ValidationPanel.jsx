import React, { useEffect, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { getValidation } from "../api/client";

export default function ValidationPanel({ crop }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    if (!crop) return;
    getValidation(crop).then(setMetrics).catch(() => setMetrics(null));
  }, [crop]);

  if (!metrics) return <div className="card"><h2>Validation against historical yield</h2>Loading…</div>;

  const flcBetter = metrics.FLC.MAE < metrics.Baseline_HistMean.MAE;
  const scatterData = (metrics.samples || []).map((s) => ({ x: s.Actual_Yield, y: s.Predicted_Yield, district: s.District, year: s.Year }));
  const allVals = scatterData.flatMap((d) => [d.x, d.y]);
  const lo = Math.min(...allVals, 0), hi = Math.max(...allVals, 1);

  return (
    <div className="card">
      <h2>Validation against historical yield — {crop}</h2>
      <div className="metric-grid">
        <div className="metric"><div className="v">{metrics.FLC.MAE}</div><div className="k">MAE (t/ha)</div></div>
        <div className="metric"><div className="v">{metrics.FLC.RMSE}</div><div className="k">RMSE (t/ha)</div></div>
        <div className="metric"><div className="v">{metrics.FLC.MAPE_pct}%</div><div className="k">MAPE</div></div>
        <div className="metric"><div className="v">{metrics.FLC.R2}</div><div className="k">R²</div></div>
      </div>
      <div style={{ margin: "14px 0" }}>
        <span className={`pill ${flcBetter ? "good" : "bad"}`}>
          {flcBetter ? "Beats" : "Underperforms"} historical-mean baseline
        </span>
        <span style={{ color: "var(--sub)", fontSize: 12.5, marginLeft: 8 }}>
          FLC MAE {metrics.FLC.MAE} vs mean-baseline {metrics.Baseline_HistMean.MAE} vs linear-regression {metrics.Baseline_LinearRegression.MAE}
          {" "}· trained {metrics.train_years}, tested {metrics.test_years} ({metrics.n_test} records)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis type="number" dataKey="x" name="Actual" domain={[lo, hi]} tick={{ fontSize: 11 }} label={{ value: "Actual yield (t/ha)", position: "insideBottom", offset: -4, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="Predicted" domain={[lo, hi]} tick={{ fontSize: 11 }} label={{ value: "Predicted", angle: -90, position: "insideLeft", fontSize: 11 }} />
          <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke="var(--sub)" strokeDasharray="4 3" />
          <Tooltip formatter={(v) => v.toFixed(2)} labelFormatter={() => ""} contentStyle={{ fontSize: 12 }} />
          <Scatter data={scatterData} fill="var(--leaf)" />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="footnote">Points on the dashed line are perfect predictions. Scatter shows the held-out test years only.</div>
    </div>
  );
}
