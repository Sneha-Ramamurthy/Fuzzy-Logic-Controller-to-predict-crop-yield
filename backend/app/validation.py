"""Time-aware validation (70/30 split by year) vs two baselines. Pure Python."""
from __future__ import annotations

import math
from typing import List, Optional, Sequence

from .fuzzy_engine import predict_yield


def _mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def _least_squares(X: List[List[float]], y: List[float]) -> List[float]:
    """Solve the normal equations (X'X) b = X'y by Gaussian elimination."""
    k = len(X[0])
    xtx = [[sum(row[i] * row[j] for row in X) for j in range(k)] for i in range(k)]
    xty = [sum(row[i] * yy for row, yy in zip(X, y)) for i in range(k)]
    m = [xtx[i] + [xty[i]] for i in range(k)]
    for i in range(k):
        piv = max(range(i, k), key=lambda r: abs(m[r][i]))
        m[i], m[piv] = m[piv], m[i]
        if abs(m[i][i]) < 1e-12:
            continue
        for r in range(i + 1, k):
            f = m[r][i] / m[i][i]
            for c in range(i, k + 1):
                m[r][c] -= f * m[i][c]
    beta = [0.0] * k
    for i in range(k - 1, -1, -1):
        s = m[i][k] - sum(m[i][j] * beta[j] for j in range(i + 1, k))
        beta[i] = s / m[i][i] if abs(m[i][i]) > 1e-12 else 0.0
    return beta


def validate_crop(records: Sequence[dict], crop_config: dict) -> Optional[dict]:
    years = sorted({r["Year"] for r in records})
    split = int(len(years) * 0.7)
    train_years, test_years = set(years[:split]), set(years[split:])
    train = [r for r in records if r["Year"] in train_years]
    test = [r for r in records if r["Year"] in test_years]
    if not train or not test:
        return None

    preds, actuals, samples = [], [], []
    for r in test:
        p = predict_yield(r["Area_ha"], r["Rainfall_mm"], crop_config)["predictedYield"]
        if p is None:
            continue
        preds.append(p)
        actuals.append(r["Yield_tonnes_per_ha"])
        samples.append({
            "Year": r["Year"], "District": r["District"],
            "Area_ha": r["Area_ha"], "Rainfall_mm": r["Rainfall_mm"],
            "Actual_Yield": round(r["Yield_tonnes_per_ha"], 3),
            "Predicted_Yield": round(p, 3),
        })
    if not preds:
        return None

    mae = _mean([abs(p - a) for p, a in zip(preds, actuals)])
    rmse = math.sqrt(_mean([(p - a) ** 2 for p, a in zip(preds, actuals)]))
    mape = _mean([abs((p - a) / a) for p, a in zip(preds, actuals) if a]) * 100
    a_mean = _mean(actuals)
    ss_res = sum((a - p) ** 2 for p, a in zip(preds, actuals))
    ss_tot = sum((a - a_mean) ** 2 for a in actuals)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else None

    # Baseline 1: historical mean of the training period
    hist = _mean([r["Yield_tonnes_per_ha"] for r in train])
    b_mae = _mean([abs(a - hist) for a in actuals])
    b_rmse = math.sqrt(_mean([(a - hist) ** 2 for a in actuals]))

    # Baseline 2: linear regression on Area + Rainfall
    beta = _least_squares(
        [[1.0, r["Area_ha"], r["Rainfall_mm"]] for r in train],
        [r["Yield_tonnes_per_ha"] for r in train],
    )
    lr = [beta[0] + beta[1] * r["Area_ha"] + beta[2] * r["Rainfall_mm"] for r in test]
    ty = [r["Yield_tonnes_per_ha"] for r in test]
    lr_mae = _mean([abs(p - a) for p, a in zip(lr, ty)])
    lr_rmse = math.sqrt(_mean([(p - a) ** 2 for p, a in zip(lr, ty)]))

    return {
        "n_train": len(train), "n_test": len(preds),
        "train_years": f"{years[0]}-{years[split - 1]}",
        "test_years": f"{years[split]}-{years[-1]}",
        "FLC": {"MAE": round(mae, 3), "RMSE": round(rmse, 3),
                "MAPE_pct": round(mape, 1), "R2": None if r2 is None else round(r2, 3)},
        "Baseline_HistMean": {"MAE": round(b_mae, 3), "RMSE": round(b_rmse, 3)},
        "Baseline_LinearRegression": {"MAE": round(lr_mae, 3), "RMSE": round(lr_rmse, 3)},
        "samples": samples[:25],
    }
