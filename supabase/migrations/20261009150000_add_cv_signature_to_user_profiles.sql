-- Signature image drawn in-app, printed at the bottom of motivation letters (Premium).
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS cv_signature_url TEXT;
