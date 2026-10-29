"""Forecast selection and error statistics.

All times are UTC ``datetime``s internally. Two ways of choosing "the forecast
a trader would have seen" for a target half-hour T are supported:

* horizon mode   – latest run published at or before ``T - horizon``.
* day-ahead mode – latest run published at or before the decision cutoff on the
  day before T's delivery day (UK local time), i.e. what was on screen when the
  day-ahead purchase had to be made.

Forecasts are hourly while actuals are half-hourly, so errors are computed only
at the target times where both exist (forecast startTime == actual startTime).
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np

UTC = timezone.utc
LONDON = ZoneInfo("Europe/London")
MAX_HORIZON_H = 72


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)


def fmt_ts(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Dataset:
    actuals: dict[datetime, float]
    # target startTime -> runs sorted by publishTime: (publishTimes, generations)
    forecasts: dict[datetime, tuple[list[datetime], list[float]]]
    fetched_at: str = ""
    runs: list[datetime] = field(default_factory=list)

    @classmethod
    def from_payload(cls, payload: dict) -> "Dataset":
        actuals = {parse_ts(r["startTime"]): r["generation"] for r in payload["actuals"]}
        by_target: dict[datetime, list[tuple[datetime, float]]] = {}
        runs = set()
        for r in payload["forecasts"]:
            pub, tgt = parse_ts(r["publishTime"]), parse_ts(r["startTime"])
            horizon_h = (tgt - pub).total_seconds() / 3600
            # Runs include a few hours of hindcast (negative horizon); those are
            # not forecasts anyone could have acted on, so drop them.
            if 0 <= horizon_h <= MAX_HORIZON_H:
                by_target.setdefault(tgt, []).append((pub, r["generation"]))
                runs.add(pub)
        forecasts = {}
        for tgt, items in by_target.items():
            items.sort()
            forecasts[tgt] = ([p for p, _ in items], [g for _, g in items])
        return cls(actuals, forecasts, payload.get("fetchedAt", ""), sorted(runs))

    @property
    def target_range(self) -> tuple[datetime, datetime]:
        times = sorted(self.actuals)
        return times[0], times[-1]


def latest_before(ds: Dataset, target: datetime, cutoff: datetime) -> tuple[datetime, float] | None:
    """Most recent forecast for ``target`` published at or before ``cutoff``."""
    entry = ds.forecasts.get(target)
    if entry is None:
        return None
    pubs, gens = entry
    i = bisect.bisect_right(pubs, cutoff) - 1
    if i < 0:
        return None
    return pubs[i], gens[i]


def decision_cutoff(target: datetime, mode: str, horizon_h: float, cutoff_local: time) -> datetime:
    if mode == "horizon":
        return target - timedelta(hours=horizon_h)
    if mode == "dayahead":
        delivery_day = target.astimezone(LONDON).date()
        decision_day = delivery_day - timedelta(days=1)
        return datetime.combine(decision_day, cutoff_local, LONDON).astimezone(UTC)
    raise ValueError(f"unknown mode {mode!r}")


@dataclass
class Pair:
    target: datetime
    published: datetime
    forecast: float
    actual: float | None

    @property
    def horizon_h(self) -> float:
        return (self.target - self.published).total_seconds() / 3600


def select_forecasts(
    ds: Dataset,
    start: datetime,
    end: datetime,
    mode: str = "horizon",
    horizon_h: float = 4,
    cutoff_local: time = time(10, 0),
) -> list[Pair]:
    pairs = []
    for target in sorted(t for t in ds.forecasts if start <= t < end):
        cutoff = decision_cutoff(target, mode, horizon_h, cutoff_local)
        hit = latest_before(ds, target, cutoff)
        if hit is not None:
            pairs.append(Pair(target, hit[0], hit[1], ds.actuals.get(target)))
    return pairs


def error_stats(forecast: np.ndarray, actual: np.ndarray) -> dict:
    """Summary statistics of error = forecast - actual (MW)."""
    if len(forecast) == 0:
        return {"n": 0}
    err = forecast - actual
    abs_err = np.abs(err)
    mean_actual = float(actual.mean())
    corr = float(np.corrcoef(forecast, actual)[0, 1]) if len(forecast) > 1 else None
    return {
        "n": int(len(err)),
        "mae": float(abs_err.mean()),
        "rmse": float(np.sqrt((err**2).mean())),
        "bias": float(err.mean()),
        "nmae": float(abs_err.mean() / mean_actual) if mean_actual else None,
        "medianAe": float(np.median(abs_err)),
        "p90Ae": float(np.percentile(abs_err, 90)),
        "p99Ae": float(np.percentile(abs_err, 99)),
        "maxAe": float(abs_err.max()),
        # Signed error quantiles: forecast - P90 err is a level actual wind
        # exceeded ~90% of the time ("wind you can count on").
        "errP10": float(np.percentile(err, 10)),
        "errP90": float(np.percentile(err, 90)),
        "correlation": corr,
        "meanActual": mean_actual,
        "meanForecast": float(forecast.mean()),
    }


def _arrays(pairs: list[Pair]) -> tuple[np.ndarray, np.ndarray]:
    matched = [p for p in pairs if p.actual is not None]
    return (
        np.array([p.forecast for p in matched], dtype=float),
        np.array([p.actual for p in matched], dtype=float),
    )


def histogram(err: np.ndarray, bin_mw: int = 500) -> list[dict]:
    if len(err) == 0:
        return []
    lo = np.floor(err.min() / bin_mw) * bin_mw
    hi = np.ceil(err.max() / bin_mw) * bin_mw + bin_mw
    counts, edges = np.histogram(err, bins=np.arange(lo, hi + 1, bin_mw))
    return [{"from": float(a), "to": float(b), "count": int(c)} for a, b, c in zip(edges, edges[1:], counts)]


def evaluate(pairs: list[Pair]) -> dict:
    f, a = _arrays(pairs)
    matched = [p for p in pairs if p.actual is not None]
    by_hour: dict[int, list[float]] = {}
    by_day: dict[str, list[float]] = {}
    for p in matched:
        local = p.target.astimezone(LONDON)
        by_hour.setdefault(local.hour, []).append(p.forecast - p.actual)
        by_day.setdefault(local.date().isoformat(), []).append(p.forecast - p.actual)
    return {
        "summary": error_stats(f, a),
        "histogram": histogram(f - a),
        "byHour": [
            {"hour": h, "mae": float(np.mean(np.abs(v))), "bias": float(np.mean(v)), "n": len(v)}
            for h, v in sorted(by_hour.items())
        ],
        "byDay": [
            {"date": d, "mae": float(np.mean(np.abs(v))), "bias": float(np.mean(v)), "n": len(v)}
            for d, v in sorted(by_day.items())
        ],
        "meanHorizonH": float(np.mean([p.horizon_h for p in matched])) if matched else None,
    }


def horizon_curve(ds: Dataset, start: datetime, end: datetime, horizons: list[float]) -> list[dict]:
    out = []
    for h in horizons:
        f, a = _arrays(select_forecasts(ds, start, end, "horizon", h))
        s = error_stats(f, a)
        out.append({"horizonH": h, **{k: s.get(k) for k in ("n", "mae", "rmse", "bias", "p90Ae")}})
    return out


def run_evolution(ds: Dataset, day: datetime, lookback_h: int = MAX_HORIZON_H) -> list[dict]:
    """All runs that forecast UK delivery day ``day`` (local midnight, tz-aware)."""
    start = day.astimezone(UTC)
    end = (day + timedelta(days=1)).astimezone(UTC)
    runs: dict[datetime, list[dict]] = {}
    for target in sorted(t for t in ds.forecasts if start <= t < end):
        pubs, gens = ds.forecasts[target]
        for p, g in zip(pubs, gens):
            if p >= start - timedelta(hours=lookback_h):
                runs.setdefault(p, []).append({"t": fmt_ts(target), "mw": g})
    return [{"publishTime": fmt_ts(p), "points": pts} for p, pts in sorted(runs.items())]
