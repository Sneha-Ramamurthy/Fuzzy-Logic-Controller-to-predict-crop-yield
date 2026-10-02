"""Loads the CSV once at startup, fits membership functions, runs validation.

Everything lives in memory -- no database needed. If you later want
persistence, swap this module for one backed by MongoDB/Postgres; the API
layer only depends on the methods below.
"""
from __future__ import annotations

import csv
from collections import defaultdict, deque
from pathlib import Path
from typing import Deque, Dict, List

from .fitting import fit_crop_config
from .validation import validate_crop

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "crop_yield_fuzzy_dataset.csv"


def _to_row(raw: dict) -> dict:
    return {
        "State": raw["State"], "District": raw["District"],
        "Subdivision": raw["Subdivision"], "Year": int(raw["Year"]),
        "Season": raw["Season"], "Crop": raw["Crop"],
        "Area_ha": float(raw["Area_ha"]), "Rainfall_mm": float(raw["Rainfall_mm"]),
        "Production_tonnes": float(raw["Production_tonnes"]),
        "Yield_tonnes_per_ha": float(raw["Yield_tonnes_per_ha"]),
    }


class DataStore:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path
        self.records_by_crop: Dict[str, List[dict]] = {}
        self.configs: Dict[str, dict] = {}
        self.metrics: Dict[str, dict] = {}
        self.sim_history: Dict[str, Deque[dict]] = defaultdict(lambda: deque(maxlen=200))
        self.load()

    def load(self) -> None:
        with open(self.path, newline="", encoding="utf-8") as f:
            rows = []
            for raw in csv.DictReader(f):
                try:
                    rows.append(_to_row(raw))
                except (ValueError, KeyError):
                    continue  # skip malformed rows
        by_crop: Dict[str, List[dict]] = defaultdict(list)
        for r in rows:
            by_crop[r["Crop"]].append(r)
        self.records_by_crop = dict(by_crop)
        for crop, recs in self.records_by_crop.items():
            cfg = fit_crop_config(recs)
            self.configs[crop] = cfg
            m = validate_crop(recs, cfg)
            if m:
                self.metrics[crop] = m
        print(f"[data] loaded {len(rows)} rows, {len(self.configs)} crops")

    @property
    def crops(self) -> List[str]:
        return sorted(self.configs)
