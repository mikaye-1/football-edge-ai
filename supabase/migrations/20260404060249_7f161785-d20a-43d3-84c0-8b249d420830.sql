
ALTER TABLE public.prediction_results
  ADD COLUMN IF NOT EXISTS edge_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT 'low';

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS predicted_home_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS predicted_away_score integer DEFAULT NULL;
