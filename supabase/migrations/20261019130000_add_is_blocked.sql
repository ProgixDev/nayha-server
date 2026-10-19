-- Accounts suspended by the NAYHA team from the admin.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
