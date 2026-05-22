-- ============================================================
--  Migration 002 — Categories
--  Adds a managed table of spare-part categories so admins can
--  add/edit/delete categories instead of using a hard-coded list.
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories (LOWER(name));

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read categories (used by part form, filters)
CREATE POLICY "Read categories" ON categories
  FOR SELECT TO authenticated USING (true);

-- Seed with the categories that were previously hard-coded
INSERT INTO categories (name) VALUES
  ('Brakes'), ('Engine'), ('Filters'), ('Electrical'), ('Suspension'),
  ('Transmission'), ('Cooling'), ('Fuel System'), ('Body Parts'),
  ('Lights'), ('Exhaust'), ('Tyres & Wheels'), ('Other')
ON CONFLICT (name) DO NOTHING;
