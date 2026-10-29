"""FastAPI app: serves the analysis API and (in Docker) the built React app."""

from __future__ import annotations

import gzip
import json
import os
from datetime import date, datetime, time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis as an

DATA_FILE = Path(os.environ.get("DATA_FILE", Path(__file__).resolve().parents[1] / "data" / "wind_jan2026.json.gz"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))

# Purchase decisions made during January 2026 cover delivery days 2 Jan .. 1 Feb.
EVAL_START = date(2026, 1, 2)
EVAL_END = date(2026, 2, 1)

app = FastAPI(title="Windcast API", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)

Mode = Literal["horizon", "dayahead"]


@lru_cache(maxsize=1)
def dataset() -> an.Dataset:
    with gzip.open(DATA_FILE, "rt") as fh:
        return an.Dataset.from_payload(json.load(fh))


def local_day_start(d: date) -> datetime:
    return datetime.combine(d, time(0), an.LONDON)


def parse_cutoff(value: str) -> time:
    try:
        return time.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(422, f"cutoff must be HH:MM, got {value!r}") from exc


def eval_window() -> tuple[datetime, datetime]:
    return local_day_start(EVAL_START), local_day_start(EVAL_END + timedelta(days=1))


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/meta")
def meta() -> dict:
    ds = dataset()
    first, last = ds.target_range
    return {
        "fetchedAt": ds.fetched_at,
        "firstTarget": an.fmt_ts(first),
        "lastTarget": an.fmt_ts(last),
        "evalStart": EVAL_START.isoformat(),
        "evalEnd": EVAL_END.isoformat(),
        "runs": len(ds.runs),
        "maxHorizonH": an.MAX_HORIZON_H,
    }


@app.get("/api/series")
def series(
    start: date = Query(..., description="First UK delivery day (inclusive)"),
    end: date = Query(..., description="Last UK delivery day (inclusive)"),
    mode: Mode = "dayahead",
    horizon: float = Query(4, ge=0, le=an.MAX_HORIZON_H),
    cutoff: str = "10:00",
) -> dict:
    """Actuals plus the forecast that was available at decision time."""
    if end < start:
        raise HTTPException(422, "end must not be before start")
    if (end - start).days > 40:
        raise HTTPException(422, "window too large (max 40 days)")
    ds = dataset()
    cutoff_t = parse_cutoff(cutoff)
    lo, hi = local_day_start(start), local_day_start(end + timedelta(days=1))
    pairs = an.select_forecasts(ds, lo, hi, mode, horizon, cutoff_t)

    # Uncertainty band from the error distribution over the whole evaluation
    # month for the same selection rule (in-sample; see README).
    f, a = an._arrays(an.select_forecasts(ds, *eval_window(), mode, horizon, cutoff_t))
    stats = an.error_stats(f, a)

    return {
        "actuals": [
            {"t": an.fmt_ts(t), "mw": mw} for t, mw in sorted(ds.actuals.items()) if lo <= t < hi
        ],
        "forecasts": [
            {
                "t": an.fmt_ts(p.target),
                "mw": p.forecast,
                "publishTime": an.fmt_ts(p.published),
                "horizonH": round(p.horizon_h, 2),
                # Under-forecast is error < 0, so actual ≈ forecast - error.
                "low": max(0.0, p.forecast - stats["errP90"]) if stats["n"] else None,
                "high": p.forecast - stats["errP10"] if stats["n"] else None,
            }
            for p in pairs
        ],
        "summary": an.error_stats(*an._arrays(pairs)),
    }


@app.get("/api/metrics")
def metrics(
    mode: Mode = "dayahead",
    horizon: float = Query(4, ge=0, le=an.MAX_HORIZON_H),
    cutoff: str = "10:00",
) -> dict:
    """Error statistics over the full evaluation window for one selection rule."""
    ds = dataset()
    pairs = an.select_forecasts(ds, *eval_window(), mode, horizon, parse_cutoff(cutoff))
    return an.evaluate(pairs)


@app.get("/api/horizon-curve")
def horizon_curve() -> list[dict]:
    return _horizon_curve()


@lru_cache(maxsize=1)
def _horizon_curve() -> list[dict]:
    horizons = [0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 30, 36, 42, 48]
    return an.horizon_curve(dataset(), *eval_window(), horizons)


@app.get("/api/evolution")
def evolution(day: date) -> dict:
    """Every forecast run for one delivery day, to show how the forecast converged."""
    ds = dataset()
    lo = local_day_start(day)
    hi = local_day_start(day + timedelta(days=1))
    return {
        "runs": an.run_evolution(ds, lo),
        "actuals": [{"t": an.fmt_ts(t), "mw": mw} for t, mw in sorted(ds.actuals.items()) if lo <= t < hi],
    }


# In Docker the API also serves the built frontend; on Vercel the CDN does.
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = (STATIC_DIR / path).resolve()
        if path and candidate.is_file() and STATIC_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
