"""Push normalized data into the Lovable Cloud database.

The backend deliberately does NOT hold a Supabase service-role key. It posts
validated payloads to the `ingest-datafc` edge function, authenticated with a
shared ingest secret (INGEST_SECRET). That keeps the external deployment
usable on Render/Railway/Fly without leaking database credentials.
"""

from __future__ import annotations

import logging

import httpx

from services import config

logger = logging.getLogger(__name__)


class IngestNotConfiguredError(Exception):
    pass


class IngestError(Exception):
    pass


async def post_to_ingest(payload: dict) -> dict:
    if not config.INGEST_URL or not config.INGEST_SECRET:
        raise IngestNotConfiguredError(
            "INGEST_URL / INGEST_SECRET are not configured; sync cannot reach the database"
        )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                config.INGEST_URL,
                json=payload,
                headers={"x-ingest-secret": config.INGEST_SECRET},
            )
    except httpx.HTTPError as exc:
        raise IngestError(f"Ingest request failed: {exc}") from exc
    if response.status_code != 200:
        raise IngestError(
            f"Ingest returned HTTP {response.status_code}: {response.text[:300]}"
        )
    return response.json()
