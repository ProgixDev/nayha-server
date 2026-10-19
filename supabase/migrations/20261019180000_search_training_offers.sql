-- Search of the imported training offers for one job (ROME code), used by
-- GET reconversion/formations/:codeRome. See PLAN_FORMATIONS.md, step 3.
--
-- Offers are grouped by certification (RNCP, RS, or title when there is no
-- code). Inside a group, the offers of one provider for one certification
-- (same dedupe_key, whatever the source) count once.
--
-- Location: API Apprentissage offers have coordinates, so their distance is
-- computed. Mon Compte Formation only gives the department, so with a radius
-- those offers are kept when they are in the user's department. Remote offers
-- are always kept.

CREATE OR REPLACE FUNCTION public.training_offer_candidates(
  p_rome text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer,
  p_department text,
  p_modalite text
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
  WITH offers AS (
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
    FROM training_offers o
    WHERE o.code_romes @> ARRAY[p_rome]
      AND o.certification_active IS NOT FALSE
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
-- place is known, otherwise the one offered by the most providers.
CREATE OR REPLACE FUNCTION public.search_training_groups(
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
      row_number() OVER (
        PARTITION BY c.group_key
        ORDER BY c.distance_km NULLS LAST, c.remote, c.active_sessions DESC, c.id
      ) AS position
    FROM candidates c
  ),
  groups AS (
    SELECT
      r.group_key,
      max(r.id) FILTER (WHERE r.position = 1) AS offer_id,
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
CREATE OR REPLACE FUNCTION public.search_training_group_offers(
  p_rome text,
  p_group_key text,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_radius_km integer DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_modalite text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
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
      p_rome, p_lat, p_lng, p_radius_km, p_department, p_modalite
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

-- Only the API (service role) calls these.
REVOKE ALL ON FUNCTION public.training_offer_candidates(text, double precision, double precision, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_training_groups(text, double precision, double precision, integer, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_training_group_offers(text, text, double precision, double precision, integer, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
