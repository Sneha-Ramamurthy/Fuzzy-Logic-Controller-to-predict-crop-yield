from app.fuzzy_engine import predict_yield, triangular
from app.data_store import DataStore


def test_triangular_basics():
    assert triangular(5, 0, 5, 10) == 1
    assert triangular(2.5, 0, 5, 10) == 0.5
    assert triangular(-1, 0, 5, 10) == 0
    assert triangular(0, 0, 0, 10) == 1          # left shoulder
    assert triangular(10, 5, 10, 10) == 1        # right shoulder


def test_prediction_within_yield_range():
    store = DataStore()
    for crop, cfg in store.configs.items():
        y = cfg["yield_mf_t_ha"]
        lo, hi = y["low"][0], y["high"][1]
        mid_area = cfg["area_mf_ha"]["medium"][1]
        mid_rain = cfg["rainfall_mf_mm"]["medium"][1]
        out = predict_yield(mid_area, mid_rain, cfg)
        assert out["predictedYield"] is not None
        assert lo <= out["predictedYield"] <= hi
        assert out["firedRules"]


def test_metrics_computed():
    store = DataStore()
    assert store.metrics and all("FLC" in m for m in store.metrics.values())
