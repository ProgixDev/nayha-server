-- 1. Certification status from the official dates of France Compétences
--    (the register's "active" flag lags behind its own dates):
--    active: registration ongoing;
--    deliverable: registration ended, the certification can still be
--      awarded until delivery_until;
--    to_verify: registration ended, no delivery date published yet;
--    expired: can no longer be awarded (hidden from the search).
--    null: no information.
-- 2. Complementary certificates: Mon Compte Formation offers with no ROME
--    code (mostly RS certificates) are linked to a job only when their main
--    formacode is in the job's official formacodes (ROME, France Travail).
--    The server passes those formacodes; generic ones are left out there.
-- See PLAN_FORMATIONS.md.

ALTER TABLE public.training_offers
  ADD COLUMN IF NOT EXISTS certification_status text
    CHECK (certification_status IN ('active', 'deliverable', 'to_verify', 'expired')),
  ADD COLUMN IF NOT EXISTS registration_end date,
  ADD COLUMN IF NOT EXISTS delivery_until date,
  ADD COLUMN IF NOT EXISTS formacode_main text;

CREATE INDEX IF NOT EXISTS training_offers_formacode_idx
  ON public.training_offers (formacode_main)
  WHERE cardinality(code_romes) = 0;

DROP FUNCTION IF EXISTS public.search_training_groups(text, double precision, double precision, integer, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.search_training_group_offers(text, text, double precision, double precision, integer, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.training_offer_candidates(text, double precision, double precision, integer, text, text);

-- Offers for a job: by ROME code, or — when p_formacodes is given — the
-- offers with no ROME code whose main formacode is one of them.
CREATE FUNCTION public.training_offer_candidates(
  p_rome text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer,
  p_department text,
  p_modalite text,
  p_formacodes text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  group_key text,
  provider_key text,
  distance_km integer,
  remote boolean,
  active_sessions integer,
  cpf_eligible boolean,
  apprentissage boolean,
  qualiopi boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Two branches so each one uses its index (ROME codes, or formacode).
  WITH matching AS (
    SELECT o.* FROM training_offers o
    WHERE p_formacodes IS NULL AND o.code_romes @> ARRAY[p_rome]
    UNION ALL
    SELECT o.* FROM training_offers o
    WHERE p_formacodes IS NOT NULL
      AND cardinality(o.code_romes) = 0
      AND o.formacode_main = ANY (p_formacodes)
  ),
  offers AS (
    SELECT
      o.*,
      CASE
        WHEN o.code_rncp IS NOT NULL THEN 'rncp:' || o.code_rncp
        WHEN o.code_rs IS NOT NULL THEN 'rs:' || o.code_rs
        ELSE 'titre:' || lower(o.title)
      END AS group_key,
      CASE
        -- A remote offer has no meaningful distance.
        WHEN p_lat IS NOT NULL AND o.lat IS NOT NULL AND NOT o.remote THEN
          greatest(1, round(6371 * 2 * asin(sqrt(
            power(sin(radians(o.lat - p_lat) / 2), 2) +
            cos(radians(p_lat)) * cos(radians(o.lat)) *
            power(sin(radians(o.lng - p_lng) / 2), 2)
          ))))::integer
      END AS distance_km
    FROM matching o
    WHERE o.certification_status IS DISTINCT FROM 'expired'
      -- Rows imported before certification_status existed.
      AND (o.certification_status IS NOT NULL OR o.certification_active IS NOT FALSE)
      AND (o.delivery_until IS NULL OR o.delivery_until >= current_date
        OR o.certification_status = 'active')
      AND CASE coalesce(p_modalite, 'all')
        WHEN 'alternance' THEN o.apprentissage
        WHEN 'continue' THEN o.cpf_eligible
        WHEN 'formation_continue' THEN o.cpf_eligible
        WHEN 'distance' THEN o.remote
        WHEN 'presentiel' THEN NOT o.remote
        WHEN 'qualiopi' THEN o.qualiopi IS TRUE
        WHEN 'vae' THEN EXISTS (
          SELECT 1 FROM certifications c
          WHERE c.code_rncp = o.code_rncp AND c.accessibilite_vae > 0
        )
        ELSE TRUE
      END
  )
  SELECT
    o.id,
    o.group_key,
    coalesce(o.dedupe_key, o.id) AS provider_key,
    o.distance_km,
    o.remote,
    o.active_sessions,
    o.cpf_eligible,
    o.apprentissage,
    o.qualiopi
  FROM offers o
  WHERE p_radius_km IS NULL
    OR o.remote
    OR o.distance_km <= p_radius_km
    OR (o.lat IS NULL AND o.department_code = p_department);
$$;

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
  p_offset integer DEFAULT 0,
  p_formacodes text[] DEFAULT NULL
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
      p_rome, p_lat, p_lng, p_radius_km, p_department, p_modalite, p_formacodes
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

-- The providers of one certification, closest first. When one provider has
-- the same certification on both sources, its badges are merged.
CREATE FUNCTION public.search_training_group_offers(
  p_rome text,
  p_group_key text,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_km integer DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_modalite text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_formacodes text[] DEFAULT NULL
)
RETURNS TABLE (
  offer_id text,
  distance_km integer,
  cpf_eligible boolean,
  apprentissage boolean,
  qualiopi boolean,
  total_offers integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT * FROM training_offer_candidates(
      p_rome, p_lat, p_lng, p_radius_km, p_department, p_modalite, p_formacodes
    )
    WHERE group_key = p_group_key
  ),
  ranked AS (
    SELECT
      c.*,
      row_number() OVER (
        PARTITION BY c.provider_key
        ORDER BY c.distance_km NULLS LAST, c.remote, c.active_sessions DESC, c.id
      ) AS position
    FROM candidates c
  ),
  providers AS (
    SELECT
      max(r.id) FILTER (WHERE r.position = 1) AS offer_id,
      min(r.distance_km) AS distance_km,
      bool_or(r.cpf_eligible) AS cpf_eligible,
      bool_or(r.apprentissage) AS apprentissage,
      bool_or(r.qualiopi IS TRUE) AS qualiopi,
      max(r.active_sessions) AS active_sessions
    FROM ranked r
    GROUP BY r.provider_key
  )
  SELECT
    p.offer_id,
    p.distance_km,
    p.cpf_eligible,
    p.apprentissage,
    p.qualiopi,
    (count(*) OVER ())::integer AS total_offers
  FROM providers p
  ORDER BY p.distance_km NULLS LAST, p.active_sessions DESC, p.offer_id
  LIMIT p_limit OFFSET p_offset;
$$;

-- How many jobs list each formacode (official ROME formacodes). The server
-- uses it to leave out generic formacodes shared by many jobs.
CREATE OR REPLACE FUNCTION public.rome_formacode_job_counts(p_formacodes text[])
RETURNS TABLE (formacode text, jobs integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT f->>'code' AS formacode, count(DISTINCT m.code)::integer AS jobs
  FROM rome_metiers m, jsonb_array_elements(m.data->'formacodes') f
  WHERE f->>'code' = ANY (p_formacodes)
  GROUP BY f->>'code';
$$;

REVOKE ALL ON FUNCTION public.training_offer_candidates(text, double precision, double precision, integer, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_training_groups(text, double precision, double precision, integer, text, text, integer, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_training_group_offers(text, text, double precision, double precision, integer, text, text, integer, integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rome_formacode_job_counts(text[]) FROM PUBLIC, anon, authenticated;
