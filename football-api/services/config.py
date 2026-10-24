import os


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "") or default)
    except ValueError:
        return default


def _env_list(name: str, default: str) -> list[str]:
    return [o.strip() for o in _env(name, default).split(",") if o.strip()]


# Where the Lovable Cloud ingest edge function lives. The Python backend never
# holds a Supabase service-role key; it pushes normalized data through this
# endpoint using a shared ingest secret instead.
INGEST_URL = _env("INGEST_URL")
INGEST_SECRET = _env("INGEST_SECRET")

# Optional token protecting POST /api/sync/run when set.
ADMIN_TOKEN = _env("ADMIN_TOKEN")

ALLOWED_ORIGINS = _env_list("ALLOWED_ORIGINS", "http://localhost:8080")

# datafc runtime settings.
DATA_SOURCE = _env("DATAFC_DATA_SOURCE", "sofascore")
RATE_LIMIT = _env_float("DATAFC_RATE_LIMIT", 2.0)
CACHE_TTL_HOURS = _env_float("DATAFC_CACHE_TTL_HOURS", 24.0)
CACHE_DIR = _env("DATAFC_CACHE_DIR", ".datafc_cache")

# Background sync cadence in minutes.
SYNC_INTERVAL_MINUTES = _env_float("SYNC_INTERVAL_MINUTES", 15.0)
