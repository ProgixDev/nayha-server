-- Add parent_id and reply_to_name to community_comments for nested replies
ALTER TABLE community_comments
ADD COLUMN IF NOT EXISTS parent_id TEXT,
ADD COLUMN IF NOT EXISTS reply_to_name TEXT;

CREATE INDEX IF NOT EXISTS idx_community_comments_parent_id ON community_comments(parent_id);
