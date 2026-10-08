-- Add progress_rate to atelier_views table
ALTER TABLE atelier_views
ADD COLUMN IF NOT EXISTS progress_rate NUMERIC(5, 4) DEFAULT 0.0;
