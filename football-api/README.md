# Burna Predict IQ — datafc backend

FastAPI service that pulls league standings through the `datafc==2.9.0`
package (Sofascore data source) and pushes them into the Lovable Cloud
database through a secured ingest edge function. Deployable to Render,
Railway, or Fly.io — Lovable cannot host Python, so this runs separately.

## How it fits together

```
datafc (Sofascore) ──> football-api (this service) ──> ingest-datafc edge function ──> Lovable Cloud
                                                                              (shared secret)
```

- The Python backend never holds database admin credentials. It authenticates
  to the ingest endpoint with a shared `INGEST_SECRET` header value.
- One failing league never blocks the others; every attempt (success or
  failure) is logged to `data_sync_logs` so the app can show sync health.
- The ingest endpoint replaces each `(league, season)` snapshot delete-first,
  so the standings table always holds the freshest full table per league.

## Endpoints

| Route | Method | Notes |
| --- | --- | --- |
| `/health` | GET | Config + league count diagnostics |
| `/leagues` | GET | Supported league slugs and display names |
| `/standings/{slug}` | GET | Live standings read straight from datafc (cache-backed) |
| `/sync/run` | POST | Sync all leagues now (optional `x-admin-token`) |
| `/sync/league/{slug}` | POST | Sync one league now (optional `x-admin-token`) |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `INGEST_URL` | for syncing | Full URL of the Lovable Cloud `ingest-datafc` function |
| `INGEST_SECRET` | for syncing | Shared secret sent as `x-ingest-secret` |
| `ADMIN_TOKEN` | optional | Protects the manual sync endpoints |
| `ALLOWED_ORIGINS` | optional | CORS origins (defaults to localhost:8080) |
| `SYNC_INTERVAL_MINUTES` | optional | Background sync cadence (default 15) |
| `DATAFC_CACHE_TTL_HOURS` | optional | datafc response cache lifetime (default 24) |

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests/
uvicorn main:app --port 8000
```

## Deploy to Render

A `render.yaml` blueprint is included: it builds from `requirements.txt`,
starts `uvicorn main:app --host 0.0.0.0 --port $PORT`, and expects the
`INGEST_URL` / `INGEST_SECRET` environment variables to be set in the
Render dashboard. Railway/Fly work the same way with the included `Procfile`.

## Deployment checklist

1. Deploy this service to Render/Railway/Fly and note its public URL.
2. In the Lovable project, save the shared `INGEST_SECRET` (generated once;
   paste the same value into your host's `INGEST_SECRET` variable).
3. Set `INGEST_URL` on the host to the deployed `ingest-datafc` function URL.
4. Open the dashboard → Standings page to confirm tables filled in.
