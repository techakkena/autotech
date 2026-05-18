// ============================================================
//  routes/auth.js  —  Login / OTP / Session helpers
//
//  POST /api/auth/otp/send       → send OTP to phone
//  POST /api/auth/otp/verify     → verify OTP, return session
//  POST /api/auth/email/login    → magic link / password login
//  GET  /api/auth/me             → get current user + plan
//  POST /api/auth/logout         → invalidate session
//
//  Note: Supabase handles OTP delivery and verification.
//  We just proxy the calls and return user info + plan.
// ============================================================

import { Router } from "express";
import { supabase, supabaseAnon } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── POST /api/auth/otp/send ───────────────────────────────────
//  Send a 6-digit OTP to the user's phone via Supabase + Twilio.
//  In free tier, Supabase handles SMS (limited to ~30/day).
//  Body: { phone: "+919876543210" }
router.post("/otp/send", async (req, res) => {
  const { phone } = req.body;

  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      error: "Provide a valid phone number with country code e.g. +919876543210",
    });
  }

  try {
    const { error } = await supabaseAnon.auth.signInWithOtp({ phone });

    if (error) throw error;

    return res.json({
      success: true,
      message: `OTP sent to ${phone}`,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/otp/verify ─────────────────────────────────
//  Verify the 6-digit OTP. On success returns a session token
//  which the frontend stores and sends in every future request.
//  Body: { phone: "+919876543210", token: "123456" }
router.post("/otp/verify", async (req, res) => {
  const { phone, token } = req.body;

  if (!phone || !token) {
    return res.status(400).json({ success: false, error: "phone and token required" });
  }

  try {
    const { data, error } = await supabaseAnon.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) throw error;

    // Ensure user has a subscription record (create free plan if new)
    await ensureSubscription(data.user.id);

    return res.json({
      success: true,
      session: data.session,      // contains access_token and refresh_token
      user: sanitizeUser(data.user),
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/email/login ────────────────────────────────
//  Send a magic link to the user's email (passwordless login).
//  Body: { email: "user@example.com" }
router.post("/email/login", async (req, res) => {
  const { email } = req.body;

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ success: false, error: "Valid email required" });
  }

  try {
    const { error } = await supabaseAnon.auth.signInWithOtp({ email });

    if (error) throw error;

    return res.json({
      success: true,
      message: `Magic link sent to ${email}. Check your inbox.`,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
//  Returns the current user's profile + subscription plan.
//  Requires: Authorization: Bearer <access_token> header.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan, queries_used, queries_limit, expires_at")
      .eq("user_id", req.user.id)
      .single();

    return res.json({
      success: true,
      user: sanitizeUser(req.user),
      subscription: sub || { plan: "free", queries_used: 0, queries_limit: 20 },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post("/logout", requireAuth, async (_req, res) => {
  await supabaseAnon.auth.signOut();
  return res.json({ success: true, message: "Logged out" });
});

// ── Helper: Create free plan if user is new ───────────────────
async function ensureSubscription(userId) {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!data) {
    await supabase.from("user_subscriptions").insert({
      user_id: userId,
      plan: "free",
      queries_used: 0,
      queries_limit: 20,   // free users get 20 searches/day
    });
  }
}

// ── POST /api/auth/register ───────────────────────────────────
//  Email + password signup for end users.
//  Returns a session immediately if Supabase email confirmation
//  is disabled (Dashboard → Authentication → Sign In/Up).
//  Body: { email, password }
router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  try {
    const { data, error } = await supabaseAnon.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user) await ensureSubscription(data.user.id);

    if (!data.session) {
      return res.json({
        success: true,
        pendingConfirmation: true,
        message: "Account created. Please check your email to confirm before signing in.",
        user: data.user ? sanitizeUser(data.user) : null,
      });
    }

    return res.json({
      success: true,
      session: data.session,
      user: sanitizeUser(data.user),
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
//  Email + password login for end users.
//  Body: { email, password }
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password required" });
  }

  try {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await ensureSubscription(data.user.id);

    return res.json({
      success: true,
      session: data.session,
      user: sanitizeUser(data.user),
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: err.message });
  }
});

// ── POST /api/auth/admin/login ────────────────────────────────
//  Admin panel login with email + password.
//  Returns session only if the user exists in the admins table.
//  Body: { email: "admin@co.com", password: "secret" }
router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: "Email and password required" });
  }

  try {
    // Sign in via Supabase email+password
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Check the user is actually in the admins table
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", data.user.id)
      .single();

    if (!adminRow) {
      // Valid Supabase user but not an admin — sign them out and reject
      await supabaseAnon.auth.signOut();
      return res.status(403).json({ success: false, error: "Not authorised as admin" });
    }

    return res.json({
      success: true,
      session: data.session,   // access_token + refresh_token
      user: sanitizeUser(data.user),
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: err.message });
  }
});

// ── Helper: Remove sensitive fields before returning user ─────
function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    created_at: user.created_at,
  };
}

export default router;
