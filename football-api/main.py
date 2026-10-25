"""Burna Predict IQ — datafc backend (FastAPI entrypoint).

Deployable to Render / Railway / Fly. The background sync loop runs only when
INGEST_URL and INGEST_SECRET are configured; without them the service still
exposes /health, /leagues and /standings/{slug} for diagnostics.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from services import config

from routes import router
from sync import sync_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    if config.INGEST_URL and config.INGEST_SECRET:
        task = asyncio.create_task(sync_loop())
        logging.getLogger(__name__).info(
            "background sync started (every %s min)", config.SYNC_INTERVAL_MINUTES
        )
    else:
        logging.getLogger(__name__).warning(
            "INGEST_URL / INGEST_SECRET missing; background sync disabled"
        )
    yield
    if task:
        task.cancel()


app = FastAPI(title="Burna Predict IQ datafc backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)
