"""Fit triangular membership functions from a crop's own historical data."""
from __future__ import annotations

from typing import Dict, List, Sequence


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


def fit_crop_config(records: Sequence[dict]) -> dict:
    return {
        "area_mf_ha": build_mf_params([r["Area_ha"] for r in records]),
        "rainfall_mf_mm": build_mf_params([r["Rainfall_mm"] for r in records]),
        "yield_mf_t_ha": build_mf_params([r["Yield_tonnes_per_ha"] for r in records]),
        "n_records": len(records),
    }
