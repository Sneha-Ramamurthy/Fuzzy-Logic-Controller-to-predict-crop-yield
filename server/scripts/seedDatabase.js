/**
 * Seeds MongoDB from server/data/crop_yield_fuzzy_dataset.csv:
 *   1. Loads every row into the CropYield collection.
 *   2. Fits per-crop membership functions from that crop's own records
 *      and stores them in FuzzyConfig.
 *   3. Computes time-aware validation metrics (70/30 split by year, vs
 *      historical-mean and linear-regression baselines) and stores them
 *      in ValidationMetric.
 *
 * Run: npm run seed   (from server/)
 * Re-run any time crop_yield_fuzzy_dataset.csv changes (e.g. after you swap
 * in real data and regenerate it) -- it clears and reloads all three
 * collections each time, so it's safe to run repeatedly.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const CropYield = require("../models/CropYield");
const FuzzyConfig = require("../models/FuzzyConfig");
const ValidationMetric = require("../models/ValidationMetric");
const { fitCropConfig } = require("../services/fitMembershipFunctions");
const { predictYield } = require("../services/fuzzyEngine");

function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  const [headerLine, ...lines] = text.split("\n");
  const headers = headerLine.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = cells[i]; });
    return row;
  });
}

function toNumericRow(row) {
  return {
    State: row.State,
    District: row.District,
    Subdivision: row.Subdivision,
    Year: Number(row.Year),
    Season: row.Season,
    Crop: row.Crop,
    Area_ha: Number(row.Area_ha),
    Rainfall_mm: Number(row.Rainfall_mm),
    Production_tonnes: Number(row.Production_tonnes),
    Yield_tonnes_per_ha: Number(row.Yield_tonnes_per_ha),
  };
}

function mean(arr) { return arr.reduce((s, x) => s + x, 0) / arr.length; }

function validateCrop(records, cropConfig) {
  const years = [...new Set(records.map((r) => r.Year))].sort((a, b) => a - b);
  const splitIdx = Math.floor(years.length * 0.7);
  const trainYears = new Set(years.slice(0, splitIdx));
  const testYears = new Set(years.slice(splitIdx));
  const train = records.filter((r) => trainYears.has(r.Year));
  const test = records.filter((r) => testYears.has(r.Year));
  if (train.length === 0 || test.length === 0) return null;

  const preds = [], actuals = [], samples = [];
  for (const r of test) {
    const { predictedYield } = predictYield(r.Area_ha, r.Rainfall_mm, cropConfig);
    if (predictedYield == null) continue;
    preds.push(predictedYield);
    actuals.push(r.Yield_tonnes_per_ha);
    samples.push({
      Year: r.Year, District: r.District, Area_ha: r.Area_ha, Rainfall_mm: r.Rainfall_mm,
      Actual_Yield: round(r.Yield_tonnes_per_ha), Predicted_Yield: round(predictedYield),
    });
  }
  const n = preds.length;
  const mae = mean(preds.map((p, i) => Math.abs(p - actuals[i])));
  const rmse = Math.sqrt(mean(preds.map((p, i) => (p - actuals[i]) ** 2)));
  const mape = mean(preds.map((p, i) => Math.abs((p - actuals[i]) / actuals[i]))) * 100;
  const actualMean = mean(actuals);
  const ssRes = preds.reduce((s, p, i) => s + (actuals[i] - p) ** 2, 0);
  const ssTot = actuals.reduce((s, a) => s + (a - actualMean) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;

  // baseline 1: historical mean (from train)
  const histMean = mean(train.map((r) => r.Yield_tonnes_per_ha));
  const baseMae = mean(actuals.map((a) => Math.abs(a - histMean)));
  const baseRmse = Math.sqrt(mean(actuals.map((a) => (a - histMean) ** 2)));

  // baseline 2: linear regression (least squares) on Area + Rainfall, from train
  const X = train.map((r) => [1, r.Area_ha, r.Rainfall_mm]);
  const y = train.map((r) => r.Yield_tonnes_per_ha);
  const coef = leastSquares(X, y);
  const lrPreds = test.map((r) => coef[0] + coef[1] * r.Area_ha + coef[2] * r.Rainfall_mm);
  const lrMae = mean(lrPreds.map((p, i) => Math.abs(p - test[i].Yield_tonnes_per_ha)));
  const lrRmse = Math.sqrt(mean(lrPreds.map((p, i) => (p - test[i].Yield_tonnes_per_ha) ** 2)));

  return {
    n_train: train.length, n_test: n,
    train_years: `${years[0]}-${years[splitIdx - 1]}`,
    test_years: `${years[splitIdx]}-${years[years.length - 1]}`,
    FLC: { MAE: round(mae), RMSE: round(rmse), MAPE_pct: round(mape, 1), R2: round(r2) },
    Baseline_HistMean: { MAE: round(baseMae), RMSE: round(baseRmse) },
    Baseline_LinearRegression: { MAE: round(lrMae), RMSE: round(lrRmse) },
    samples: samples.slice(0, 25),
  };
}

// simple normal-equations least squares, no external dependency
function leastSquares(X, y) {
  const XT = transpose(X);
  const XTX = matMul(XT, X);
  const XTy = matVecMul(XT, y);
  return solve(XTX, XTy);
}
function transpose(A) { return A[0].map((_, j) => A.map((row) => row[j])); }
function matMul(A, B) {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}
function matVecMul(A, v) { return A.map((row) => row.reduce((s, x, i) => s + x * v[i], 0)); }
function solve(A, b) {
  // Gaussian elimination for a small (3x3) system
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
function round(x, d = 3) { return Number(x.toFixed(d)); }

async function seed() {
  await connectDB();

  const csvPath = path.join(__dirname, "..", "data", "crop_yield_fuzzy_dataset.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`[seed] missing ${csvPath}. Run the Python pipeline first, or copy in your own crop_yield_fuzzy_dataset.csv with matching columns.`);
    process.exit(1);
  }
  const rows = parseCSV(csvPath).map(toNumericRow).filter((r) => !Number.isNaN(r.Yield_tonnes_per_ha));

  console.log(`[seed] loaded ${rows.length} rows from CSV`);

  await CropYield.deleteMany({});
  await FuzzyConfig.deleteMany({});
  await ValidationMetric.deleteMany({});

  await CropYield.insertMany(rows);
  console.log(`[seed] inserted ${rows.length} CropYield documents`);

  const byCrop = {};
  for (const r of rows) { (byCrop[r.Crop] ||= []).push(r); }

  for (const [crop, records] of Object.entries(byCrop)) {
    const cfg = fitCropConfig(records);
    await FuzzyConfig.create({ crop, ...cfg });
    console.log(`[seed] fitted membership functions for ${crop} (${records.length} records)`);

    const metrics = validateCrop(records, cfg);
    if (metrics) {
      await ValidationMetric.create({ crop, ...metrics });
      console.log(`[seed] validated ${crop}: MAE=${metrics.FLC.MAE} R2=${metrics.FLC.R2}`);
    }
  }

  console.log("[seed] done");
  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
