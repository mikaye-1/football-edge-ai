# AGENTS

The shared Poisson engine lives in `supabase/functions/_shared/dailyModel.ts`; match-level prediction functions (`generate-ai-prediction`, `daily-top20`) reuse its train/probability/ranking math instead of keeping divergent copies. Why: the Daily Top 20 engine and per-match picks must produce probabilities from one consistent model.

Version deterministic predictions with the historical dataset fingerprint in the existing prediction cache metadata, so newly recorded results refresh future picks without a duplicate model-data table.

The datafc standings flow runs as a separate Python backend (`football-api/`, FastAPI + `datafc==2.9.0`) that pushes snapshots through the `ingest-datafc` edge function. The Python host authenticates with only the shared `INGEST_SECRET` header and never holds database credentials; the ingest endpoint validates each row in isolation, accepts signed goal differences, replaces per `(league, season)`, and skips bad rows instead of failing the whole batch.
