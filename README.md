# Fuzzy Crop Yield Controller — MERN stack

React + Express + Node + MongoDB rebuild of the Fuzzy Logic crop-yield
prediction system. Same Mamdani-inference math as the earlier Python
prototype (`predictYield` in `server/services/fuzzyEngine.js` is a direct
line-for-line port), now served from a real API with data in MongoDB, plus
a live simulated data stream over Socket.IO.

Still running on the **synthetic demo dataset** (`server/data/crop_yield_fuzzy_dataset.csv`,
532 records, same schema as the real government sources) until you supply
real crop_production.csv / rainfall.csv / GIS data.

## What you need installed

- **Node.js** 18+ (`node --version`)
- **MongoDB** running locally, OR a free MongoDB Atlas cluster (just a connection string, no local install)

If you don't have MongoDB locally: go to mongodb.com/cloud/atlas, create a free
cluster, get its connection string, and put it in `server/.env` as `MONGODB_URI`.

## 1. Server setup

```
cd server
npm install
cp .env.example .env
```

Edit `.env` if you're using Atlas instead of local MongoDB (default assumes
`mongodb://127.0.0.1:27017/fuzzy_crop_yield`, which works if you have MongoDB
running locally with no auth).

Load the data into MongoDB:
```
npm run seed
```
This reads `server/data/crop_yield_fuzzy_dataset.csv`, fits fuzzy membership
functions per crop, computes validation metrics (MAE/RMSE/MAPE/R² vs two
baselines), and writes it all into three MongoDB collections. Re-run it any
time the CSV changes.

Start the server:
```
npm run dev
```
This starts Express on `http://localhost:5000` **and** begins emitting a
simulated field reading over Socket.IO every 4 seconds (configurable via
`SIMULATION_INTERVAL_MS` in `.env`).

## 2. Client setup

Open a second terminal:
```
cd client
npm install
cp .env.example .env
npm run dev
```
Open the URL it prints (`http://localhost:5173`).

## What you'll see

- **Prediction scenario** — pick a crop, drag Area/Rainfall sliders, the
  server runs live Mamdani inference and returns the predicted yield.
- **Rule activation** — which of the 9 fuzzy rules fired and how strongly.
- **Membership functions** — the fitted triangular curves for Area, Rainfall,
  Yield, with your current input marked on each.
- **Live simulated field readings** — the server invents a new
  area/rainfall reading every few seconds (as if from a field survey) and
  pushes the resulting prediction to every connected browser via Socket.IO.
  This is clearly synthetic — not a real sensor feed.
- **Validation** — actual vs predicted scatter on held-out (later-year) data,
  MAE/RMSE/MAPE/R², and comparison against a historical-mean baseline and a
  linear-regression baseline.
- **District-average yield** — a placeholder grid (not a real map) colored
  by yield tercile; becomes a real choropleth once a GIS boundary file is
  wired in (see Limitations below).

## Project structure

```
server/
  config/db.js              Mongo connection
  models/                   Mongoose schemas (CropYield, FuzzyConfig, ValidationMetric, SimulatedReading)
  routes/api.js              REST endpoints
  services/fuzzyEngine.js    Mamdani inference + centroid defuzzification (the core logic)
  services/fitMembershipFunctions.js   percentile-based membership function fitting
  services/simulator.js      live simulated reading generator, Socket.IO emitter
  scripts/seedDatabase.js    CSV -> MongoDB, fits configs, computes validation metrics
  data/                      CSVs (synthetic demo data; replace with real files)
  server.js                  entry point

client/
  src/api/client.js          REST calls to the Express API
  src/hooks/useLiveSimulation.js   Socket.IO client hook
  src/components/            PredictionPanel, RuleActivation, MembershipChart,
                              ValidationPanel, LiveFeed, RegionMap
  src/App.jsx                 assembles the dashboard
```

## Swapping in real data

1. Get real `crop_production.csv` and `rainfall.csv` (sources given earlier:
   data.desagri.gov.in for crops, data.gov.in/IMD for rainfall).
2. Run them through the Python cleaning/merge pipeline from before (or port
   that logic here) to produce a `crop_yield_fuzzy_dataset.csv` with columns:
   `State, District, Subdivision, Year, Season, Crop, Area_ha, Rainfall_mm, Production_tonnes, Yield_tonnes_per_ha`.
3. Drop it into `server/data/crop_yield_fuzzy_dataset.csv`, replacing the
   synthetic one.
4. `npm run seed` again. Everything downstream — API, dashboard, live
   simulation — picks up the real data automatically. No code changes needed.

## Known limitations of this prototype

- **No real GIS layer yet.** `RegionMap` is a colored grid, not a map. Wiring
  in GeoJSON/shapefile boundaries (GADM or IMD subdivision files) plus a
  mapping library (Leaflet/Mapbox) is the next step once you have a real
  boundary file — I can build that next.
- **Live simulation is synthetic**, not real sensor/weather-station data —
  it's there to demonstrate the real-time architecture (Socket.IO push,
  MongoDB logging with TTL expiry), not to produce meaningful readings.
- **CSV parser in `seedDatabase.js` is a simple split-on-comma** — fine for
  this clean dataset, but swap in a proper CSV library (e.g. `csv-parse`) if
  your real files contain quoted fields or embedded commas.
- Validation metrics are computed once at seed time, not live — re-seed
  after any data change to refresh them.
