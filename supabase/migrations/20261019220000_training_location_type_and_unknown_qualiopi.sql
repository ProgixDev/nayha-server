-- Only real information is shown to users (no value inferred from a rule).
--
-- 1. location_type says what the place of an offer is:
--    training_site: the training place given by the source (API Apprentissage);
--    provider_site: the provider's only open site in the department (company
--      register) — the provider's address, not necessarily the classroom;
--    department: only the department is known.
-- 2. Qualiopi of a Mon Compte Formation provider is unknown until the company
--    register confirms it.

ALTER TABLE public.training_offers
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'department'
    CHECK (location_type IN ('training_site', 'provider_site', 'department'));

UPDATE public.training_offers
SET location_type = CASE
  WHEN source = 'apprentissage' AND lat IS NOT NULL THEN 'training_site'
  WHEN source = 'mcf' AND location_precise THEN 'provider_site'
  ELSE 'department'
END;

UPDATE public.training_offers
SET qualiopi = NULL
WHERE source = 'mcf' AND NOT qualiopi_verified AND qualiopi IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_training_provider_sites(
  p_sirens text[],
  p_departments text[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE training_offers o
  SET lat = s.lat, lng = s.lng, city = s.city, location_type = 'provider_site',
    location_precise = true
  FROM training_provider_sites s
  JOIN unnest(p_sirens, p_departments) AS pair(siren, department_code)
    ON pair.siren = s.siren AND pair.department_code = s.department_code
  WHERE o.source = 'mcf'
    AND s.siren = o.siren
    AND s.department_code = o.department_code
    AND s.status = 'site'
    AND (o.location_type <> 'provider_site' OR o.lat IS DISTINCT FROM s.lat
      OR o.lng IS DISTINCT FROM s.lng);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- location_precise is replaced by location_type; it is dropped once the
-- server no longer writes it.
