"""datafc integration layer.

Every function here wraps a real `datafc` 2.9.0 export and normalizes its
pandas DataFrame into plain JSON-safe dicts. No functionality is invented:
only exports verified against the installed package are used.

Verified exports used:
- seasons_data(tournament_id)                    -> seasons list
- standings_data(tournament_id, season_id)       -> standings rows (Total/Home/Away)
- match_data(tournament_id, season_id, week)     -> matches for a round
- upcoming_matches_data(standings_df)            -> next fixtures per team
- search_data(query, entity_type)                -> entity search
- squad_data(standings_df)                       -> rosters per team
- team_stats_data(standings_df, ...)             -> season stats per team

datafc raises DataNotAvailableError / RateLimitError / ServerError / APIError;
these are translated to HTTP codes in routes/errors.py.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import pandas as pd

import datafc
from datafc import DiskCache

from services import config
from services.leagues import get_league

logger = logging.getLogger(__name__)

_cache: DiskCache | None = None


def get_cache() -> DiskCache | None:
    """Lazy module-level disk cache so repeated syncs hit the disk, not the wire."""
    global _cache
    if _cache is None and config.CACHE_TTL_HOURS > 0:
        _cache = DiskCache(cache_dir=config.CACHE_DIR, ttl_hours=config.CACHE_TTL_HOURS)
    return _cache


def reset_cache() -> None:
    global _cache
    _cache = None


def normalize(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame -> JSON-safe list of dicts (NaN -> None, numpy -> python)."""
    if df is None or df.empty:
        return []
    return json_safe(df.where(pd.notna(df), None).to_dict(orient="records"))


def json_safe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        clean: dict[str, Any] = {}
        for key, value in row.items():
            if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                value = None
            if hasattr(value, "item"):
                try:
                    value = value.item()
                except (AttributeError, ValueError):
                    pass
            clean[str(key)] = value
        out.append(clean)
    return out


# ---------------------------------------------------------------- seasons ---

def get_seasons(slug: str) -> list[dict[str, Any]]:
    league = get_league(slug)
    df = datafc.seasons_data(
        league["tournament_id"],
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )
    rows = normalize(df)
    # Newest season first; season_year is a comparable integer-like value.
    rows.sort(key=lambda r: _season_sort_key(r), reverse=True)
    return rows


def _season_sort_key(row: dict[str, Any]) -> int:
    year = row.get("season_year")
    try:
        return int(year)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0


def resolve_current_season(slug: str) -> dict[str, Any]:
    """Pick the newest available season for a league."""
    seasons = get_seasons(slug)
    if not seasons:
        raise datafc.DataNotAvailableError(f"No seasons found for league '{slug}'")
    return seasons[0]


# -------------------------------------------------------------- standings ---

def _standings_df(slug: str, season_id: int | None = None) -> pd.DataFrame:
    league = get_league(slug)
    if season_id is None:
        season_id = int(resolve_current_season(slug)["season_id"])
    return datafc.standings_data(
        league["tournament_id"],
        season_id,
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )


def get_standings(slug: str, season_id: int | None = None) -> dict[str, Any]:
    """Overall (Total) standings rows for a league's season."""
    df = _standings_df(slug, season_id)
    if df.empty:
        raise datafc.DataNotAvailableError(f"No standings data available for '{slug}'")
    if "category" in df.columns:
        total = df[df["category"].astype(str).str.lower() == "total"]
        if not total.empty:
            df = total
    rows = normalize(df)
    if rows and "position" in rows[0]:
        rows.sort(key=lambda r: r.get("position") or 0)
    return rows


def get_upcoming_matches(slug: str) -> list[dict[str, Any]]:
    """Next fixtures per team, derived from the standings dataset."""
    df = datafc.upcoming_matches_data(
        _standings_df(slug),
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )
    return normalize(df)


# ---------------------------------------------------------------- matches ---

def get_matches(slug: str, week: int | None = None) -> list[dict[str, Any]]:
    league = get_league(slug)
    season_id = int(resolve_current_season(slug)["season_id"])
    df = datafc.match_data(
        league["tournament_id"],
        season_id,
        week_number=week,
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )
    return normalize(df)


# ------------------------------------------------------------------ teams ---

def _team_row(slug: str, team_id: int) -> pd.DataFrame:
    df = _standings_df(slug)
    match = df[df["team_id"] == team_id]
    if match.empty:
        raise datafc.DataNotAvailableError(f"Team {team_id} not found in '{slug}' standings")
    return match


def get_team_stats(slug: str, team_id: int) -> list[dict[str, Any]]:
    league = get_league(slug)
    season_id = int(resolve_current_season(slug)["season_id"])
    df = datafc.team_stats_data(
        _team_row(slug, team_id),
        league["tournament_id"],
        season_id,
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )
    return normalize(df)


def get_team_squad(slug: str, team_id: int) -> list[dict[str, Any]]:
    df = datafc.squad_data(
        _team_row(slug, team_id),
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )
    return normalize(df)


# ----------------------------------------------------------------- search ---

def get_search(query: str, entity_type: str | None = None) -> list[dict[str, Any]]:
    df = datafc.search_data(
        query,
        entity_type=entity_type,
        data_source=config.DATA_SOURCE,
        rate_limit=config.RATE_LIMIT,
        cache=get_cache(),
    )
    return normalize(df)
