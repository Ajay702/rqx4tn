"""Thin client for the Elexon BMRS Insights API (FUELHH + WINDFOR streams)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
TIMEOUT = httpx.Timeout(60.0)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def fetch_actuals(start: datetime, end: datetime) -> list[dict]:
    """Half-hourly actual WIND generation (MW) with startTime in [start, end)."""
    params = {
        "settlementDateFrom": (start - timedelta(days=1)).date().isoformat(),
        "settlementDateTo": end.date().isoformat(),
        "fuelType": "WIND",
    }
    resp = httpx.get(f"{BASE_URL}/FUELHH/stream", params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    rows = []
    for r in resp.json():
        t = datetime.fromisoformat(r["startTime"].replace("Z", "+00:00"))
        if start <= t < end and r.get("generation") is not None:
            rows.append({"startTime": _iso(t), "generation": float(r["generation"])})
    # The stream can contain re-published duplicates; keep the last one per startTime.
    dedup = {r["startTime"]: r for r in rows}
    return sorted(dedup.values(), key=lambda r: r["startTime"])


def fetch_forecasts(
    publish_from: datetime, publish_to: datetime, chunk_days: int = 7
) -> list[dict]:
    """Every WINDFOR forecast run published in [publish_from, publish_to)."""
    rows: list[dict] = []
    cursor = publish_from
    with httpx.Client(timeout=TIMEOUT) as client:
        while cursor < publish_to:
            chunk_end = min(cursor + timedelta(days=chunk_days), publish_to)
            resp = client.get(
                f"{BASE_URL}/WINDFOR/stream",
                params={
                    "publishDateTimeFrom": _iso(cursor),
                    "publishDateTimeTo": _iso(chunk_end),
                },
            )
            resp.raise_for_status()
            for r in resp.json():
                if r.get("generation") is None:
                    continue
                rows.append(
                    {
                        "publishTime": r["publishTime"],
                        "startTime": r["startTime"],
                        "generation": float(r["generation"]),
                    }
                )
            cursor = chunk_end
    dedup = {(r["publishTime"], r["startTime"]): r for r in rows}
    return sorted(dedup.values(), key=lambda r: (r["publishTime"], r["startTime"]))
