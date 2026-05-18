// ============================================================
//  lib/supabase.js  —  shared Supabase clients
//
//  `supabase`     → service-role client (bypasses RLS)
//  `supabaseAnon` → anon client used for JWT verification & auth calls
// ============================================================

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
