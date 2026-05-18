-- ============================================================
--  001_analytics_and_ecommerce.sql
--  Run in: Supabase Dashboard → SQL Editor → New Query
--  Idempotent — safe to re-run.
-- ============================================================

-- ── 1. usage_logs: search-term + success/failure tracking ────
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS query   TEXT,
  ADD COLUMN IF NOT EXISTS success BOOLEAN;

-- Indexes for the two analytics queries in the admin dashboard:
--   • "most searched parts"  → group by query
--   • "failed searches"      → filter on success = false
CREATE INDEX IF NOT EXISTS idx_usage_logs_query
  ON usage_logs (LOWER(query))
  WHERE query IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_logs_failed
  ON usage_logs (created_at DESC)
  WHERE success = FALSE;

-- ── 2. spare_parts: phase-2 ecommerce columns ────────────────
--  Nullable so existing rows aren't impacted.
ALTER TABLE spare_parts
  ADD COLUMN IF NOT EXISTS offer_price   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stock_qty     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_id     UUID,
  ADD COLUMN IF NOT EXISTS delivery_days INTEGER;

-- ── 3. Daily free-tier reset (pg_cron) ───────────────────────
--  pg_cron must be enabled first:
--    Supabase → Database → Extensions → enable "pg_cron"
--  Then run this block. It is commented out so this migration
--  succeeds on projects where pg_cron isn't enabled yet.
--
-- SELECT cron.schedule(
--   'reset-daily-queries',
--   '30 18 * * *',  -- 18:30 UTC = 00:00 IST
--   $$ UPDATE user_subscriptions
--      SET queries_used = 0
--      WHERE plan = 'free' $$
-- );
