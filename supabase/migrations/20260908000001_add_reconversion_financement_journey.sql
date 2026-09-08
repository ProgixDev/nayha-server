-- Persists the user's funding plan choices separately from formation and
-- immersion journeys. Each object is keyed by ROME code so a user can
-- maintain independent plans for multiple target occupations.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS reconversion_financement_journey jsonb NOT NULL DEFAULT '{}'::jsonb;
