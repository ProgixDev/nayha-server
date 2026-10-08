-- 1. Create community_posts table if it doesn't exist
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  auteur TEXT NOT NULL,
  initiale TEXT NOT NULL DEFAULT '?',
  contenu TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'normal',
  reactions_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  is_moderated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create community_comments table with support for replies (parent_id, reply_to_name)
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES community_comments(id) ON DELETE CASCADE,
  reply_to_name TEXT,
  user_id TEXT NOT NULL,
  auteur TEXT NOT NULL,
  initiale TEXT NOT NULL DEFAULT '?',
  contenu TEXT NOT NULL,
  is_moderated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If table already existed, ensure parent_id and reply_to_name columns exist
ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS reply_to_name TEXT;

-- 3. Create community_reactions table
CREATE TABLE IF NOT EXISTS community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- 4. Create community_reports table
CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- 5. Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_is_moderated ON community_posts(is_moderated);
CREATE INDEX IF NOT EXISTS idx_community_comments_post_id ON community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_parent_id ON community_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post_id ON community_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_post_id ON community_reports(post_id);

-- 6. Row Level Security (RLS)
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read community_posts" ON community_posts;
CREATE POLICY "Allow authenticated read community_posts" ON community_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert community_posts" ON community_posts;
CREATE POLICY "Allow authenticated insert community_posts" ON community_posts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update community_posts" ON community_posts;
CREATE POLICY "Allow authenticated update community_posts" ON community_posts FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow authenticated read community_comments" ON community_comments;
CREATE POLICY "Allow authenticated read community_comments" ON community_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert community_comments" ON community_comments;
CREATE POLICY "Allow authenticated insert community_comments" ON community_comments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read community_reactions" ON community_reactions;
CREATE POLICY "Allow authenticated read community_reactions" ON community_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert community_reactions" ON community_reactions;
CREATE POLICY "Allow authenticated insert community_reactions" ON community_reactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated delete community_reactions" ON community_reactions;
CREATE POLICY "Allow authenticated delete community_reactions" ON community_reactions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow authenticated read community_reports" ON community_reports;
CREATE POLICY "Allow authenticated read community_reports" ON community_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert community_reports" ON community_reports;
CREATE POLICY "Allow authenticated insert community_reports" ON community_reports FOR INSERT WITH CHECK (true);
