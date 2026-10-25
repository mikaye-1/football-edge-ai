"""Route tests with the datafc layer mocked — no live network calls."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


def test_health_reports_unconfigured_ingest(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["ingest_configured"] is False
    assert body["leagues"] == 12


def test_leagues_lists_supported_slugs(client):
    r = client.get("/leagues")
    assert r.status_code == 200
    slugs = {row["slug"] for row in r.json()}
    assert {"bundesliga", "premier-league", "la-liga", "mls"} <= slugs


def test_sync_run_requires_ingest_config(client):
    r = client.post("/sync/run")
    assert r.status_code == 503


def test_sync_run_rejects_bad_admin_token(client, monkeypatch):
    from services import config

    monkeypatch.setattr(config, "INGEST_URL", "https://example.com/ingest", raising=False)
    monkeypatch.setattr(config, "INGEST_SECRET", "s3cret", raising=False)
    monkeypatch.setattr(config, "ADMIN_TOKEN", "topsecret", raising=False)

    r = client.post("/sync/run", headers={"x-admin-token": "wrong"})
    assert r.status_code == 401


def test_sync_run_returns_summary(client, monkeypatch):
    from services import config

    monkeypatch.setattr(config, "INGEST_URL", "https://example.com/ingest", raising=False)
    monkeypatch.setattr(config, "INGEST_SECRET", "s3cret", raising=False)

    import routes as routes_module

    async def fake_sync_all():
        return {"synced": 11, "failed": 1, "results": []}

    monkeypatch.setattr(routes_module, "sync_all", fake_sync_all)

    r = client.post("/sync/run")
    assert r.status_code == 200
    assert r.json()["synced"] == 11


def test_standings_route_maps_datafc_errors(client, monkeypatch):
    import datafc

    import routes as routes_module

    def unavailable(slug):
        raise datafc.DataNotAvailableError("no standings")

    monkeypatch.setattr(routes_module.datafc_service, "get_standings", unavailable)
    r = client.get("/standings/bundesliga")
    assert r.status_code == 404


def test_sync_one_unknown_slug_is_404(client, monkeypatch):
    from services import config

    monkeypatch.setattr(config, "INGEST_URL", "https://example.com/ingest", raising=False)
    monkeypatch.setattr(config, "INGEST_SECRET", "s3cret", raising=False)
    r = client.post("/sync/league/not-a-league")
    assert r.status_code == 404
