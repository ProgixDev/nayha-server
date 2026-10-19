-- Training offers shown in the reconversion journey, imported every night
-- from Mon Compte Formation (CPF) and API Apprentissage (work-study), then
-- checked and de-duplicated. Public open data; only the API (service role)
-- reads or writes the table. See PLAN_FORMATIONS.md.

CREATE TABLE IF NOT EXISTS public.training_offers (
  -- "<source>:<source_id>", e.g. mcf:32434542000040_NDODEVOPS26
  id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('mcf', 'apprentissage')),
  source_id text NOT NULL,

  title text NOT NULL,
  provider_name text,
  siret text,
  -- First 9 digits of the SIRET: the same provider across its sites.
  siren text,

  code_rncp text,
  code_rs text,
  certification_title text,
  level text,
  code_romes text[] NOT NULL DEFAULT '{}',

  department text,
  region text,
  city text,
  lat double precision,
  lng double precision,
  remote boolean NOT NULL DEFAULT false,

  active_sessions integer NOT NULL DEFAULT 0,
  next_session_at date,

  cpf_eligible boolean NOT NULL DEFAULT false,
  apprentissage boolean NOT NULL DEFAULT false,
  qualiopi boolean,
  certification_active boolean,

  -- siren + certification code: the same training offered by one provider,
  -- whatever the source. Offers sharing it are shown once.
  dedupe_key text,

  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_id)
);

-- Search by job, then narrow by place.
CREATE INDEX IF NOT EXISTS training_offers_romes_idx
  ON public.training_offers USING gin (code_romes);
CREATE INDEX IF NOT EXISTS training_offers_department_idx
  ON public.training_offers (department);
CREATE INDEX IF NOT EXISTS training_offers_dedupe_idx
  ON public.training_offers (dedupe_key);
CREATE INDEX IF NOT EXISTS training_offers_rncp_idx
  ON public.training_offers (code_rncp);
-- Offers missing from the latest import are removed using this.
CREATE INDEX IF NOT EXISTS training_offers_last_seen_idx
  ON public.training_offers (source, last_seen_at);

ALTER TABLE public.training_offers ENABLE ROW LEVEL SECURITY;
