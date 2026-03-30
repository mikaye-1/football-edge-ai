-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sport_key TEXT NOT NULL,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'finished')),
  home_score INTEGER,
  away_score INTEGER,
  minute INTEGER,
  external_id TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create odds table
CREATE TABLE public.odds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  odds NUMERIC NOT NULL,
  implied_probability NUMERIC NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create predictions table
CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  outcome TEXT NOT NULL,
  model_probability NUMERIC NOT NULL,
  odds_implied_probability NUMERIC NOT NULL,
  form_score NUMERIC NOT NULL DEFAULT 0.5,
  consistency NUMERIC NOT NULL DEFAULT 0.5,
  final_score NUMERIC NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(match_id, market, outcome)
);

-- Create indexes
CREATE INDEX idx_matches_league ON public.matches(league);
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_kickoff ON public.matches(kickoff_time);
CREATE INDEX idx_odds_match_id ON public.odds(match_id);
CREATE INDEX idx_predictions_match_id ON public.predictions(match_id);
CREATE INDEX idx_predictions_confidence ON public.predictions(confidence);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Anyone can view odds" ON public.odds FOR SELECT USING (true);
CREATE POLICY "Anyone can view predictions" ON public.predictions FOR SELECT USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.odds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;