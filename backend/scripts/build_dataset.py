"""Merge crop production + IMD rainfall into data/crop_yield_fuzzy_dataset.csv.

Inputs (all in backend/data/):
  crop_production.csv                 district-wise Area/Production by year/season/crop (1997-2015)
  rainfall.csv                        IMD subdivision-wise monthly rainfall (1901-2015)
  district_to_subdivision_mapping.csv district -> IMD subdivision
  district_rainfall_normal.csv        IMD district long-period-average rainfall (optional columns)
  all_india_crop_reference.csv        national crop totals 2021-26 (sanity check only)

Method
  * One growing season per crop (SEASON_OF below), so rainfall means one thing per crop.
  * Growing-season rainfall: Kharif = Jun-Sep; Rabi = Oct-Dec (sowing year) + Jan-Feb (next year);
    Whole Year = annual.
  * Yield (t/ha) = Production / Area.  Years 1997-2014 only (2015 is a partial year).
  * Rows with Area < MIN_AREA_HA, zero/missing production, or yield outside Q1-3*IQR..Q3+3*IQR
    (per crop) are dropped.
Run:  python scripts/build_dataset.py
"""
from __future__ import annotations

import csv
import difflib
import re
from collections import defaultdict
from pathlib import Path
from statistics import median

DATA = Path(__file__).resolve().parent.parent / "data"

# crop -> the one season we model it in.  Only crops whose Production is in tonnes.
SEASON_OF = {
    "Rice": "Kharif", "Maize": "Kharif", "Jowar": "Kharif", "Bajra": "Kharif",
    "Groundnut": "Kharif", "Soyabean": "Kharif", "Arhar/Tur": "Kharif",
    "Wheat": "Rabi", "Gram": "Rabi", "Rapeseed &Mustard": "Rabi", "Barley": "Rabi",
    "Sugarcane": "Whole Year",
}
DISPLAY = {"Rapeseed &Mustard": "Rapeseed & Mustard", "Arhar/Tur": "Arhar (Tur)"}
# how each crop is named / seasoned in all_india_crop_reference.csv (used for the sanity check only)
REF_KEY = {"Arhar/Tur": ("tur", "kharif"), "Rapeseed &Mustard": ("rapeseed & mustard", "rabi"),
           "Soyabean": ("soybean", "kharif"), "Sugarcane": ("sugarcane", "total")}
YEARS = range(1997, 2015)
MIN_AREA_HA = 50
OUT_COLS = ["State", "District", "Subdivision", "Year", "Season", "Crop", "Area_ha", "Rainfall_mm",
            "Production_tonnes", "Yield_tonnes_per_ha", "Normal_Rainfall_mm", "Rainfall_Departure_pct"]


def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper().replace("AND", "&").replace("&", ""))


def quantile(sorted_vals, p):
    i = p * (len(sorted_vals) - 1)
    lo, hi = int(i), min(int(i) + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)


