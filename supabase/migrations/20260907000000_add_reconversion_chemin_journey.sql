-- Stores the user's choices made during the "Chemin d'accès" step.
-- The analysis itself is regenerated from the current profile and the latest
-- ROME/CertifInfo data; only deliberate user choices are persisted.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS reconversion_chemin_journey jsonb NOT NULL DEFAULT '{}'::jsonb;
