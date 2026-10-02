ALTER TABLE public.coaching_sessions
ADD COLUMN IF NOT EXISTS user_context jsonb NOT NULL DEFAULT '{}'::jsonb;
