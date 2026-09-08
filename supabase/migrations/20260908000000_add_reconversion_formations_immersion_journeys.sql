-- Keeps deliberate user choices separate from the catalogue data, which can
-- change as RNCP sources are refreshed. Each object is keyed by ROME code.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS reconversion_formations_journey jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS reconversion_immersion_journey jsonb NOT NULL DEFAULT '{}'::jsonb;
