// ============================================================
//  middleware/auth.js  —  Auth, Admin Guard & Usage Tracker
//
//  requireAuth  → verify Supabase JWT on every protected route
//  requireAdmin → check user has admin role in DB
//  trackUsage   → count searches; block free users over limit
// ============================================================

import { supabase, supabaseAnon } from "../lib/supabase.js";

// ── requireAuth ───────────────────────────────────────────────
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authorization header missing. Login first.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data, error } = await supabaseAnon.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session. Please login again.",
      });
    }

    req.user = data.user;
    req.token = token;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Auth check failed" });
  }
}


// ── optionalAuth ──────────────────────────────────────────────
//  Attaches req.user when a valid Supabase JWT is present, but never
//  rejects anonymous or expired sessions. Use for routes that can work
//  publicly while still tracking usage for logged-in users.
export async function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (!error && data?.user) {
      req.user = data.user;
      req.token = token;
    }
  } catch (err) {
    console.warn("Optional auth skipped:", err.message);
  }

  return next();
}

// ── requireAdmin ──────────────────────────────────────────────
//  Checks the admins table. Run AFTER requireAuth.
export async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  try {
    const { data, error } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error || !data) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
    }

    next();
  } catch {
    return res.status(500).json({ success: false, error: "Admin check failed" });
  }
}

// ── trackUsage ────────────────────────────────────────────────
//  Free-tier: enforce daily limit, increment counter.
//  Paid:      pass through.
//  Run AFTER requireAuth. Does NOT write usage_logs — the route
//  handler calls logUsage() once it knows query + success.
export async function trackUsage(req, res, next) {
  if (!req.user) return next();

  try {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan, queries_used, queries_limit")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (!sub || sub.plan === "paid") return next();

    const limit = sub.queries_limit || 20;
    const used  = sub.queries_used  || 0;

    if (used >= limit) {
      return res.status(429).json({
        success: false,
        error: `Daily search limit of ${limit} reached. Upgrade to continue.`,
        upgrade_required: true,
        queries_used: used,
        queries_limit: limit,
      });
    }

    await supabase
      .from("user_subscriptions")
      .update({ queries_used: used + 1 })
      .eq("user_id", req.user.id);

    next();
  } catch (err) {
    console.error("Usage tracking error:", err.message);
    next();
  }
}

// ── logUsage ──────────────────────────────────────────────────
//  Fire-and-forget write to usage_logs. Called from route
//  handlers AFTER the search/identify result is known.
//
//    logUsage(req, { action: "text_search", query: "brake pad", success: true });
//
//  Never throws — analytics must not break the user request.
export async function logUsage(req, { action, query, success }) {
  if (!req.user) return;
  try {
    await supabase.from("usage_logs").insert({
      user_id:    req.user.id,
      action,
      query:      query || null,
      success:    success ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("logUsage error:", err.message);
  }
}
