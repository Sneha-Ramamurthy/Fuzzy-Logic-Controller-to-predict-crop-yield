import csv
from pathlib import Path

from app.data_store import DATA_DIR, DataStore

REQUIRED = {"State", "District", "Subdivision", "Year", "Season", "Crop", "Area_ha", "Rainfall_mm",
            "Production_tonnes", "Yield_tonnes_per_ha"}


def _rows(name):
    with open(DATA_DIR / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_dataset_schema_and_sanity():
    rows = _rows("crop_yield_fuzzy_dataset.csv")
    assert len(rows) > 10_000
    assert REQUIRED <= set(rows[0])
    for r in rows[:2000]:
        assert float(r["Area_ha"]) > 0 and float(r["Rainfall_mm"]) >= 0
        a, p, y = float(r["Area_ha"]), float(r["Production_tonnes"]), float(r["Yield_tonnes_per_ha"])
        assert abs(p / a - y) < 1e-3 * max(1, y)


def test_every_subdivision_has_rainfall():
    subs = {r["Subdivision"].upper() for r in _rows("crop_yield_fuzzy_dataset.csv")}
    rain = {r["SUBDIVISION"].upper() for r in _rows("rainfall.csv")}
    assert subs <= rain


def test_reference_loaded():
    assert DataStore().reference


def test_simulator_districts_come_from_data():
    store = DataStore()
    for crop in store.crops:
        assert store.districts_by_crop[crop]


def test_learned_rules_cover_all_cells():
    store = DataStore()
    for cfg in store.configs.values():
        assert len(cfg["rules"]) == 9
        assert {r[2] for r in cfg["rules"]} <= {"low", "medium", "high"}


def test_district_averages_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    d = c.get("/api/crops/Rice/district-averages").json()["districts"]
    assert len(d) > 100 and all(x["avg_yield"] > 0 for x in d)
    assert {"Karnataka", "Maharashtra", "Punjab"} <= {x["state"] for x in d}
