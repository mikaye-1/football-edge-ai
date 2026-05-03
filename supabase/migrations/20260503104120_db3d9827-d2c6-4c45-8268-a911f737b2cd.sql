CREATE TABLE public.model_weights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  w_odds NUMERIC NOT NULL,
  w_model NUMERIC NOT NULL,
  w_form NUMERIC NOT NULL,
  w_consistency NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.model_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view model_weights"
ON public.model_weights
FOR SELECT
USING (true);

CREATE INDEX idx_model_weights_created_at ON public.model_weights (created_at DESC);

INSERT INTO public.model_weights (w_odds, w_model, w_form, w_consistency, sample_size, notes)
VALUES (0.40, 0.30, 0.20, 0.10, 0, 'initial defaults');