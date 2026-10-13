-- When the person accepted the data processing terms. Set by the API the
-- first time rgpd_accepted becomes true; earlier consents have no date.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS rgpd_accepted_at timestamptz;
