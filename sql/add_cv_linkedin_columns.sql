-- Migration: add cv_base, linkedin_profil, quota fields to user_profiles
--            add cv_adapte, lettre to candidatures

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS cv_base                    jsonb,
  ADD COLUMN IF NOT EXISTS linkedin_profil            jsonb,
  ADD COLUMN IF NOT EXISTS cv_adapte_count_this_week  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cv_adapte_week_reset_at    timestamptz;

ALTER TABLE candidatures
  ADD COLUMN IF NOT EXISTS cv_adapte  jsonb,
  ADD COLUMN IF NOT EXISTS lettre     text;
