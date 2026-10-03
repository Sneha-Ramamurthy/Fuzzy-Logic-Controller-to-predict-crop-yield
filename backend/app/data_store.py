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

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_FILE = DATA_DIR / "crop_yield_fuzzy_dataset.csv"
REFERENCE_FILE = DATA_DIR / "all_india_crop_reference.csv"   # national totals, for context only


def _opt(raw: dict, key: str):
    """Optional numeric column (older CSVs may not have it)."""
    try:
        return float(raw[key])
    except (KeyError, TypeError, ValueError):
        return None


def _to_row(raw: dict) -> dict:
    return {
        "State": raw["State"], "District": raw["District"],
        "Subdivision": raw["Subdivision"], "Year": int(raw["Year"]),
        "Season": raw["Season"], "Crop": raw["Crop"],
        "Area_ha": float(raw["Area_ha"]), "Rainfall_mm": float(raw["Rainfall_mm"]),
        "Production_tonnes": float(raw["Production_tonnes"]),
        "Yield_tonnes_per_ha": float(raw["Yield_tonnes_per_ha"]),
        "Normal_Rainfall_mm": _opt(raw, "Normal_Rainfall_mm"),
        "Rainfall_Departure_pct": _opt(raw, "Rainfall_Departure_pct"),
    }


class DataStore:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path
        self.records_by_crop: Dict[str, List[dict]] = {}
        self.configs: Dict[str, dict] = {}
        self.metrics: Dict[str, dict] = {}
        self.sim_history: Dict[str, Deque[dict]] = defaultdict(lambda: deque(maxlen=200))
        self.districts_by_crop: Dict[str, List[tuple]] = {}
        self.reference: List[dict] = []
        self.load()
        self.load_reference()

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
        self.districts_by_crop = {
            crop: sorted({(r["State"], r["District"]) for r in recs})
            for crop, recs in self.records_by_crop.items()
        }
        print(f"[data] loaded {len(rows)} rows, {len(self.configs)} crops")

    def district_averages(self, crop: str) -> List[dict]:
        """Area-weighted mean yield (sum production / sum area) per district, over all years."""
        acc: Dict[tuple, list] = {}
        for r in self.records_by_crop.get(crop, []):
            a = acc.setdefault((r["State"], r["District"]), [0.0, 0.0, set()])
            a[0] += r["Production_tonnes"]
            a[1] += r["Area_ha"]
            a[2].add(r["Year"])
        return [
            {"state": st, "district": d, "avg_yield": round(p / a, 4), "n_years": len(yrs)}
            for (st, d), (p, a, yrs) in sorted(acc.items()) if a > 0
        ]

    def load_reference(self) -> None:
        """All-India crop-wise area/production/yield (2021-26). Optional file."""
        if not REFERENCE_FILE.exists():
            return
        with open(REFERENCE_FILE, newline="", encoding="utf-8-sig") as f:
            self.reference = list(csv.DictReader(f))

    @property
    def crops(self) -> List[str]:
        return sorted(self.configs)
