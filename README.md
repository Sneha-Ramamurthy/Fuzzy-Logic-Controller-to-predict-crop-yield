# Fuzzy Crop Yield Controller — React + Python

**Frontend:** React (Vite, Recharts)
**Backend:** FastAPI. All the logic is Python, and the Mamdani engine is **pure standard-library Python** (no numpy / scikit-fuzzy).

```
backend/
  app/fuzzy_engine.py   Mamdani inference: fuzzify -> min (AND) -> clip -> max (aggregate) -> centroid
  app/fitting.py        Per-crop membership functions from data percentiles
  app/validation.py     70/30 time split, MAE/RMSE/MAPE/R2 vs mean + linear-regression baselines
  app/data_store.py     Loads the CSV at startup, fits + validates (in memory, no DB)
  app/simulator.py      Synthetic live readings pushed over WebSocket
  app/main.py           REST + WebSocket endpoints
  data/                 CSVs (synthetic demo data)
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
`GET /api/crops` · `GET /api/crops/{crop}/config` · `GET /api/crops/{crop}/records`
`POST /api/predict {crop, area_ha, rainfall_mm}` · `GET /api/validation/{crop}`
`GET /api/simulated/{crop}` · `WS /ws/simulated`

## Real data
Replace `backend/data/crop_yield_fuzzy_dataset.csv` (columns: State, District, Subdivision, Year,
Season, Crop, Area_ha, Rainfall_mm, Production_tonnes, Yield_tonnes_per_ha) and restart the
backend. Configs and metrics are refitted on startup.

## Notes
- Data is synthetic and the live feed is simulated, not real sensors.
- The map is still a placeholder grid (needs a GIS boundary file).
- No MongoDB: everything is in memory. Swap `data_store.py` for a DB-backed version if you need persistence.
