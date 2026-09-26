const express = require("express");
const router = express.Router();

const CropYield = require("../models/CropYield");
const FuzzyConfig = require("../models/FuzzyConfig");
const ValidationMetric = require("../models/ValidationMetric");
const SimulatedReading = require("../models/SimulatedReading");
const { predictYield } = require("../services/fuzzyEngine");

// GET /api/crops -> distinct crop list + basic stats, used to populate the UI selector
router.get("/crops", async (req, res) => {
  const crops = await CropYield.distinct("Crop");
  res.json({ crops });
});

// GET /api/crops/:crop/records?year=&district= -> filtered historical rows
router.get("/crops/:crop/records", async (req, res) => {
  const { crop } = req.params;
  const { year, district, limit = 100 } = req.query;
  const query = { Crop: crop };
  if (year) query.Year = Number(year);
  if (district) query.District = district;
  const records = await CropYield.find(query).sort({ Year: 1 }).limit(Number(limit));
  res.json({ count: records.length, records });
});

// GET /api/crops/:crop/config -> fitted membership functions for that crop
router.get("/crops/:crop/config", async (req, res) => {
  const config = await FuzzyConfig.findOne({ crop: req.params.crop });
  if (!config) return res.status(404).json({ error: `No fuzzy config for crop "${req.params.crop}". Run npm run seed.` });
  res.json(config);
});

// POST /api/predict { crop, area_ha, rainfall_mm } -> live Mamdani inference
router.post("/predict", async (req, res) => {
  const { crop, area_ha, rainfall_mm } = req.body;
  if (!crop || area_ha == null || rainfall_mm == null) {
    return res.status(400).json({ error: "crop, area_ha and rainfall_mm are required" });
  }
  const config = await FuzzyConfig.findOne({ crop });
  if (!config) return res.status(404).json({ error: `No fuzzy config for crop "${crop}"` });

  const result = predictYield(Number(area_ha), Number(rainfall_mm), config.toObject());
  res.json(result);
});

// GET /api/validation/:crop -> stored MAE/RMSE/MAPE/R2 + baseline comparison
router.get("/validation/:crop", async (req, res) => {
  const metrics = await ValidationMetric.findOne({ crop: req.params.crop });
  if (!metrics) return res.status(404).json({ error: `No validation metrics for crop "${req.params.crop}"` });
  res.json(metrics);
});

// GET /api/simulated/:crop?limit=30 -> recent live-simulated readings (also pushed via socket)
router.get("/simulated/:crop", async (req, res) => {
  const { limit = 30 } = req.query;
  const readings = await SimulatedReading
    .find({ crop: req.params.crop })
    .sort({ createdAt: -1 })
    .limit(Number(limit));
  res.json({ readings: readings.reverse() });
});

module.exports = router;
