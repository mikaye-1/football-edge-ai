"""HTTP routes for the datafc backend."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException

from services import config, datafc_service
from services.leagues import LEAGUES, list_leagues

from errors import to_http
from sync import sync_all, sync_league

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health():
    return {
        "ok": True,
        "ingest_configured": bool(config.INGEST_URL and config.INGEST_SECRET),
        "leagues": len(LEAGUES),
        "sync_interval_minutes": config.SYNC_INTERVAL_MINUTES,
    }


@router.get("/leagues")
def leagues():
    return list_leagues()


@router.get("/standings/{slug}")
def standings(slug: str):
    """Live standings read straight from datafc (cache-backed)."""
    try:
        return datafc_service.get_standings(slug)
    except Exception as exc:
        raise to_http(exc) from exc


def _check_admin(token: str | None) -> None:
    if config.ADMIN_TOKEN and token != config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.post("/sync/run")
async def run_sync(x_admin_token: str | None = Header(default=None)):
    """Trigger a full sync pass across all leagues."""
    _check_admin(x_admin_token)
    if not (config.INGEST_URL and config.INGEST_SECRET):
        raise HTTPException(
            status_code=503, detail="INGEST_URL / INGEST_SECRET not configured"
        )
    return await sync_all()


@router.post("/sync/league/{slug}")
async def run_sync_one(slug: str, x_admin_token: str | None = Header(default=None)):
    """Trigger a sync for a single league."""
    _check_admin(x_admin_token)
    if not (config.INGEST_URL and config.INGEST_SECRET):
        raise HTTPException(
            status_code=503, detail="INGEST_URL / INGEST_SECRET not configured"
        )
    try:
        return await sync_league(slug)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
