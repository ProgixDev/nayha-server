-- Copying every provider site at once runs past the statement timeout:
-- copy only the given provider/department pairs (called per saved batch).

DROP FUNCTION IF EXISTS public.apply_training_provider_sites();

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
  SET lat = s.lat, lng = s.lng, city = s.city, location_precise = true
  FROM training_provider_sites s
  JOIN unnest(p_sirens, p_departments) AS pair(siren, department_code)
    ON pair.siren = s.siren AND pair.department_code = s.department_code
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

REVOKE ALL ON FUNCTION public.apply_training_provider_sites(text[], text[]) FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS training_offers_siren_department_idx
  ON public.training_offers (siren, department_code)
  WHERE source = 'mcf';
