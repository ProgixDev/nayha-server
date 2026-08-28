-- Subscription tracking columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
