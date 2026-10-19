-- Subscription details copied from RevenueCat for the admin: which product
-- (so which duration), which store, and whether it will renew.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS subscription_product text,
  ADD COLUMN IF NOT EXISTS subscription_store text,
  ADD COLUMN IF NOT EXISTS subscription_will_renew boolean;
