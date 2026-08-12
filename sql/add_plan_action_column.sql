-- Add plan_action_data column to store AI-generated career path suggestions
-- Run this in Supabase SQL Editor

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan_action_data JSONB;
