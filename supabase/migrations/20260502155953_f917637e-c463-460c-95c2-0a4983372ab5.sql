CREATE TABLE IF NOT EXISTS public.match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE,
  home_corners integer,
  away_corners integer,
  home_yellow_cards integer,
  away_yellow_cards integer,
  home_red_cards integer,
  away_red_cards integer,
  home_possession numeric,
  away_possession numeric,
  home_shots integer,
  away_shots integer,
  home_shots_on_target integer,
  away_shots_on_target integer,
  source text NOT NULL DEFAULT 'api-football',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match_stats"
  ON public.match_stats FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_match_stats_match_id ON public.match_stats(match_id);

CREATE TRIGGER set_match_stats_updated_at
  BEFORE UPDATE ON public.match_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();