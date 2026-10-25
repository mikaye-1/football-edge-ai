"""Tests for the sync engine: normalization + ingest payloads."""

from __future__ import annotations

import asyncio

import pytest

import sync as sync_module
from sync import normalize_standings, sync_league


def test_normalize_standings_maps_verified_datafc_columns(sample_standings_rows):
    out = normalize_standings(sample_standings_rows, "Bundesliga", "24/25")

    assert len(out) == 2
    top = out[0]
    # Concrete values straight from the datafc contract.
    assert top["league"] == "Bundesliga"
    assert top["season"] == "24/25"
    assert top["team_name"] == "Bayern Munich"
    assert top["team_external_id"] == "2672"
    assert top["position"] == 1
    assert top["matches_played"] == 9
    assert top["wins"] == 8 and top["draws"] == 1 and top["losses"] == 0
    assert top["goals_for"] == 29 and top["goals_against"] == 7
    assert top["goal_diff"] == 22
    assert top["points"] == 25
    assert top["source"] == "datafc"
    assert top["form"] is None


def test_normalize_standings_handles_missing_optional_fields():
    out = normalize_standings(
        [{"team_name": "X", "team_id": 1, "position": 5}], "MLS", "2026"
    )
    assert out == [
        {
            "league": "MLS", "season": "2026", "team_name": "X",
            "team_external_id": "1", "position": 5, "matches_played": 0,
            "wins": 0, "draws": 0, "losses": 0, "goals_for": 0,
            "goals_against": 0, "goal_diff": 0, "points": 0,
            "form": None, "source": "datafc",
        }
    ]


def test_sync_league_posts_success_payload(monkeypatch, sample_standings_rows):
    import services.datafc_service as svc

    monkeypatch.setattr(svc, "resolve_current_season", lambda slug: {"season_id": 63561, "season_name": "24/25", "season_year": 2024})
    monkeypatch.setattr(svc, "get_standings", lambda slug, season_id: sample_standings_rows)

    sent = []

    async def fake_post(payload):
        sent.append(payload)
        return {"ok": True, "inserted": len(payload["standings"])}

    monkeypatch.setattr(sync_module, "post_to_ingest", fake_post)

    result = asyncio.run(sync_module.sync_league("bundesliga"))
    assert result == {"slug": "bundesliga", "status": "success", "records": 2}
    assert len(sent) == 1
    payload = sent[0]
    assert payload["source"] == "datafc"
    assert payload["sync_type"] == "standings"
    assert payload["status"] == "success"
    assert payload["standings"][0]["team_name"] == "Bayern Munich"
    assert payload["started_at"]  # timestamp present


def test_sync_league_failure_records_error_log(monkeypatch):
    import services.datafc_service as svc

    def boom(slug):
        raise RuntimeError("sofascore unreachable")

    monkeypatch.setattr(svc, "resolve_current_season", boom)
    sent = []

    async def fake_post(payload):
        sent.append(payload)
        return {"ok": True}

    monkeypatch.setattr(sync_module, "post_to_ingest", fake_post)

    result = asyncio.run(sync_module.sync_league("la-liga"))
    assert result["status"] == "error"
    assert len(sent) == 1
    log = sent[0]
    assert log["status"] == "error"
    assert log["standings"] == []
    assert "RuntimeError" in log["error_message"]


def test_sync_league_unknown_slug_raises(monkeypatch):
    with pytest.raises(KeyError):
        asyncio.run(sync_league("not-a-league"))
