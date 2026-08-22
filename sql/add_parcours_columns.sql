-- Parcours progress columns — replaces SharedPreferences on-device storage
-- linkedin_completed and cv_completed are derived from linkedin_profil/cv_base IS NOT NULL

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS parcours_type text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS parcours_analyse_completed boolean NOT NULL DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS parcours_first_candidature_completed boolean NOT NULL DEFAULT false;
