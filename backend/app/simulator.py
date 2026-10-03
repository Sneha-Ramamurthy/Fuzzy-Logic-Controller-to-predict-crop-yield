"""Synthetic live field-reading generator (demo only -- NOT real sensor data)."""
from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Set

from fastapi import WebSocket

from .data_store import DataStore
from .fuzzy_engine import predict_yield



class Simulator:
    def __init__(self, store: DataStore, interval_s: float = 4.0):
        self.store = store
        self.interval_s = interval_s
        self.clients: Set[WebSocket] = set()

    def make_reading(self) -> dict:
        crop = random.choice(self.store.crops)
        cfg = self.store.configs[crop]
        state, district = random.choice(self.store.districts_by_crop[crop])
        a_b = cfg["area_mf_ha"]["low"] + cfg["area_mf_ha"]["high"]
        r_b = cfg["rainfall_mf_mm"]["low"] + cfg["rainfall_mf_mm"]["high"]
        area = random.uniform(min(a_b) * 0.9, max(a_b) * 1.1)
        rain = random.uniform(min(r_b) * 0.9, max(r_b) * 1.1)
        res = predict_yield(area, rain, cfg)
        return {
            "crop": crop, "state": state, "district": district,
            "area_ha": round(area, 1), "rainfall_mm": round(rain, 1),
            "predicted_yield": res["predictedYield"],
            "firedRules": res["firedRules"],
            "areaMembership": res["areaMembership"],
            "rainMembership": res["rainMembership"],
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }

    async def run(self) -> None:
        while True:
            await asyncio.sleep(self.interval_s)
            reading = self.make_reading()
            self.store.sim_history[reading["crop"]].append(reading)
            dead = []
            for ws in list(self.clients):
                try:
                    await ws.send_json(reading)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.clients.discard(ws)
