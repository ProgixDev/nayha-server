-- Add session_id to atelier_views for session-based deduplication
ALTER TABLE atelier_views
ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_atelier_views_session_id ON atelier_views(session_id);
