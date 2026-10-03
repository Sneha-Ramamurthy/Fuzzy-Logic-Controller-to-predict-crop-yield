# Fuzzy Crop Yield Controller — React + Python

**Frontend:** React (Vite, Recharts)
**Backend:** FastAPI. All the logic is Python, and the Mamdani engine is **pure standard-library Python** (no numpy / scikit-fuzzy).

```
backend/
  app/fuzzy_engine.py   Mamdani inference: fuzzify -> min (AND) -> clip -> max (aggregate) -> centroid
  app/fitting.py        Per-crop membership functions (data percentiles) + rule base learned from data
  app/validation.py     70/30 time split, MAE/RMSE/MAPE/R2 vs mean + linear-regression baselines
  app/data_store.py     Loads the CSV at startup, fits + validates (in memory, no DB)
  app/simulator.py      Synthetic live readings pushed over WebSocket
  app/main.py           REST + WebSocket endpoints
  data/                 Real datasets + the merged training CSV (see "Data" below)
  scripts/              generate_district_mapping.py, build_dataset.py (rebuild the CSV from raw data)
  tests/                pytest
frontend/               React dashboard (talks to the API only)
```

## Run it

Terminal 1 — backend (Python 3.10+):
```
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API docs are auto-generated at http://localhost:8000/docs

Terminal 2 — frontend (Node 18+):
```
cd frontend
npm install
cp .env.example .env
npm run dev
```
Open http://localhost:5173

Run tests: `cd backend && pytest`

## Endpoints
`GET /api/crops` · `GET /api/crops/{crop}/config` · `GET /api/crops/{crop}/records` · `GET /api/crops/{crop}/district-averages`
`POST /api/predict {crop, area_ha, rainfall_mm}` · `GET /api/validation/{crop}`
`GET /api/simulated/{crop}` · `GET /api/reference/all-india` · `WS /ws/simulated`

## Data
All files live in `backend/data/`:

| File | Source | Role |
|---|---|---|
| `crop_production.csv` | Kaggle "Crop Production in India" (district-wise, 1997-2015) | Area, Production, Season, Crop |
| `rainfall.csv` | IMD subdivision-wise monthly rainfall, 1901-2015 | Growing-season rainfall |
| `district_to_subdivision_mapping.csv` | built by `scripts/generate_district_mapping.py` | Joins district -> IMD subdivision (652 districts) |
| `district_rainfall_normal.csv` | IMD district long-period averages | Adds `Normal_Rainfall_mm` and `Rainfall_Departure_pct` (matched for ~89% of rows) |
| `all_india_crop_reference.csv` | All-India crop-wise area/production/yield, 2021-26 | Sanity check in the build report + `GET /api/reference/all-india` |
| `reference/IMD_district_rainfall_2026-10-02.pdf` | IMD one-day district rainfall snapshot | Reference only (single day, not used for training) |
| `crop_yield_fuzzy_dataset.csv` | **generated** | The merged table the backend loads (62k rows, 12 crops) |

Rebuild the merged CSV (standard library only):
```
cd backend
python scripts/generate_district_mapping.py   # only if you change crop_production.csv
python scripts/build_dataset.py
```
How rows are built: one growing season per crop (Kharif: Rice, Maize, Jowar, Bajra, Groundnut, Soyabean,
Arhar; Rabi: Wheat, Gram, Rapeseed & Mustard, Barley; Whole Year: Sugarcane). Growing-season rainfall =
Jun-Sep (Kharif), Oct-Dec + following Jan-Feb (Rabi, assuming Crop_Year is the sowing year), or annual.
Yield = Production / Area (t/ha). Years 1997-2014 (2015 is partial). Dropped: Area < 50 ha, zero/missing
production, and per-crop yield outliers beyond 3 x IQR. Only crops reported in tonnes are kept (cotton,
coconut, jute etc. use bales/nuts).

## Fuzzy model and validation
Membership functions are fitted from data percentiles. The rule base is **learned from the training data**
(Wang-Mendel style: each Area x Rainfall cell takes the yield set its mean yield falls in), replacing the fixed
expert table, which performed about 2x worse than a mean baseline on real data. Validation re-fits both
on the first 70% of years (1997-2008) and tests on 2009-2014, so test years are unseen.

Results (MAE, t/ha; test years 2009-2014): the FLC is roughly level with the historical-mean baseline for most
crops and clearly better only for Wheat (0.81 vs 0.95). R2 is near zero or negative for most crops. Area and
seasonal rainfall alone explain little of district-level yield variation (soil, irrigation, seeds, fertiliser
and technology trend are missing), so report this honestly rather than expecting high accuracy.
Adding irrigated-area share, fertiliser use or a year/trend input would be the natural next step.

## Notes
- Training data is real (historical). The live feed is still simulated (random area/rainfall for real districts), not sensors.
- The map shows real GADM v4.1 district boundaries for Karnataka, Maharashtra and Punjab only (`frontend/src/data/districts.json`); add other states' polygons there to extend it. Dataset district names are matched to GADM names via the `ALIAS` table in `RegionMap.jsx`.
- No MongoDB: everything is in memory. Swap `data_store.py` for a DB-backed version if you need persistence.
