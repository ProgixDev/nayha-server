-- ROME 4.0 tables for France Travail data
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS rome_metiers (
  code VARCHAR(5) PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rome_competences (
  code VARCHAR(10) PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rome_fiches_metiers (
  code VARCHAR(5) PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rome_contextes_travail (
  code VARCHAR(10) PRIMARY KEY,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for text search on metier libelle
CREATE INDEX IF NOT EXISTS idx_rome_metiers_libelle
  ON rome_metiers USING GIN ((data->>'libelle') gin_trgm_ops);
