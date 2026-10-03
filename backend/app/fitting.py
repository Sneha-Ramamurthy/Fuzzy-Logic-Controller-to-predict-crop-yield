"""Fit triangular membership functions from a crop's own historical data."""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Sequence

from .fuzzy_engine import AREA_TERM, RAIN_TERM, membership


def percentile(sorted_vals: Sequence[float], p: float) -> float:
    """Linear-interpolated percentile (same as numpy's default)."""
    idx = (p / 100) * (len(sorted_vals) - 1)
    lo, hi = int(idx // 1), int(-(-idx // 1))
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (idx - lo)


def build_mf_params(values: Sequence[float]) -> Dict[str, List[float]]:
    """low=[p0,p0,p50]  medium=[p25,p50,p75]  high=[p50,p100,p100]."""
    s = sorted(values)
    p0, p25, p50, p75, p100 = (percentile(s, p) for p in (0, 25, 50, 75, 100))
    return {
        "low": [p0, p0, p50],
        "medium": [p25, p50, p75],
        "high": [p50, p100, p100],
    }


def learn_rules(records: Sequence[dict], cfg: dict) -> List[List[str]]:
    """Wang-Mendel-style rule learning.

    Each record votes for the (area set, rainfall set) cell where its membership is highest.
    A cell's consequent is the yield set that the cell's mean yield belongs to most.
    Cells with no data keep the neutral consequent "medium".
    """
    cell = defaultdict(list)
    for r in records:
        a = membership(r["Area_ha"], cfg["area_mf_ha"])
        q = membership(r["Rainfall_mm"], cfg["rainfall_mf_mm"])
        cell[(max(a, key=a.get), max(q, key=q.get))].append(r["Yield_tonnes_per_ha"])
    rules = []
    for area_lbl, a_term in AREA_TERM.items():
        for rain_lbl, r_term in RAIN_TERM.items():
            ys = cell.get((a_term, r_term))
            if not ys:
                rules.append([area_lbl, rain_lbl, "medium"])
                continue
            m = membership(sum(ys) / len(ys), cfg["yield_mf_t_ha"])
            rules.append([area_lbl, rain_lbl, max(m, key=m.get)])
    return rules


def fit_crop_config(records: Sequence[dict]) -> dict:
    cfg = {
        "area_mf_ha": build_mf_params([r["Area_ha"] for r in records]),
        "rainfall_mf_mm": build_mf_params([r["Rainfall_mm"] for r in records]),
        "yield_mf_t_ha": build_mf_params([r["Yield_tonnes_per_ha"] for r in records]),
        "n_records": len(records),
    }
    cfg["rules"] = learn_rules(records, cfg)
    return cfg
