-- 1. Create table for tracking real workshop views and completions
CREATE TABLE IF NOT EXISTS atelier_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atelier_id TEXT NOT NULL REFERENCES ateliers(id) ON DELETE CASCADE,
  user_id TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for fast aggregation
CREATE INDEX IF NOT EXISTS idx_atelier_views_atelier_id ON atelier_views(atelier_id);
CREATE INDEX IF NOT EXISTS idx_atelier_views_user_id ON atelier_views(user_id);
CREATE INDEX IF NOT EXISTS idx_atelier_views_completed ON atelier_views(completed);
CREATE INDEX IF NOT EXISTS idx_atelier_views_created_at ON atelier_views(created_at);

-- 3. Row Level Security
ALTER TABLE atelier_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert on atelier_views" ON atelier_views;
CREATE POLICY "Allow public insert on atelier_views"
  ON atelier_views FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read on atelier_views" ON atelier_views;
CREATE POLICY "Allow authenticated read on atelier_views"
  ON atelier_views FOR SELECT
  USING (true);
