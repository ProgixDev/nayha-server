-- Records whether creating an activity is a path the user wants to explore.
-- It is deliberately independent from the active parcours: a user only enters
-- the creation journey after confirming it and unlocking the premium offer.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS creation_interest text;

ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_creation_interest_check;

ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_creation_interest_check
CHECK (creation_interest IS NULL OR creation_interest IN ('yes', 'maybe', 'no'));
