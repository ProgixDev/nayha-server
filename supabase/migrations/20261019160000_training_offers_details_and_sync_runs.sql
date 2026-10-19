-- Details available from the sources, and a log of the nightly imports.

ALTER TABLE public.training_offers
  ADD COLUMN IF NOT EXISTS department_code text,
  ADD COLUMN IF NOT EXISTS price_min numeric,
  ADD COLUMN IF NOT EXISTS price_max numeric,
  ADD COLUMN IF NOT EXISTS hours_min numeric,
  ADD COLUMN IF NOT EXISTS hours_max numeric;

CREATE INDEX IF NOT EXISTS training_offers_department_code_idx
  ON public.training_offers (department_code);

-- One row per import of one source: started by the nightly job or from the
-- admin, with what it did. Only the API (service role) uses it.
CREATE TABLE IF NOT EXISTS public.training_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('mcf', 'apprentissage')),
  trigger text NOT NULL CHECK (trigger IN ('cron', 'admin')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  imported integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  removed integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS training_sync_runs_started_idx
  ON public.training_sync_runs (started_at DESC);

ALTER TABLE public.training_sync_runs ENABLE ROW LEVEL SECURITY;
