ALTER TABLE public.daily_top20
  ADD COLUMN IF NOT EXISTS market_key text,
  ADD COLUMN IF NOT EXISTS reliability text,
  ADD COLUMN IF NOT EXISTS reliability_score numeric,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS actual_result text,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_daily_top20_outcome ON public.daily_top20(outcome);
CREATE TABLE IF NOT EXISTS public.daily_top20_runs (
  for_date text PRIMARY KEY,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_top20_runs TO anon, authenticated;
GRANT ALL ON public.daily_top20_runs TO service_role;
ALTER TABLE public.daily_top20_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view daily top 20 runs" ON public.daily_top20_runs FOR SELECT USING (true);