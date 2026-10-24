CREATE TABLE public.standings (
  id uuid primary key default gen_random_uuid(),
  league text not null,
  season text not null,
  position int not null,
  team_name text not null,
  team_external_id text not null,
  matches_played int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  goal_diff int not null default 0,
  points int not null default 0,
  form text,
  source text not null default 'datafc-sofascore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.standings TO anon, authenticated;
GRANT ALL ON public.standings TO service_role;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view standings" ON public.standings FOR SELECT USING (true);

CREATE UNIQUE INDEX standings_league_season_team_key ON public.standings (league, season, team_external_id);
CREATE INDEX standings_league_season_position_idx ON public.standings (league, season, position);
CREATE TRIGGER standings_updated_at BEFORE UPDATE ON public.standings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.data_sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  source text not null default 'datafc-sofascore',
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed int not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.data_sync_logs TO anon, authenticated;
GRANT ALL ON public.data_sync_logs TO service_role;
ALTER TABLE public.data_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view sync logs" ON public.data_sync_logs FOR SELECT USING (true);
CREATE INDEX data_sync_logs_started_idx ON public.data_sync_logs (started_at desc);