-- Persist Retour à l'emploi progress in the user's server-side profile.
-- SharedPreferences remains an offline/startup cache only.
--
-- Nullable is intentional: NULL identifies profiles that have not yet been
-- migrated from the previous device-only storage.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS retour_emploi_journey jsonb;
