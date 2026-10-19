-- Where Mon Compte Formation offers really take place. The catalogue only
-- gives the department, so each provider (siren) is looked up once per
-- department in the company register (Recherche Entreprises). When it has
-- exactly one open site there, the offer gets that site's place and a real
-- distance; otherwise it stays "in the department". See PLAN_FORMATIONS.md.

CREATE TABLE IF NOT EXISTS public.training_provider_sites (
  siren text NOT NULL,
  department_code text NOT NULL,
  -- site: one open site found; ambiguous: several; not_found: none.
  status text NOT NULL CHECK (status IN ('site', 'ambiguous', 'not_found')),
  siret text,
  city text,
  lat double precision,
  lng double precision,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (siren, department_code)
);

ALTER TABLE public.training_provider_sites ENABLE ROW LEVEL SECURITY;

-- true: lat/lng are the training site. false: only the department is known.
ALTER TABLE public.training_offers
  ADD COLUMN IF NOT EXISTS location_precise boolean NOT NULL DEFAULT false;

UPDATE public.training_offers
SET location_precise = true
WHERE lat IS NOT NULL AND NOT location_precise;

-- Provider/department pairs never looked up, or looked up long ago.
CREATE OR REPLACE FUNCTION public.training_provider_sites_to_check(
  p_limit integer
)
RETURNS TABLE (
  siren text,
  department_code text,
  provider_name text,
  sirets text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.siren,
    o.department_code,
    max(o.provider_name) AS provider_name,
    array_agg(DISTINCT o.siret) FILTER (WHERE o.siret IS NOT NULL) AS sirets
  FROM training_offers o
  LEFT JOIN training_provider_sites s
    ON s.siren = o.siren AND s.department_code = o.department_code
  WHERE o.source = 'mcf'
    AND o.siren IS NOT NULL
    AND o.department_code IS NOT NULL
    AND (s.siren IS NULL OR s.checked_at < now() - interval '90 days')
  GROUP BY o.siren, o.department_code
  ORDER BY count(*) DESC
  LIMIT p_limit;
$$;

-- Copies the sites found onto the offers. Returns the offers updated.
CREATE OR REPLACE FUNCTION public.apply_training_provider_sites()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE training_offers o
  SET lat = s.lat, lng = s.lng, city = s.city, location_precise = true
  FROM training_provider_sites s
  WHERE o.source = 'mcf'
    AND s.siren = o.siren
    AND s.department_code = o.department_code
    AND s.status = 'site'
    AND (NOT o.location_precise OR o.lat IS DISTINCT FROM s.lat
      OR o.lng IS DISTINCT FROM s.lng);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.training_provider_sites_to_check(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_training_provider_sites() FROM PUBLIC, anon, authenticated;
