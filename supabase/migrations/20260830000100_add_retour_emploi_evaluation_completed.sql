-- Marks that the user has acknowledged their job-fit evaluation and entered
-- the candidature-preparation flow.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS retour_emploi_evaluation_completed boolean NOT NULL DEFAULT false;
