"""Shared fixtures: run pytest with `python -m pytest tests/` from football-api/."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import config  # noqa: E402


@pytest.fixture(autouse=True)
def _no_ingest_env(monkeypatch):
    """Keep tests hermetic: no real ingest URL/secret, no admin token."""
    monkeypatch.setattr(config, "INGEST_URL", "", raising=False)
    monkeypatch.setattr(config, "INGEST_SECRET", "", raising=False)
    monkeypatch.setattr(config, "ADMIN_TOKEN", "", raising=False)


@pytest.fixture
def sample_standings_rows():
    """Rows exactly as datafc 2.9.0 sofascore standings_data returns them."""
    return [
        {
            "country": "Germany", "tournament": "Bundesliga",
            "tournament_id": 35, "season_id": 63561, "category": "Total",
            "team_name": "Bayern Munich", "team_id": 2672, "position": 1,
            "matches": 9, "wins": 8, "draws": 1, "losses": 0,
            "scores_for": 29, "scores_against": 7, "points": 25,
        },
        {
            "country": "Germany", "tournament": "Bundesliga",
            "tournament_id": 35, "season_id": 63561, "category": "Total",
            "team_name": "Bayer Leverkusen", "team_id": 2681, "position": 2,
            "matches": 9, "wins": 6, "draws": 2, "losses": 1,
            "scores_for": 20, "scores_against": 12, "points": 20,
        },
    ]
