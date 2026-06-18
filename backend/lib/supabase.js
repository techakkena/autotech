import { createClient } from "@supabase/supabase-js";
import ws from "ws";

global.WebSocket = ws;

const supabaseUrl = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "placeholder-service-key";
const anonKey = process.env.SUPABASE_ANON_KEY || "placeholder-anon-key";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase env vars are missing. Server will start for health checks, but database-backed routes require SUPABASE_URL, SUPABASE_SERVICE_KEY, and SUPABASE_ANON_KEY."
  );
}

const supabaseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

export const supabase = createClient(supabaseUrl, serviceKey, supabaseOptions);
export const supabaseAnon = createClient(supabaseUrl, anonKey, supabaseOptions);
