"""
Mamdani fuzzy inference engine for crop-yield prediction -- PURE PYTHON.

Only the standard library is used (no numpy, no scikit-fuzzy), so every step
of the pipeline is visible and explainable:

    1. Fuzzification    : crisp Area / Rainfall -> membership degrees
    2. Rule evaluation  : AND = min(...)  ->  firing strength per rule
    3. Implication      : clip each rule's output set at its firing strength
    4. Aggregation      : union of clipped output sets = max(...)
    5. Defuzzification  : centroid (centre of gravity) -> crisp yield
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

# Default expert rule base: (area label, rainfall label, yield label).
# fitting.fit_crop_config replaces it per crop with a rule base learned from the data.
RULES: List[Tuple[str, str, str]] = [
    ("small", "low", "low"),
    ("small", "moderate", "medium"),
    ("small", "high", "high"),
    ("medium", "low", "low"),
    ("medium", "moderate", "medium"),
    ("medium", "high", "high"),
    ("large", "low", "medium"),
    ("large", "moderate", "high"),
    ("large", "high", "high"),
]

# Area terms are small/medium/large, rainfall terms are low/moderate/high.
# Each maps onto the generic low/medium/high membership curves stored per crop.
AREA_TERM = {"small": "low", "medium": "medium", "large": "high"}
RAIN_TERM = {"low": "low", "moderate": "medium", "high": "high"}

FIRING_THRESHOLD = 0.001
UNIVERSE_POINTS = 400


def triangular(x: float, a: float, b: float, c: float) -> float:
    """Triangular membership function with feet a, c and peak b.

    Handles shoulder shapes (a == b or b == c) used for the low / high sets.
    """
    if x <= a or x >= c:
        return 1.0 if x == b else 0.0
    if x == b:
        return 1.0
    if x < b:
        return (x - a) / ((b - a) or 1.0)
    return (c - x) / ((c - b) or 1.0)


def membership(x: float, mf: Dict[str, Sequence[float]]) -> Dict[str, float]:
    """Degrees of membership of x in the low / medium / high sets of `mf`."""
    return {name: triangular(x, *mf[name]) for name in ("low", "medium", "high")}


def predict_yield(area: float, rainfall: float, crop_config: dict) -> dict:
    """Run one full Mamdani inference.

    Args:
        area:        field area in hectares
        rainfall:    rainfall in mm
        crop_config: {"area_mf_ha", "rainfall_mf_mm", "yield_mf_t_ha"}, each a
                     dict {"low": [a,b,c], "medium": [a,b,c], "high": [a,b,c]}

    Returns:
        dict with predictedYield (None if no rule fired), firedRules,
        areaMembership and rainMembership.
    """
    area_mf = crop_config["area_mf_ha"]
    rain_mf = crop_config["rainfall_mf_mm"]
    yield_mf = crop_config["yield_mf_t_ha"]
    # per-crop rule base learned from data (fitting.learn_rules); falls back to the expert table
    rules = [tuple(r) for r in crop_config.get("rules") or RULES]

    # 1. Fuzzification
    area_deg = membership(area, area_mf)
    rain_deg = membership(rainfall, rain_mf)

    # Output universe of discourse, discretised
    bounds = [v for name in ("low", "medium", "high") for v in yield_mf[name]]
    y_min, y_max = min(bounds), max(bounds)
    n = UNIVERSE_POINTS
    step = (y_max - y_min) / (n - 1)
    universe = [y_min + i * step for i in range(n)]
    aggregated = [0.0] * n
    fired_rules = []

    for area_lbl, rain_lbl, yield_lbl in rules:
        # 2. Rule evaluation: AND -> min
        strength = min(area_deg[AREA_TERM[area_lbl]], rain_deg[RAIN_TERM[rain_lbl]])
        if strength <= FIRING_THRESHOLD:
            continue

        # 3 + 4. Implication (clip) and aggregation (max)
        a, b, c = yield_mf[yield_lbl]
        for i, y in enumerate(universe):
            clipped = min(strength, triangular(y, a, b, c))
            if clipped > aggregated[i]:
                aggregated[i] = clipped

        fired_rules.append({
            "rule": f"Area={area_lbl} AND Rainfall={rain_lbl} -> Yield={yield_lbl}",
            "strength": round(strength, 3),
        })

    # 5. Defuzzification: centroid
    num = sum(y * m for y, m in zip(universe, aggregated))
    den = sum(aggregated)
    predicted: Optional[float] = round(num / den, 3) if den > 0 else None

    return {
        "predictedYield": predicted,
        "firedRules": fired_rules,
        "areaMembership": {
            "small": area_deg["low"], "medium": area_deg["medium"], "large": area_deg["high"],
        },
        "rainMembership": {
            "low": rain_deg["low"], "moderate": rain_deg["medium"], "high": rain_deg["high"],
        },
    }