def load_rainfall():
    rain = {}
    with open(DATA / "rainfall.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rain[(r["SUBDIVISION"].strip().upper(), int(r["YEAR"]))] = r
    return rain


def season_rainfall(rain, sub, year, season):
    r = rain.get((sub.upper(), year))
    if r is None:
        return None
    if season == "Kharif":
        return num(r["JUN-SEP"])
    if season == "Whole Year":
        return num(r["ANNUAL"])
    nxt = rain.get((sub.upper(), year + 1))          # Rabi: Oct-Dec + following Jan-Feb
    a, b = num(r["OCT-DEC"]), num(nxt["JAN-FEB"]) if nxt else None
    return None if a is None or b is None else a + b


class Normals:
    """Fuzzy-match Kaggle (state, district) names to IMD's district normals file."""

    def __init__(self):
        self.by_state = defaultdict(dict)
        with open(DATA / "district_rainfall_normal.csv", newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.by_state[norm(r["STATE_UT_NAME"])][norm(r["DISTRICT"])] = r
        self.cache = {}

    def row(self, state, district):
        key = (state, district)
        if key in self.cache:
            return self.cache[key]
        hit = None
        sn = norm(state)
        states = difflib.get_close_matches(sn, list(self.by_state), n=2, cutoff=0.6)
        best = 0.0
        for st in states:
            names = self.by_state[st]
            m = difflib.get_close_matches(norm(district), list(names), n=1, cutoff=0.8)
            if m:
                sc = difflib.SequenceMatcher(None, norm(district), m[0]).ratio()
                if sc > best:
                    best, hit = sc, names[m[0]]
        self.cache[key] = hit
        return hit

    def seasonal(self, state, district, season):
        r = self.row(state, district)
        if not r:
            return None
        if season == "Kharif":
            return num(r["Jun-Sep"])
        if season == "Whole Year":
            return num(r["ANNUAL"])
        a, b = num(r["Oct-Dec"]), num(r["Jan-Feb"])
        return None if a is None or b is None else a + b


def main():
    mapping = {}
    with open(DATA / "district_to_subdivision_mapping.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            mapping[(r["State"].strip(), r["District"].strip())] = r["Subdivision"].strip()
    rain = load_rainfall()
    normals = Normals()

    # 1) aggregate raw crop rows (a few district/year/crop keys repeat)
    agg = defaultdict(lambda: [0.0, 0.0])
    stats = defaultdict(int)
    with open(DATA / "crop_production.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            crop, season = r["Crop"].strip(), r["Season"].strip()
            if SEASON_OF.get(crop) != season:
                continue
            year = int(r["Crop_Year"])
            if year not in YEARS:
                continue
            area, prod = num(r["Area"]), num(r["Production"])
            if prod is None or area is None:
                stats["missing_production"] += 1
                continue
            k = (r["State_Name"].strip(), r["District_Name"].strip(), year, season, crop)
            agg[k][0] += area
            agg[k][1] += prod

    # 2) join rainfall, derive yield
    rows = []
    for (state, district, year, season, crop), (area, prod) in agg.items():
        if area < MIN_AREA_HA or prod <= 0:
            stats["tiny_or_zero"] += 1
            continue
        sub = mapping.get((state, district))
        if not sub:
            stats["no_mapping"] += 1
            continue
        rf = season_rainfall(rain, sub, year, season)
        if rf is None:
            stats["no_rainfall"] += 1
            continue
        normal = normals.seasonal(state, district, season)
        dep = round((rf - normal) / normal * 100, 1) if normal else ""
        rows.append({
            "State": state, "District": district.title(), "Subdivision": sub, "Year": year,
            "Season": season, "Crop": DISPLAY.get(crop, crop), "Area_ha": round(area, 1),
            "Rainfall_mm": round(rf, 1), "Production_tonnes": round(prod, 1),
            "Yield_tonnes_per_ha": round(prod / area, 4),
            "Normal_Rainfall_mm": round(normal, 1) if normal else "", "Rainfall_Departure_pct": dep,
        })

    # 3) per-crop outlier filter on yield (3 x IQR fences)
    by_crop = defaultdict(list)
    for r in rows:
        by_crop[r["Crop"]].append(r)
    kept = []
    for crop, rs in by_crop.items():
        ys = sorted(r["Yield_tonnes_per_ha"] for r in rs)
        q1, q3 = quantile(ys, 0.25), quantile(ys, 0.75)
        lo, hi = max(0.0, q1 - 3 * (q3 - q1)), q3 + 3 * (q3 - q1)
        good = [r for r in rs if lo <= r["Yield_tonnes_per_ha"] <= hi]
        stats["yield_outliers"] += len(rs) - len(good)
        kept += good
    kept.sort(key=lambda r: (r["Crop"], r["State"], r["District"], r["Year"]))

    with open(DATA / "crop_yield_fuzzy_dataset.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLS)
        w.writeheader()
        w.writerows(kept)

    # ---- report ----
    print(f"wrote {len(kept)} rows -> crop_yield_fuzzy_dataset.csv   dropped: {dict(stats)}")
    with_norm = sum(1 for r in kept if r["Normal_Rainfall_mm"] != "")
    print(f"IMD district normal matched for {with_norm / len(kept):.0%} of rows")
    print(f"{'crop':20s}{'rows':>7s}{'dists':>7s}{'yrs':>5s}{'med t/ha':>10s}{'mean t/ha (97-14)':>19s}{'All-India 21-22':>17s}")
    ref = {}
    with open(DATA / "all_india_crop_reference.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            y = num(r["Yield-2021-22"])
            if y:
                ref[(r["Crop"].strip().lower(), r["Season"].strip().lower())] = y / 1000
    for crop in sorted(by_crop):
        rs = [r for r in kept if r["Crop"] == crop]
        if not rs:
            continue
        tp = sum(r["Production_tonnes"] for r in rs) / sum(r["Area_ha"] for r in rs)
        base = next((k for k, v in DISPLAY.items() if v == crop), crop)
        rname, rseason = REF_KEY.get(base, (base.lower(), SEASON_OF[base].lower()))
        rv = ref.get((rname, rseason))
        print(f"{crop:20s}{len(rs):7d}{len({(r['State'], r['District']) for r in rs}):7d}"
              f"{len({r['Year'] for r in rs}):5d}{median(r['Yield_tonnes_per_ha'] for r in rs):10.2f}"
              f"{tp:19.2f}{(f'{rv:.2f}' if rv else 'n/a'):>17s}")


if __name__ == "__main__":
    main()
