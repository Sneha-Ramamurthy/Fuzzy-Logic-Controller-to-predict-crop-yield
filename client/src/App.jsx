import React, { useEffect, useState, useCallback } from "react";
import { getCrops, getCropConfig } from "./api/client";
import PredictionPanel from "./components/PredictionPanel";
import RuleActivation from "./components/RuleActivation";
import MembershipChart from "./components/MembershipChart";
import ValidationPanel from "./components/ValidationPanel";
import LiveFeed from "./components/LiveFeed";
import RegionMap from "./components/RegionMap";

export default function App() {
  const [crops, setCrops] = useState([]);
  const [crop, setCrop] = useState("");
  const [config, setConfig] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [lastInputs, setLastInputs] = useState({ area: null, rainfall: null });
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    getCrops()
      .then((list) => { setCrops(list); if (list.length) setCrop(list[0]); })
      .catch(() => setApiError(true));
  }, []);

  useEffect(() => {
    if (!crop) return;
    getCropConfig(crop).then(setConfig).catch(() => setConfig(null));
  }, [crop]);

  const handleResult = useCallback((result, area, rainfall) => {
    setLastResult(result);
    setLastInputs({ area, rainfall });
  }, []);

  if (apiError) {
    return (
      <div className="wrap">
        <h1>Fuzzy Crop Yield Controller</h1>
        <div className="note">
          Can't reach the API at the configured VITE_API_BASE. Make sure the server is running
          (<code>cd server && npm run dev</code>) and MongoDB is seeded (<code>npm run seed</code>).
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <h1>Fuzzy Crop Yield Controller</h1>
        <div className="tag">MERN stack · Mamdani inference · live simulated field readings via Socket.IO</div>
      </header>

      <div className="note">
        Backend is seeded from a <b>synthetic demo dataset</b> matching the real crop_production.csv / rainfall.csv schema.
        Swap in real data and re-run <code>npm run seed</code> to get real predictions — nothing else changes.
      </div>

      <div className="grid">
        <PredictionPanel crops={crops} crop={crop} setCrop={setCrop} config={config} onResult={handleResult} />
        <div className="card">
          <h2>Rule activation</h2>
          <RuleActivation firedRules={lastResult?.firedRules} />
        </div>
      </div>

      {config && (
        <div className="card">
          <h2>Membership functions — {crop}</h2>
          <div className="grid3">
            <div><label>Area</label><MembershipChart mf={config.area_mf_ha} unit=" ha" marker={lastInputs.area} /></div>
            <div><label>Rainfall</label><MembershipChart mf={config.rainfall_mf_mm} unit=" mm" marker={lastInputs.rainfall} /></div>
            <div><label>Yield</label><MembershipChart mf={config.yield_mf_t_ha} unit=" t/ha" marker={lastResult?.predictedYield} /></div>
          </div>
        </div>
      )}

      <LiveFeed crop={crop} />

      <ValidationPanel crop={crop} />

      <RegionMap crop={crop} />

      <div className="footnote">
        Rule firing strength is not a confidence score — it's how strongly each linguistic rule matched the input.
        Live readings are simulated on the server for demo purposes, not from real sensors.
      </div>
    </div>
  );
}
