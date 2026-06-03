-- ============================================================
--  Migration 003 — Alternate part number
--  Adds an optional alternate_part_number column to spare_parts
--  so a part can be searched/found by interchangeable SKUs
--  supplied by different manufacturers.
--  Also includes it in the full-text search index so users can
--  find a part by its alternate number.
-- ============================================================

ALTER TABLE spare_parts
  ADD COLUMN IF NOT EXISTS alternate_part_number TEXT;

-- Rebuild the FTS index to include the new column
DROP INDEX IF EXISTS idx_spare_parts_search;
CREATE INDEX idx_spare_parts_search ON spare_parts
  USING GIN(
    to_tsvector('english',
      COALESCE(part_number,'')           || ' ' ||
      COALESCE(alternate_part_number,'') || ' ' ||
      COALESCE(description,'')           || ' ' ||
      COALESCE(application,'')           || ' ' ||
      COALESCE(company_brand,'')         || ' ' ||
      COALESCE(manufacturer_name,'')
    )
  );

CREATE INDEX IF NOT EXISTS idx_alternate_part_number
  ON spare_parts (LOWER(alternate_part_number))
  WHERE alternate_part_number IS NOT NULL;
