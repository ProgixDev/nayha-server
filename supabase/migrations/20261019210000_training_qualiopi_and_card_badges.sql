-- 1. Qualiopi checked per provider. Mon Compte Formation only lists
--    Qualiopi-certified providers (required by law since 2022), but the
--    company register (Recherche Entreprises, est_qualiopi) confirms it per
--    provider. Until checked, qualiopi_verified stays false.
-- 2. The search returns the badges of the provider shown on each card, not
--    only those of the whole certification. See PLAN_FORMATIONS.md.

ALTER TABLE public.training_offers
  ADD COLUMN IF NOT EXISTS qualiopi_verified boolean NOT NULL DEFAULT false;

-- API Apprentissage gives Qualiopi for each offer.
UPDATE public.training_offers
SET qualiopi_verified = true
WHERE source = 'apprentissage' AND qualiopi IS NOT NULL AND NOT qualiopi_verified;

CREATE TABLE IF NOT EXISTS public.training_providers (
  siren text PRIMARY KEY,
  -- null: the register does not know the company.
  qualiopi boolean,
  checked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_providers ENABLE ROW LEVEL SECURITY;

-- Providers never checked, or checked more than 30 days ago.
CREATE OR REPLACE FUNCTION public.training_providers_to_check(p_limit integer)
RETURNS TABLE (siren text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT o.siren
  FROM training_offers o
  LEFT JOIN training_providers p ON p.siren = o.siren
  WHERE o.source = 'mcf'
    AND o.siren IS NOT NULL
    AND (p.siren IS NULL OR p.checked_at < now() - interval '30 days')
  GROUP BY o.siren
  ORDER BY count(*) DESC
  LIMIT p_limit;
$$;

-- Copies the Qualiopi results of the given providers onto their offers.
CREATE OR REPLACE FUNCTION public.apply_training_providers(p_sirens text[])
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE training_offers o
  SET qualiopi = p.qualiopi, qualiopi_verified = true
  FROM training_providers p
  WHERE o.source = 'mcf'
    AND p.siren = o.siren
    AND p.siren = ANY (p_sirens)
    AND p.qualiopi IS NOT NULL
    AND (o.qualiopi IS DISTINCT FROM p.qualiopi OR NOT o.qualiopi_verified);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

CREATE INDEX IF NOT EXISTS training_offers_siren_idx
  ON public.training_offers (siren)
  WHERE source = 'mcf';

-- The return type changes: replace the function.
DROP FUNCTION IF EXISTS public.search_training_groups(text, double precision, double precision, integer, text, text, integer, integer);

-- One row per certification, best first: the closest one when the user's
-- place is known, otherwise the one offered by the most providers. offer_*
-- describe the provider shown on the card; the others the whole group.
CREATE FUNCTION public.search_training_groups(
  p_rome text,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_km integer DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_modalite text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  group_key text,
  offer_id text,
  offer_distance_km integer,
  offer_cpf_eligible boolean,
  offer_apprentissage boolean,
  offer_qualiopi boolean,
  providers integer,
  nearest_km integer,
  cpf_eligible boolean,
  apprentissage boolean,
  qualiopi boolean,
  remote boolean,
  total_groups integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT * FROM training_offer_candidates(
      p_rome, p_lat, p_lng, p_radius_km, p_department, p_modalite
    )
  ),
  ranked AS (
    SELECT
      c.*,
      -- One provider giving the certification on both sources has both
      -- badges.
      bool_or(c.cpf_eligible) OVER provider AS provider_cpf,
      bool_or(c.apprentissage) OVER provider AS provider_apprentissage,
      bool_or(c.qualiopi IS TRUE) OVER provider AS provider_qualiopi,
      row_number() OVER (
        PARTITION BY c.group_key
        ORDER BY c.distance_km NULLS LAST, c.remote, c.active_sessions DESC, c.id
      ) AS position
    FROM candidates c
    WINDOW provider AS (PARTITION BY c.group_key, c.provider_key)
  ),
  groups AS (
    SELECT
      r.group_key,
      max(r.id) FILTER (WHERE r.position = 1) AS offer_id,
      max(r.distance_km) FILTER (WHERE r.position = 1) AS offer_distance_km,
      bool_or(r.provider_cpf) FILTER (WHERE r.position = 1) AS offer_cpf_eligible,
      bool_or(r.provider_apprentissage) FILTER (WHERE r.position = 1)
        AS offer_apprentissage,
      bool_or(r.provider_qualiopi) FILTER (WHERE r.position = 1)
        AS offer_qualiopi,
      count(DISTINCT r.provider_key)::integer AS providers,
      min(r.distance_km) AS nearest_km,
      bool_or(r.cpf_eligible) AS cpf_eligible,
      bool_or(r.apprentissage) AS apprentissage,
      bool_or(r.qualiopi IS TRUE) AS qualiopi,
      bool_or(r.remote) AS remote
    FROM ranked r
    GROUP BY r.group_key
  )
  SELECT
    g.group_key,
    g.offer_id,
    g.offer_distance_km,
    g.offer_cpf_eligible,
    g.offer_apprentissage,
    g.offer_qualiopi,
    g.providers,
    g.nearest_km,
    g.cpf_eligible,
    g.apprentissage,
    g.qualiopi,
    g.remote,
    (count(*) OVER ())::integer AS total_groups
  FROM groups g
  ORDER BY
    CASE WHEN p_lat IS NULL THEN NULL ELSE g.nearest_km END NULLS LAST,
    g.providers DESC,
    g.group_key
  LIMIT p_limit OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.search_training_groups(text, double precision, double precision, integer, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_providers_to_check(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_training_providers(text[]) FROM PUBLIC, anon, authenticated;
