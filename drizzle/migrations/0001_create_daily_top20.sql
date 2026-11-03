CREATE TABLE public.daily_top20 (
  id uuid not null default gen_random_uuid(),
  for_date text not null,
  rank integer not null,
  match_id uuid not null,
  league text not null,
  home_team text not null,
  away_team text not null,
  kickoff_time timestamp with time zone not null,
  market text not null,
  selection text not null,
  probability numeric not null,
  confidence_score numeric not null,
  data_quality numeric not null,
  risk_level text not null,
  overall_score numeric not null,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint daily_top20_date_rank_key unique (for_date, rank)
);

GRANT SELECT ON public.daily_top20 TO anon;
GRANT SELECT ON public.daily_top20 TO authenticated;
GRANT ALL ON public.daily_top20 TO service_role;

ALTER TABLE public.daily_top20 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily top 20"
  ON public.daily_top20
  FOR SELECT
  TO public
  USING (true);