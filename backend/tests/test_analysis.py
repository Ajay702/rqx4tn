from datetime import datetime, time, timezone

import numpy as np
import pytest

from app import analysis as an

UTC = timezone.utc


def ts(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


@pytest.fixture
def ds() -> an.Dataset:
    payload = {
        "actuals": [
            {"startTime": "2026-01-10T12:00:00Z", "generation": 1000},
            {"startTime": "2026-01-10T12:30:00Z", "generation": 1100},
            {"startTime": "2026-01-10T13:00:00Z", "generation": 1200},
        ],
        "forecasts": [
            # Two runs for 12:00, plus a hindcast row that must be ignored.
            {"publishTime": "2026-01-09T08:30:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 900},
            {"publishTime": "2026-01-10T09:30:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 1050},
            {"publishTime": "2026-01-10T14:30:00Z", "startTime": "2026-01-10T12:00:00Z", "generation": 1000},
            {"publishTime": "2026-01-09T08:30:00Z", "startTime": "2026-01-10T13:00:00Z", "generation": 1300},
        ],
    }
    return an.Dataset.from_payload(payload)


def test_hindcast_rows_dropped(ds):
    pubs, _ = ds.forecasts[ts("2026-01-10T12:00:00")]
    assert all(p <= ts("2026-01-10T12:00:00") for p in pubs)


def test_horizon_mode_picks_latest_run_before_cutoff(ds):
    window = (ts("2026-01-10T00:00:00"), ts("2026-01-11T00:00:00"))
    short = an.select_forecasts(ds, *window, mode="horizon", horizon_h=2)
    assert [(p.forecast, p.actual) for p in short] == [(1050, 1000), (1300, 1200)]

    long = an.select_forecasts(ds, *window, mode="horizon", horizon_h=4)
    assert long[0].forecast == 900  # the 09:30 run is only 2.5h ahead


def test_dayahead_mode_uses_previous_day_cutoff(ds):
    window = (ts("2026-01-10T00:00:00"), ts("2026-01-11T00:00:00"))
    # Cutoff 10:00 London on 9 Jan (GMT == UTC in January) -> 08:30 run only.
    pairs = an.select_forecasts(ds, *window, mode="dayahead", cutoff_local=time(10, 0))
    assert [p.forecast for p in pairs] == [900, 1300]
    # Cutoff before the 08:30 run -> nothing was available.
    assert an.select_forecasts(ds, *window, mode="dayahead", cutoff_local=time(8, 0)) == []


def test_decision_cutoff_handles_bst():
    # 1 July delivery: London is UTC+1, so 10:00 local on 30 June is 09:00 UTC.
    cutoff = an.decision_cutoff(ts("2026-07-01T05:00:00"), "dayahead", 0, time(10, 0))
    assert cutoff == ts("2026-06-30T09:00:00")


def test_error_stats():
    s = an.error_stats(np.array([110.0, 90.0, 130.0]), np.array([100.0, 100.0, 100.0]))
    assert s["n"] == 3
    assert s["mae"] == pytest.approx(50 / 3)
    assert s["bias"] == pytest.approx(10.0)
    assert s["rmse"] == pytest.approx(np.sqrt((100 + 100 + 900) / 3))
    assert an.error_stats(np.array([]), np.array([])) == {"n": 0}


def test_evaluate_groups_by_local_hour(ds):
    pairs = an.select_forecasts(ds, ts("2026-01-10T00:00:00"), ts("2026-01-11T00:00:00"), "horizon", 2)
    res = an.evaluate(pairs)
    assert [h["hour"] for h in res["byHour"]] == [12, 13]
    assert sum(b["count"] for b in res["histogram"]) == 2
