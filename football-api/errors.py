"""Translate datafc + ingest exceptions into HTTP errors."""

from __future__ import annotations

from fastapi import HTTPException

import datafc

from services.ingest_client import IngestError, IngestNotConfiguredError
from services.leagues import LeagueNotConfiguredError


def to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LeagueNotConfiguredError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, datafc.InvalidParameterError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, datafc.DataNotAvailableError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, datafc.RateLimitError):
        return HTTPException(status_code=429, detail=str(exc))
    if isinstance(exc, (datafc.ServerError, datafc.APIError)):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, IngestNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, IngestError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=500, detail=f"Unexpected error: {exc}")
