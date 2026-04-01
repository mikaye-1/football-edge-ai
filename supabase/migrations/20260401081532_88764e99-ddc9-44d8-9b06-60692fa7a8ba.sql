
CREATE TABLE public.prediction_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  prediction_id uuid REFERENCES public.predictions(id) ON DELETE CASCADE NOT NULL,
  market text NOT NULL,
  predicted_outcome text NOT NULL,
  actual_outcome text,
  predicted_probability numeric NOT NULL,
  was_correct boolean,
  settled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prediction_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view prediction results"
  ON public.prediction_results
  FOR SELECT
  TO public
  USING (true);

CREATE INDEX idx_prediction_results_match ON public.prediction_results(match_id);
CREATE INDEX idx_prediction_results_settled ON public.prediction_results(settled_at);
