-- Stores the AI decision about whether LinkedIn is a useful job-search
-- channel for the user's currently selected target job.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS linkedin_relevant boolean,
  ADD COLUMN IF NOT EXISTS linkedin_relevance_metier_id text;
