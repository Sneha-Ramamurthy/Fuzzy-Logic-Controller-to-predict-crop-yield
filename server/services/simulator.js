/**
 * Simulates a live stream of field readings (as if incoming from district
 * weather stations / area surveys) and runs each one through the fuzzy
 * engine, broadcasting the result over Socket.IO so the dashboard updates
 * without polling. Every reading is also logged to MongoDB (SimulatedReading)
 * so a page refresh can catch up via GET /api/simulated/:crop.
 *
 * This is clearly synthetic/simulated data generation for demo purposes —
 * NOT a real IoT or weather-station integration.
 */
const FuzzyConfig = require("../models/FuzzyConfig");
const SimulatedReading = require("../models/SimulatedReading");
const { predictYield } = require("./fuzzyEngine");

const DISTRICTS = [
  { state: "Maharashtra", district: "Pune" },
  { state: "Maharashtra", district: "Nashik" },
  { state: "Maharashtra", district: "Ahmednagar" },
  { state: "Punjab", district: "Ludhiana" },
  { state: "Punjab", district: "Amritsar" },
  { state: "Karnataka", district: "Dakshina Kannada" },
];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let intervalHandle = null;

function startSimulation(io, { intervalMs = 4000 } = {}) {
  if (intervalHandle) return; // already running

  intervalHandle = setInterval(async () => {
    try {
      const configs = await FuzzyConfig.find();
      if (configs.length === 0) return; // not seeded yet

      const cfg = pick(configs);
      const { state, district } = pick(DISTRICTS);

      // sample area/rainfall within (and slightly beyond) that crop's observed
      // range so the live feed occasionally shows edge-of-distribution cases
      const areaBounds = [...cfg.area_mf_ha.low, ...cfg.area_mf_ha.high];
      const rainBounds = [...cfg.rainfall_mf_mm.low, ...cfg.rainfall_mf_mm.high];
      const area = randomBetween(Math.min(...areaBounds) * 0.9, Math.max(...areaBounds) * 1.1);
      const rainfall = randomBetween(Math.min(...rainBounds) * 0.9, Math.max(...rainBounds) * 1.1);

      const result = predictYield(area, rainfall, cfg.toObject());

      const reading = await SimulatedReading.create({
        crop: cfg.crop,
        state,
        district,
        area_ha: Number(area.toFixed(1)),
        rainfall_mm: Number(rainfall.toFixed(1)),
        predicted_yield: result.predictedYield,
        firedRuleCount: result.firedRules.length,
      });

      io.emit("simulated-reading", {
        crop: cfg.crop,
        state,
        district,
        area_ha: reading.area_ha,
        rainfall_mm: reading.rainfall_mm,
        predicted_yield: reading.predicted_yield,
        firedRules: result.firedRules,
        areaMembership: result.areaMembership,
        rainMembership: result.rainMembership,
        createdAt: reading.createdAt,
      });
    } catch (err) {
      console.error("[simulator] tick failed:", err.message);
    }
  }, intervalMs);

  console.log(`[simulator] started, emitting every ${intervalMs}ms`);
}

function stopSimulation() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { startSimulation, stopSimulation };
