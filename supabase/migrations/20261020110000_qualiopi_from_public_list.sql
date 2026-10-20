-- Qualiopi from the official public list of training providers (DGEFP,
-- "Liste publique des organismes de formation", L.6351-7-1 Code du
-- travail), with its certification categories. It replaces the company
-- register lookup and the API Apprentissage flag, which only covers the
-- "apprentissage" category. See PLAN_FORMATIONS.md.
--
-- qualiopi_categories: actions_de_formation, bilans_de_competences, vae,
--   apprentissage (empty: declared provider without certification).
-- provider_listed: the provider (siren) is in the public list; false: it
--   is not (e.g. public schools, which do not have to declare); null: the
--   list could not be read.

ALTER TABLE public.training_offers
  ADD COLUMN IF NOT EXISTS qualiopi_categories text[],
  ADD COLUMN IF NOT EXISTS provider_listed boolean;

ALTER TABLE public.training_providers
  ADD COLUMN IF NOT EXISTS qualiopi_categories text[],
  ADD COLUMN IF NOT EXISTS listed boolean;

-- The company register lookup is no longer used.
DROP FUNCTION IF EXISTS public.training_providers_to_check(integer);
DROP FUNCTION IF EXISTS public.apply_training_providers(text[]);
