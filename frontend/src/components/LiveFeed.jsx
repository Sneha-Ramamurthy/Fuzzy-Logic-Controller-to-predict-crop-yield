import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLiveSimulation } from "../hooks/useLiveSimulation";
import { getSimulatedHistory } from "../api/client";
import RuleActivation from "./RuleActivation";

export default function LiveFeed({ crop }) {
  const { readings, connected } = useLiveSimulation(crop);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!crop) return;
    getSimulatedHistory(crop, 25).then(setHistory).catch(() => setHistory([]));
  }, [crop]);

  const combined = [...history, ...readings].slice(-25);
  const chartData = combined.map((r, i) => ({ i, yield: r.predicted_yield, district: r.district }));
  const latest = readings[readings.length - 1];

  return (
    <div className="card">
      <h2>
        Live simulated field readings — {crop}{" "}
        <span className={`pill ${connected ? "live" : "bad"}`} style={{ marginLeft: 8 }}>
          {connected ? "streaming" : "disconnected"}
        </span>
      </h2>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" />
          <XAxis dataKey="i" hide />
          <YAxis tick={{ fontSize: 11 }} width={32} />
          <Tooltip formatter={(v) => v.toFixed(2)} labelFormatter={(i) => chartData[i]?.district || ""} contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="yield" stroke="var(--leaf)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      {latest ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: "var(--sub)", marginBottom: 8 }}>
            Newest reading: <b style={{ color: "var(--ink)" }}>{latest.district}, {latest.state}</b> —
            {" "}{Math.round(latest.area_ha).toLocaleString()} ha, {Math.round(latest.rainfall_mm)} mm →{" "}
            <b style={{ color: "var(--leaf-dark)" }}>{latest.predicted_yield?.toFixed(2)} t/ha</b>
          </div>
          <RuleActivation firedRules={latest.firedRules} />
        </div>
      ) : (
        <div style={{ color: "var(--sub)", fontSize: 13, marginTop: 10 }}>Waiting for the first simulated reading (server emits every few seconds)…</div>
      )}
    </div>
  );
}
