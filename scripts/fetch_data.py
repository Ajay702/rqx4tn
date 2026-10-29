"""Download the January 2026 snapshot used by the app.

Run from the repo root:  uv run --project backend python scripts/fetch_data.py

Scope: decisions made in January 2026. A day-ahead decision taken on day D-1
concerns delivery day D, so we need actuals for delivery 2 Jan .. 1 Feb and
every forecast run that could have been seen during January (plus a few days
before, so long-horizon forecasts for early-January targets exist).
"""

from __future__ import annotations

import gzip
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.elexon import fetch_actuals, fetch_forecasts  # noqa: E402

UTC = timezone.utc
TARGET_START = datetime(2026, 1, 1, tzinfo=UTC)
TARGET_END = datetime(2026, 2, 2, tzinfo=UTC)
PUBLISH_START = datetime(2025, 12, 28, tzinfo=UTC)
PUBLISH_END = datetime(2026, 2, 2, tzinfo=UTC)
OUT = ROOT / "backend" / "data" / "wind_jan2026.json.gz"


def main() -> None:
    actuals = fetch_actuals(TARGET_START, TARGET_END)
    print(f"actuals: {len(actuals)} half-hours")
    forecasts = fetch_forecasts(PUBLISH_START, PUBLISH_END)
    forecasts = [
        f for f in forecasts if TARGET_START.isoformat()[:10] <= f["startTime"][:10]
    ]
    print(f"forecasts: {len(forecasts)} rows, "
          f"{len({f['publishTime'] for f in forecasts})} runs")
    payload = {
        "source": "Elexon BMRS FUELHH (fuelType=WIND) and WINDFOR streams",
        "fetchedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "actuals": actuals,
        "forecasts": forecasts,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT, "wt") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
