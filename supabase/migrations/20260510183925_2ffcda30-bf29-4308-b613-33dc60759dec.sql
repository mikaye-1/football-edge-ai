CREATE TABLE public.ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE,
  predicted_outcome text NOT NULL,
  confidence_tier text NOT NULL,
  win_probability jsonb NOT NULL,
  edge_score numeric NOT NULL DEFAULT 0,
  value_bet jsonb,
  key_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_summary text,
  preview_text text,
  btts_prediction text,
  over_under_prediction text,
  recommended_markets jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_value_bet boolean NOT NULL DEFAULT false,
  is_strong_pick boolean NOT NULL DEFAULT false,
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ai_predictions"
  ON public.ai_predictions FOR SELECT
  USING (true);

CREATE INDEX idx_ai_predictions_match_id ON public.ai_predictions(match_id);

CREATE TRIGGER update_ai_predictions_updated_at
  BEFORE UPDATE ON public.ai_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();