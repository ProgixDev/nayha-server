-- Ateliers vidéo emploi watched list + weekly actions counter

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ateliers_emploi_watched text[] NOT NULL DEFAULT '{}';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS actions_semaine_count integer NOT NULL DEFAULT 0;
