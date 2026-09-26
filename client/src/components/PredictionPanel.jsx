import React, { useEffect, useState, useCallback } from "react";
import { predict } from "../api/client";

function boundsFromMF(mf) {
  const all = [...mf.low, ...mf.medium, ...mf.high];
  return [Math.min(...all), Math.max(...all)];
}

export default function PredictionPanel({ crops, crop, setCrop, config, onResult }) {
  const [area, setArea] = useState(0);
  const [rainfall, setRainfall] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config) return;
    const [aMin, aMax] = boundsFromMF(config.area_mf_ha);
    const [rMin, rMax] = boundsFromMF(config.rainfall_mf_mm);
    setArea(Math.round((aMin + aMax) / 2));
    setRainfall(Math.round((rMin + rMax) / 2));
  }, [config]);

  const runPrediction = useCallback(async (a, r) => {
    if (!crop) return;
    setLoading(true);
    try {
      const res = await predict(crop, a, r);
      setResult(res);
      onResult(res, a, r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [crop, onResult]);

  useEffect(() => {
    if (area && rainfall) runPrediction(area, rainfall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, rainfall, crop]);

  if (!config) return <div className="card"><h2>Prediction scenario</h2>Loading crop config…</div>;

  const [aMin, aMax] = boundsFromMF(config.area_mf_ha);
  const [rMin, rMax] = boundsFromMF(config.rainfall_mf_mm);

  return (
    <div className="card">
      <h2>Prediction scenario</h2>
      <div style={{ marginBottom: 16 }}>
        <label>Crop</label>
        <select value={crop} onChange={(e) => setCrop(e.target.value)}>
          {crops.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div className="sliderval"><span>Cultivated area</span><b>{Math.round(area).toLocaleString()} ha</b></div>
        <input type="range" min={aMin} max={aMax} step={(aMax - aMin) / 100} value={area}
          onChange={(e) => setArea(Number(e.target.value))} />
      </div>
      <div>
        <div className="sliderval"><span>Growing-season rainfall</span><b>{Math.round(rainfall).toLocaleString()} mm</b></div>
        <input type="range" min={rMin} max={rMax} step={(rMax - rMin) / 100} value={rainfall}
          onChange={(e) => setRainfall(Number(e.target.value))} />
      </div>
      <div className="bigwrap">
        <div className="big">{result?.predictedYield != null ? result.predictedYield.toFixed(2) : (loading ? "…" : "–")}</div>
        <div className="biglabel">Predicted yield, tonnes / hectare</div>
      </div>
    </div>
  );
}
