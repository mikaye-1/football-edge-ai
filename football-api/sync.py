"""Sync engine: pull datafc standings per league and push to Lovable Cloud.

Every league syncs independently — one failing league never blocks the others.
Failures are recorded in `data_sync_logs` through the same ingest endpoint so
the dashboard can show sync health. Column names map the verified datafc 2.9.0
sofascore standings contract (team_name, team_id, position, matches, wins,
draws, losses, scores_for, scores_against, points).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from services import config, datafc_service
from services.ingest_client import post_to_ingest
from services.leagues import LEAGUES

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_standings(
    rows: list[dict[str, Any]], league_name: str, season_label: str
) -> list[dict[str, Any]]:
    """Map datafc standings rows to the public.standings schema."""
    out: list[dict[str, Any]] = []
    for r in rows:
        gf = int(r.get("scores_for") or 0)
        ga = int(r.get("scores_against") or 0)
        out.append(
            {
                "league": league_name,
                "season": season_label,
                "team_name": str(r.get("team_name") or ""),
                "team_external_id": str(r.get("team_id") or ""),
                "position": int(r.get("position") or 0),
                "matches_played": int(r.get("matches") or 0),
                "wins": int(r.get("wins") or 0),
                "draws": int(r.get("draws") or 0),
                "losses": int(r.get("losses") or 0),
                "goals_for": gf,
                "goals_against": ga,
                "goal_diff": gf - ga,
                "points": int(r.get("points") or 0),
                "form": r.get("form") or None,
                "source": "datafc",
            }
        )
    return out


def _build_payload(slug: str) -> dict[str, Any]:
    """Blocking: fetch one league's current-season standings from datafc."""
    league = LEAGUES[slug]
    season = datafc_service.resolve_current_season(slug)
    season_label = str(
        season.get("season_name") or season.get("season_year") or "current"
    )
    rows = datafc_service.get_standings(slug, int(season["season_id"]))
    standings = normalize_standings(rows, league["name"], season_label)
    return {
        "source": "datafc",
        "sync_type": "standings",
        "started_at": _utcnow(),
        "status": "success",
        "standings": standings,
    }


async def sync_league(slug: str) -> dict[str, Any]:
    """Sync a single league; a failure records an error log via ingest."""
    if slug not in LEAGUES:
        raise KeyError(f"Unknown league '{slug}'")
    started = _utcnow()
    try:
        payload = await asyncio.to_thread(_build_payload, slug)
        await post_to_ingest(payload)
        count = len(payload["standings"])
        logger.info("synced %s: %d standings rows", slug, count)
        return {"slug": slug, "status": "success", "records": count}
    except Exception as exc:  # noqa: BLE001 - one league must never break the pass
        logger.exception("sync failed for %s", slug)
        failure = {
            "source": "datafc",
            "sync_type": "standings",
            "started_at": started,
            "status": "error",
            "error_message": f"{type(exc).__name__}: {exc}"[:500],
            "standings": [],
        }
        try:
            await post_to_ingest(failure)
        except Exception:
            logger.exception("could not record sync failure for %s", slug)
        return {"slug": slug, "status": "error", "records": 0, "error": str(exc)[:300]}


async def sync_all() -> dict[str, Any]:
    """One full sync pass across every configured league."""
    results = [await sync_league(slug) for slug in sorted(LEAGUES)]
    ok = sum(1 for r in results if r["status"] == "success")
    return {"synced": ok, "failed": len(results) - ok, "results": results}


async def sync_loop() -> None:
    """Background loop: full sync every SYNC_INTERVAL_MINUTES."""
    while True:
        try:
            summary = await sync_all()
            logger.info(
                "sync pass complete: %d ok, %d failed",
                summary["synced"],
                summary["failed"],
            )
        except Exception:  # noqa: BLE001
            logger.exception("sync pass crashed; retrying next interval")
        await asyncio.sleep(config.SYNC_INTERVAL_MINUTES * 60)
