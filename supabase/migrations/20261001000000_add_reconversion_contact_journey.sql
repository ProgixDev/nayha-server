-- Persists the user's action plan checklist progress for the contact &
-- inscription step. Stores completed action item IDs keyed by ROME code.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS reconversion_contact_journey jsonb NOT NULL DEFAULT '{}'::jsonb;
