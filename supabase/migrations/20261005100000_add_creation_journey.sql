ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS creation_journey jsonb NOT NULL DEFAULT '{}'::jsonb;
