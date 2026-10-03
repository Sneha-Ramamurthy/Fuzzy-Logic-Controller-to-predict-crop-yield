"""FastAPI app: REST endpoints + WebSocket live feed. Run with:
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .data_store import DataStore
from .fuzzy_engine import predict_yield
from .simulator import Simulator

store = DataStore()
simulator = Simulator(store, float(os.getenv("SIMULATION_INTERVAL_S", "4")))


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(simulator.run())
    yield
    task.cancel()


app = FastAPI(title="Fuzzy Crop Yield Controller", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CLIENT_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"], allow_headers=["*"],
)


class PredictIn(BaseModel):
    crop: str
    area_ha: float
    rainfall_mm: float


def _config_or_404(crop: str) -> dict:
    cfg = store.configs.get(crop)
    if cfg is None:
        raise HTTPException(404, f'No fuzzy config for crop "{crop}"')
    return cfg


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/crops")
def crops():
    return {"crops": store.crops}


@app.get("/api/crops/{crop}/records")
def records(crop: str, year: int | None = None, district: str | None = None,
            limit: int = Query(100, ge=1, le=5000)):
    _config_or_404(crop)
    rows = store.records_by_crop[crop]
    if year is not None:
        rows = [r for r in rows if r["Year"] == year]
    if district:
        rows = [r for r in rows if r["District"] == district]
    rows = sorted(rows, key=lambda r: r["Year"])[:limit]
    return {"count": len(rows), "records": rows}


@app.get("/api/crops/{crop}/district-averages")
def district_averages(crop: str):
    """Per-district average yield (all years) -- feeds the choropleth map."""
    _config_or_404(crop)
    rows = store.district_averages(crop)
    return {"count": len(rows), "districts": rows}


@app.get("/api/reference/all-india")
def all_india_reference(crop: str | None = None):
    """National crop-wise area/production/yield (2021-26) -- context for the district-level data."""
    rows = store.reference
    if crop:
        rows = [r for r in rows if r.get("Crop", "").lower() == crop.lower()]
    return {"count": len(rows), "rows": rows}


@app.get("/api/crops/{crop}/config")
def config(crop: str):
    return {"crop": crop, **_config_or_404(crop)}


@app.post("/api/predict")
def predict(body: PredictIn):
    return predict_yield(body.area_ha, body.rainfall_mm, _config_or_404(body.crop))


@app.get("/api/validation/{crop}")
def validation(crop: str):
    m = store.metrics.get(crop)
    if m is None:
        raise HTTPException(404, f'No validation metrics for crop "{crop}"')
    return {"crop": crop, **m}


@app.get("/api/simulated/{crop}")
def simulated(crop: str, limit: int = Query(30, ge=1, le=200)):
    return {"readings": list(store.sim_history.get(crop, []))[-limit:]}


@app.websocket("/ws/simulated")
async def ws_simulated(ws: WebSocket):
    await ws.accept()
    simulator.clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # keep the connection open
    except WebSocketDisconnect:
        simulator.clients.discard(ws)
