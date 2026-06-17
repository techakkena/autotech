// ============================================================
//  App.jsx  —  AutoSpares User Frontend
//  Single-file React app. Replace src/App.jsx with this.
//
//  Screens:
//   • Home        — big photo upload + text search
//   • Login       — OTP (phone) or email magic link
//   • Results     — matched spare parts grid
//   • Detail      — full spare part detail card
//   • Limit Wall  — upgrade prompt when free tier used up
// ============================================================

import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

// ── API helpers ───────────────────────────────────────────────
async function api(path, options = {}) {
  const token = localStorage.getItem("as_user_token");
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

async function apiForm(path, formData) {
  const token = localStorage.getItem("as_user_token");
  const headers = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API}${path}${separator}_=${Date.now()}`, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ── Format Indian currency ────────────────────────────────────
const inr = (n) =>
  "₹" + parseFloat(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

// ── Search history disabled: always clear localStorage-backed history ────
const HISTORY_KEY = "as_search_history";
function loadHistory() {
  localStorage.removeItem(HISTORY_KEY);
  return [];
}


function addHistory() {
  localStorage.removeItem(HISTORY_KEY);
  return [];
}


function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const css = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Epilogue:wght@300;400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:      #f5f2eb;
  --bg2:     #edeadf;
  --bg3:     #e4e0d3;
  --ink:     #1a1814;
  --ink2:    #4a4740;
  --ink3:    #8a8680;
  --accent:  #c8401a;
  --accent2: #e8571f;
  --gold:    #b8860b;
  --success: #2e7d50;
  --border:  rgba(26,24,20,.12);
  --border2: rgba(26,24,20,.22);
  --radius:  12px;
  --font:    'Epilogue', sans-serif;
  --display: 'Syne', sans-serif;
  --shadow:  0 2px 12px rgba(26,24,20,.10);
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
  font-size: 15px;
  min-height: 100vh;
}

/* ── Topbar ── */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--border);
  background: var(--bg); position: sticky; top: 0; z-index: 20;
}
.logo {
  font-family: var(--display); font-size: 19px; font-weight: 700;
  letter-spacing: -.4px; color: var(--ink);
  display: flex; align-items: center; gap: 8px;
}
.logo-mark {
  width: 28px; height: 28px; background: var(--accent); border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #fff;
}
.top-actions { display: flex; gap: 10px; align-items: center; }
.top-plan {
  font-size: 11px; padding: 3px 9px; border-radius: 20px; font-weight: 500;
  background: var(--bg3); color: var(--ink2); border: 1px solid var(--border);
}
.top-plan.paid { background: #fef3e2; color: var(--gold); border-color: rgba(184,134,11,.25); }

/* ── Buttons ── */
.btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 20px; border-radius: 9px; font-size: 14px;
  font-weight: 500; cursor: pointer; border: none;
  font-family: var(--font); transition: all .15s; text-decoration: none;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent2); }
.btn-outline {
  background: transparent; color: var(--ink);
  border: 1px solid var(--border2);
}
.btn-outline:hover { background: var(--bg3); }
.btn-sm { padding: 7px 14px; font-size: 13px; }
.btn:disabled { opacity: .45; cursor: not-allowed; }

/* ── Hero / Home ── */
.hero { max-width: 680px; margin: 0 auto; padding: 48px 24px 32px; }
.hero-label {
  font-size: 12px; text-transform: uppercase; letter-spacing: .1em;
  color: var(--accent); font-weight: 500; margin-bottom: 14px;
}
.hero-title {
  font-family: var(--display); font-size: clamp(32px, 6vw, 52px);
  font-weight: 800; line-height: 1.08; letter-spacing: -.5px;
  margin-bottom: 16px; color: var(--ink);
}
.hero-title span { color: var(--accent); }
.hero-sub { font-size: 16px; color: var(--ink2); line-height: 1.6; margin-bottom: 36px; }

/* ── Upload zone ── */
.upload-zone {
  border: 2px dashed var(--border2); border-radius: 16px;
  padding: 40px 24px; text-align: center; cursor: pointer;
  background: var(--bg2); transition: all .2s; margin-bottom: 20px;
  position: relative; overflow: hidden;
}
.upload-zone:hover, .upload-zone.drag {
  border-color: var(--accent); background: #fdf5f2;
}
.upload-zone.has-image {
  border-style: solid; border-color: var(--accent); padding: 0;
}
.upload-icon {
  font-size: 44px; margin-bottom: 12px; display: block;
  filter: grayscale(.3);
}
.upload-title {
  font-family: var(--display); font-size: 18px; font-weight: 600;
  margin-bottom: 6px;
}
.upload-sub { font-size: 13px; color: var(--ink3); }
.upload-preview {
  width: 100%; max-height: 280px; object-fit: contain;
  border-radius: 14px; display: block;
}
.upload-change {
  position: absolute; bottom: 12px; right: 12px;
  background: rgba(26,24,20,.7); color: #fff; border: none;
  border-radius: 7px; padding: 6px 12px; font-size: 12px;
  cursor: pointer; font-family: var(--font);
}

/* ── Divider OR ── */
.or-row {
  display: flex; align-items: center; gap: 12px;
  margin: 20px 0; color: var(--ink3); font-size: 13px;
}
.or-row::before, .or-row::after {
  content: ''; flex: 1; height: 1px; background: var(--border);
}

/* ── Search bar ── */
.search-wrap { position: relative; }
.search-input {
  width: 100%; padding: 14px 52px 14px 18px;
  background: var(--bg2); border: 1px solid var(--border2);
  border-radius: 11px; font-size: 15px; color: var(--ink);
  font-family: var(--font); outline: none; transition: border-color .15s;
}
.search-input:focus { border-color: var(--accent); background: #fff; }
.search-input::placeholder { color: var(--ink3); }

.history-section { margin-top: 22px; }
.history-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.history-title {
  font-family: var(--display); font-size: 12px; font-weight: 600;
  color: var(--ink3); letter-spacing: .08em; text-transform: uppercase;
}
.history-clear {
  background: none; border: none; cursor: pointer; padding: 4px 8px;
  font-family: var(--font); font-size: 12px; color: var(--ink3);
  border-radius: 6px;
}
.history-clear:hover { color: var(--accent); background: var(--bg2); }
.history-list { display: flex; flex-wrap: wrap; gap: 8px; }
.history-chip {
  display: inline-flex; align-items: center; gap: 8px;
  background: #fff; border: 1px solid var(--border); border-radius: 999px;
  padding: 7px 14px; cursor: pointer; transition: all .15s;
  font-size: 13px; color: var(--ink2); max-width: 100%;
}
.history-chip:hover { border-color: var(--accent); color: var(--ink); }
.history-chip-icon { font-size: 13px; flex-shrink: 0; }
.history-chip-q {
  font-weight: 500; max-width: 220px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.history-chip-meta { color: var(--ink3); font-size: 11px; flex-shrink: 0; }
.search-btn {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: var(--accent); color: #fff; border: none; border-radius: 8px;
  width: 36px; height: 36px; cursor: pointer; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
}
.search-btn:hover { background: var(--accent2); }

/* ── Results ── */
.results-wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
.results-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px;
}
.results-title { font-family: var(--display); font-size: 20px; font-weight: 700; }
.results-count { font-size: 13px; color: var(--ink3); }
.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr)); gap: 16px; }
.part-card {
  background: #fff; border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden; cursor: pointer;
  transition: all .2s; box-shadow: var(--shadow);
}
.part-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(26,24,20,.14); border-color: var(--border2); }
.part-img {
  width: 100%; height: 160px; object-fit: cover;
  background: var(--bg2); display: block;
}
.part-img-placeholder {
  width: 100%; height: 160px; background: var(--bg2);
  display: flex; align-items: center; justify-content: center;
  font-size: 48px;
}
.part-body { padding: 14px; }
.part-num { font-family: var(--display); font-size: 11px; font-weight: 600; color: var(--accent); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 4px; }
.part-name { font-weight: 500; font-size: 14px; line-height: 1.4; margin-bottom: 6px; color: var(--ink); }
.part-brand { font-size: 12px; color: var(--ink3); margin-bottom: 10px; }
.part-price-row { display: flex; align-items: baseline; justify-content: space-between; }
.part-mrp { font-family: var(--display); font-size: 18px; font-weight: 700; color: var(--ink); }
.part-gst { font-size: 11px; color: var(--ink3); }
.part-cat { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: var(--bg3); color: var(--ink2); display: inline-block; margin-bottom: 8px; }

/* ── Part Detail ── */
.detail-wrap { max-width: 720px; margin: 0 auto; padding: 24px; }
.detail-back { display: inline-flex; align-items: center; gap: 6px; color: var(--ink3); font-size: 13px; cursor: pointer; margin-bottom: 20px; }
.detail-back:hover { color: var(--ink); }
.detail-card { background: #fff; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow); }
.detail-imgs { background: var(--bg2); height: 280px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.detail-imgs img { width: 100%; height: 100%; object-fit: contain; }
.detail-body { padding: 24px; }
.detail-toprow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.detail-name { font-family: var(--display); font-size: 22px; font-weight: 700; line-height: 1.2; }
.detail-partno { font-size: 12px; color: var(--accent); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 4px; }
.detail-brand { font-size: 14px; color: var(--ink2); margin-bottom: 16px; }
.detail-divider { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.detail-field { }
.df-label { font-size: 11px; color: var(--ink3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
.df-val { font-size: 15px; font-weight: 500; color: var(--ink); }
.df-val.price { font-family: var(--display); font-size: 22px; font-weight: 800; color: var(--accent); }
.detail-app { background: var(--bg2); border-radius: 9px; padding: 12px 14px; margin-top: 16px; font-size: 13px; color: var(--ink2); line-height: 1.6; }
.detail-app-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink3); margin-bottom: 4px; }

/* ── Login screen ── */
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); padding: 24px; }
.login-card { width: 100%; max-width: 400px; background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 36px; box-shadow: var(--shadow); }
.login-icon { font-size: 36px; margin-bottom: 12px; }
.login-title { font-family: var(--display); font-size: 24px; font-weight: 700; margin-bottom: 6px; }
.login-sub { font-size: 14px; color: var(--ink3); margin-bottom: 28px; line-height: 1.5; }
.tab-row { display: flex; background: var(--bg2); border-radius: 9px; padding: 3px; margin-bottom: 22px; }
.tab { flex: 1; text-align: center; padding: 8px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--ink3); transition: all .15s; }
.tab.active { background: #fff; color: var(--ink); box-shadow: 0 1px 4px rgba(0,0,0,.08); }
.form-group { margin-bottom: 14px; }
.form-label { font-size: 12px; color: var(--ink3); font-weight: 500; margin-bottom: 5px; display: block; }
.form-input {
  width: 100%; padding: 11px 14px; background: var(--bg2);
  border: 1px solid var(--border2); border-radius: 9px;
  font-size: 14px; color: var(--ink); font-family: var(--font);
  outline: none; transition: border-color .15s;
}
.form-input:focus { border-color: var(--accent); background: #fff; }
.otp-row { display: flex; gap: 8px; }
.otp-input { flex: 1; }
.otp-boxes { display: flex; gap: 8px; margin-top: 14px; }
.otp-box {
  flex: 1; height: 52px; background: var(--bg2); border: 1px solid var(--border2);
  border-radius: 9px; text-align: center; font-size: 20px; font-family: var(--display);
  font-weight: 700; color: var(--ink); outline: none;
}
.otp-box:focus { border-color: var(--accent); background: #fff; }

/* ── Limit wall ── */
.limit-wrap { min-height: 60vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.limit-card { background: #fff; border: 1px solid var(--border); border-radius: 18px; padding: 40px; text-align: center; max-width: 420px; box-shadow: var(--shadow); }
.limit-icon { font-size: 48px; margin-bottom: 16px; }
.limit-title { font-family: var(--display); font-size: 22px; font-weight: 700; margin-bottom: 10px; }
.limit-sub { font-size: 14px; color: var(--ink3); line-height: 1.6; margin-bottom: 24px; }
.limit-price { font-family: var(--display); font-size: 32px; font-weight: 800; color: var(--accent); margin-bottom: 4px; }
.limit-plan-sub { font-size: 13px; color: var(--ink3); margin-bottom: 24px; }

/* ── Loading / empty / error states ── */
.spinner-wrap { display: flex; align-items: center; justify-content: center; padding: 60px; flex-direction: column; gap: 14px; }
.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinner-label { font-size: 14px; color: var(--ink3); }
.empty-state { text-align: center; padding: 60px 24px; color: var(--ink3); }
.empty-icon { font-size: 48px; margin-bottom: 14px; }
.empty-title { font-family: var(--display); font-size: 18px; font-weight: 600; color: var(--ink2); margin-bottom: 6px; }
.error-bar { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 9px; padding: 10px 14px; font-size: 13px; color: #b91c1c; margin-bottom: 14px; }

/* ── Animations ── */
@keyframes fadeUp { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: translateY(0); } }
.fade-up { animation: fadeUp .35s ease both; }
.fade-up-1 { animation-delay: .05s; }
.fade-up-2 { animation-delay: .12s; }
.fade-up-3 { animation-delay: .20s; }

/* ── Misc ── */
.usage-bar-wrap { background: var(--bg3); border-radius: 20px; height: 5px; width: 120px; overflow: hidden; }
.usage-bar { height: 100%; background: var(--accent); border-radius: 20px; transition: width .3s; }
.usage-row { display: flex; align-items: center; gap: 8px; }
.usage-label { font-size: 11px; color: var(--ink3); }

/* ── Landing page ── */
.landing-wrap {
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 40px 24px;
  background: var(--bg);
}
.landing-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.landing-tagline { font-size: 15px; color: var(--ink3); margin-bottom: 56px; text-align: center; }
.portal-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px; max-width: 600px; width: 100%;
}
.portal-card {
  background: #fff; border: 1.5px solid var(--border); border-radius: 20px;
  padding: 40px 28px; cursor: pointer; transition: all .2s; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.portal-card:hover {
  border-color: var(--accent); box-shadow: 0 8px 32px rgba(200,64,26,.12);
  transform: translateY(-3px);
}
.portal-icon {
  width: 68px; height: 68px; border-radius: 18px;
  display: flex; align-items: center; justify-content: center; font-size: 30px;
}
.portal-icon.customer { background: #fef5f2; }
.portal-icon.admin { background: #f0f4ff; }
.portal-title { font-family: var(--display); font-size: 20px; font-weight: 700; color: var(--ink); }
.portal-desc { font-size: 13.5px; color: var(--ink3); line-height: 1.55; }
.portal-card .btn { margin-top: 6px; width: 100%; justify-content: center; }
`;

// ═══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════
function Login({ onLogin, onBack }) {
  const [mode, setMode] = useState("signin"); // signin | register | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  function switchMode(next) {
    setMode(next); setErr(""); setNotice(""); setPassword(""); setConfirm("");
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setNotice("");

    if (mode === "forgot") {
      if (!email) { setErr("Enter your email"); return; }
      setLoading(true);
      try {
        const data = await api("/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setNotice(data.message || "Check your email for a password reset link.");
      } catch (e) {
        setErr(e.error || e.message || "Could not send reset email");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) { setErr("Email and password are required"); return; }
    if (mode === "register") {
      if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
      if (password !== confirm) { setErr("Passwords do not match"); return; }
    }
    setLoading(true);
    try {
      const path = mode === "register" ? "/auth/register" : "/auth/login";
      const data = await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (data.session?.access_token) {
        localStorage.setItem("as_user_token", data.session.access_token);
        onLogin(data.user);
      } else if (data.pendingConfirmation) {
        setNotice(data.message || "Check your email to confirm your account.");
      } else {
        setErr("Unexpected response from server");
      }
    } catch (e) {
      setErr(e.error || e.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = mode === "register"
    ? (loading ? "Creating account…" : "Create account")
    : mode === "forgot"
    ? (loading ? "Sending reset link…" : "Send reset link")
    : (loading ? "Signing in…" : "Sign in");

  return (
    <div className="login-wrap">
      <form className="login-card fade-up" onSubmit={submit}>
        {onBack && (
          <div className="detail-back" style={{ marginBottom: 16 }} onClick={onBack}>
            ← Back to home
          </div>
        )}
        <div className="login-icon">🔩</div>
        <div className="login-title">Auto Tech</div>
        <div className="login-sub">Identify any spare part instantly — search by photo, part number or description.</div>

        {mode !== "forgot" && (
          <div className="tab-row">
            <div className={`tab ${mode === "signin" ? "active" : ""}`} onClick={() => switchMode("signin")}>Sign in</div>
            <div className={`tab ${mode === "register" ? "active" : ""}`} onClick={() => switchMode("register")}>Register</div>
          </div>
        )}

        {mode === "forgot" && (
          <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 18 }}>
            Enter the email on your account and we'll send a link to reset your password.
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Email address</label>
          <input className="form-input" type="email" placeholder="you@example.com" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} required />
        </div>

        {mode !== "forgot" && (
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
        )}

        {mode === "register" && (
          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <input className="form-input" type="password" placeholder="••••••••" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
        )}

        {mode === "signin" && (
          <div style={{ textAlign: "right", marginBottom: 14, marginTop: -4 }}>
            <span
              onClick={() => switchMode("forgot")}
              style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer", fontWeight: 500 }}
            >
              Forgot password?
            </span>
          </div>
        )}

        {err && <div className="error-bar">{err}</div>}
        {notice && <div className="error-bar" style={{ background: "rgba(52,201,122,0.12)", borderColor: "rgba(52,201,122,0.4)", color: "#7ad99e" }}>{notice}</div>}

        <button className="btn btn-primary" style={{ width: "100%" }} type="submit" disabled={loading}>
          {submitLabel}
        </button>

        {mode === "forgot" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span
              onClick={() => switchMode("signin")}
              style={{ fontSize: 13, color: "var(--ink3)", cursor: "pointer" }}
            >
              ← Back to sign in
            </span>
          </div>
        )}
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RESET PASSWORD SCREEN
// ═══════════════════════════════════════════════════════════════
function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setErr("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setDone(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card fade-up" onSubmit={submit}>
        <div className="login-icon">🔐</div>
        <div className="login-title">Reset password</div>
        <div className="login-sub">Pick a new password for your account.</div>

        {done ? (
          <>
            <div className="error-bar" style={{ background: "rgba(52,201,122,0.12)", borderColor: "rgba(52,201,122,0.4)", color: "#7ad99e" }}>
              Password updated successfully. You can now sign in with your new password.
            </div>
            <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={onDone}>
              Continue to sign in
            </button>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">New password</label>
              <input className="form-input" type="password" placeholder="••••••••" autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm new password</label>
              <input className="form-input" type="password" placeholder="••••••••" autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>

            {err && <div className="error-bar">{err}</div>}

            <button className="btn btn-primary" style={{ width: "100%" }} type="submit" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  HOME SCREEN
// ═══════════════════════════════════════════════════════════════
function Home({ onResults, onIdentifyResults, subscription }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const fileRef = useRef();
  const identifyRequestRef = useRef(0);

  function pickFile(f) {
    if (!f || !f.type.startsWith("image/")) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setQ("");
    setErr("");
  }

  async function identify() {
    if (!file) return;
    const requestId = Date.now();
    identifyRequestRef.current = requestId;
    clearHistory();
    setHistory([]);
    setErr(""); setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      // Photo identification must use only this uploaded image. Do not pass
      // the text-search box value here; stale text/history can make the
      // backend return the same DB search results for every photo.
      fd.append("upload_id", String(requestId));
      const photoIdentifyResponse = await apiForm("/identify", fd);
      if (identifyRequestRef.current !== requestId) return;

      const identifyResults = photoIdentifyResponse.results || [];
      if (photoIdentifyResponse.identified === false || identifyResults.length === 0) {
        setErr(
          photoIdentifyResponse.message ||
          "No database match found for this uploaded photo. Try a clearer image or use text search below."
        );
        return;
      }

      onIdentifyResults(identifyResults, photoIdentifyResponse.search_terms_used, photoIdentifyResponse.query_used);
    } catch (e) {
      if (identifyRequestRef.current !== requestId) return;
      if (e.status === 429) { onResults([], "", true); return; }
      setErr(e.error || "Identification failed. Try again.");
    } finally {
      if (identifyRequestRef.current === requestId) setUploading(false);
    }
  }

  async function search(overrideQ) {
    const text = (overrideQ ?? q).trim();
    if (!text) return;
    if (overrideQ !== undefined) setQ(text);
    setErr(""); setSearching(true);
    try {
      const data = await api(`/parts/search?q=${encodeURIComponent(text)}&limit=20`);
      setHistory(addHistory({
        type: "text",
        query: text,
        result_count: data.results?.length || 0,
      }));
      onResults(data.results, text, false, data.total);
    } catch (e) {
      if (e.status === 429) { onResults([], "", true); return; }
      setErr(e.error || "Search failed.");
    }
    setSearching(false);
  }

  function handleHistoryClear() {
    clearHistory();
    setHistory([]);
  }

  const used = subscription?.queries_used || 0;
  const limit = subscription?.queries_limit || 20;
  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="hero">
      <div className="hero-label fade-up">Automobile Spare Parts Guide</div>
      <h1 className="hero-title fade-up fade-up-1">Find any part.<br /><span>In seconds.</span></h1>
      <p className="hero-sub fade-up fade-up-2">
        Upload a photo of any automobile spare part to instantly get the part name and details.
      </p>

      {/* Upload zone */}
      <div className="fade-up fade-up-3">
        <div
          className={`upload-zone ${drag ? "drag" : ""} ${preview ? "has-image" : ""}`}
          onClick={() => !preview && fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
        >
          {preview ? (
            <>
              <img src={preview} className="upload-preview" alt="Selected spare part" />
              <button className="upload-change" onClick={e => {
                e.stopPropagation();
                if (preview) URL.revokeObjectURL(preview);
                setPreview(null);
                setFile(null);
                setQ("");
                if (fileRef.current) fileRef.current.value = "";
              }}>
                Change photo
              </button>
            </>
          ) : (
            <>
              <span className="upload-icon">📷</span>
              <div className="upload-title">Take or upload a photo</div>
              <div className="upload-sub">Tap to open camera · or drag an image here</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => pickFile(e.target.files[0])} />

        {preview && (
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px" }}
            onClick={identify} disabled={uploading}>
            {uploading
              ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> Identifying…</>
              : "🔍 Identify this part"}
          </button>
        )}

        {err && <div className="error-bar" style={{ marginTop: 12 }}>{err}</div>}

        <div className="or-row">or search by text</div>

        <div className="search-wrap">
          <input className="search-input" placeholder="Enter part number, brand or description…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()} />
          <button className="search-btn" onClick={() => search()} disabled={searching}>
            {searching ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} /> : "↵"}
          </button>
        </div>

        {/* Recent searches — last 24h, stored locally */}
        {history.length > 0 && (
          <div className="history-section">
            <div className="history-head">
              <span className="history-title">Recent searches</span>
              <button className="history-clear" onClick={handleHistoryClear}>Clear</button>
            </div>
            <div className="history-list">
              {history.map((h) => (
                <button
                  key={h.timestamp}
                  className="history-chip"
                  title={`${h.result_count} result${h.result_count === 1 ? "" : "s"} · ${timeAgo(h.timestamp)}`}
                  onClick={() => search(h.query)}
                >
                  <span className="history-chip-icon">{h.type === "identify" ? "📷" : "🔍"}</span>
                  <span className="history-chip-q">{h.query}</span>
                  <span className="history-chip-meta">{timeAgo(h.timestamp)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Usage indicator for free users */}
        {subscription?.plan === "free" && (
          <div className="usage-row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            <span className="usage-label">{used}/{limit} searches used today</span>
            <div className="usage-bar-wrap">
              <div className="usage-bar" style={{ width: pct + "%" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RESULTS SCREEN
// ═══════════════════════════════════════════════════════════════
function Results({ results, query, total, onSelect, onBack }) {
  return (
    <div className="results-wrap">
      <div className="results-head">
        <div>
          <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button>
          <div className="results-title">{query ? `Results for "${query}"` : "Identified parts"}</div>
          {total > results.length && (
            <div className="results-count">{total} total — showing first {results.length}</div>
          )}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">No parts found</div>
          <div>Try a different part number or description</div>
        </div>
      ) : (
        <div className="results-grid">
          {results.map((p, i) => (
            <div key={p.id} className="part-card fade-up" style={{ animationDelay: i * 0.04 + "s" }}
              onClick={() => onSelect(p)}>
              {p.primary_image
                ? <img src={p.primary_image} className="part-img" alt={p.description} />
                : <div className="part-img-placeholder">🔩</div>}
              <div className="part-body">
                <div className="part-num">{p.part_number}</div>
                <div className="part-name">{p.description}</div>
                <div className="part-brand">
                  <strong>{p.company_brand}</strong>
                  {p.manufacturer_name && <span style={{ color: "var(--ink3)" }}> · {p.manufacturer_name}</span>}
                </div>
                {p.category && <span className="part-cat">{p.category}</span>}
                <div className="part-price-row">
                  <div className="part-mrp">{inr(p.mrp)}</div>
                  <div className="part-gst">GST {p.gst_rate}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PART DETAIL SCREEN
// ═══════════════════════════════════════════════════════════════
function Detail({ partId, partPreview, onBack }) {
  const [part, setPart] = useState(partPreview || null);
  const [loading, setLoading] = useState(!partPreview);

  useEffect(() => {
    if (partId) {
      api(`/parts/${partId}`)
        .then(d => setPart(d.part))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [partId]);

  if (loading) return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <div className="spinner-label">Loading part details…</div>
    </div>
  );

  if (!part) return <div className="empty-state"><div className="empty-icon">⚠️</div><div>Part not found</div></div>;

  const basic = parseFloat(part.basic_price) || 0;
  const gstAmt = basic > 0 ? (basic * parseFloat(part.gst_rate)) / 100 : null;

  return (
    <div className="detail-wrap">
      <div className="detail-back" onClick={onBack}>← Back to results</div>
      <div className="detail-card fade-up">
        <div className="detail-imgs">
          {part.primary_image
            ? <img src={part.primary_image} alt={part.description} />
            : <span style={{ fontSize: 80 }}>🔩</span>}
        </div>
        <div className="detail-body">
          <div className="detail-partno">{part.part_number}</div>
          <div className="detail-toprow">
            <div className="detail-name">{part.description}</div>
            {part.category && <span className="part-cat" style={{ flexShrink: 0 }}>{part.category}</span>}
          </div>
          <div className="detail-brand">
            <strong>{part.company_brand}</strong>
            {part.manufacturer_name && <span style={{ color: "var(--ink3)" }}> — {part.manufacturer_name}</span>}
          </div>

          <hr className="detail-divider" />

          <div className="detail-grid">
            <div className="detail-field">
              <div className="df-label">MRP (incl. GST)</div>
              <div className="df-val price">{inr(part.mrp)}</div>
            </div>
            {basic > 0 && (
              <div className="detail-field">
                <div className="df-label">Basic price</div>
                <div className="df-val">{inr(basic)}</div>
              </div>
            )}
            <div className="detail-field">
              <div className="df-label">GST rate</div>
              <div className="df-val">{part.gst_rate}%</div>
            </div>
            {gstAmt !== null && (
              <div className="detail-field">
                <div className="df-label">GST amount</div>
                <div className="df-val">{inr(gstAmt)}</div>
              </div>
            )}
            {part.hsn_code && (
              <div className="detail-field">
                <div className="df-label">HSN code</div>
                <div className="df-val" style={{ fontFamily: "monospace" }}>{part.hsn_code}</div>
              </div>
            )}
            {part.alternate_part_number && (
              <div className="detail-field" style={{ gridColumn: "1 / -1" }}>
                <div className="df-label">Alternate part number</div>
                <div className="df-val" style={{ fontFamily: "monospace" }}>{part.alternate_part_number}</div>
              </div>
            )}
          </div>

          {part.application && (
            <div className="detail-app">
              <div className="detail-app-label">Application</div>
              {part.application}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LIMIT WALL
// ═══════════════════════════════════════════════════════════════
function LimitWall({ onBack }) {
  return (
    <div className="limit-wrap">
      <div className="limit-card fade-up">
        <div className="limit-icon">🚀</div>
        <div className="limit-title">Daily limit reached</div>
        <div className="limit-sub">
          You've used all your free searches for today. Upgrade to get unlimited searches, photo identification and full part details.
        </div>
        <div className="limit-price">₹199 / month</div>
        <div className="limit-plan-sub">Unlimited searches · Photo ID · Full GST & HSN details</div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px", marginBottom: 10 }}>
          Upgrade now
        </button>
        <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={onBack}>
          Back to search
        </button>
        <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 14 }}>
          Your free quota resets every midnight.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TOPBAR
// ═══════════════════════════════════════════════════════════════
function Topbar({ user, subscription, onLogout, onHome }) {
  return (
    <div className="topbar">
      <div className="logo" onClick={onHome} style={{ cursor: "pointer" }}>
        <div className="logo-mark">⚙</div>
        Auto Tech 
      </div>
      <div className="top-actions">
        {subscription && (
          <span className={`top-plan ${subscription.plan === "paid" ? "paid" : ""}`}>
            {subscription.plan === "paid" ? "✦ Pro" : `Free · ${subscription.queries_used}/${subscription.queries_limit}`}
          </span>
        )}
        {user && (
          <button className="btn btn-outline btn-sm" onClick={onLogout}>Sign out</button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LANDING PAGE — portal selector
// ═══════════════════════════════════════════════════════════════
function Landing({ onCustomer }) {
  const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5174"; // ← this one is fine for local dev

  return (
    <div className="landing-wrap">
      <div className="landing-brand">
        <div className="logo-mark">A</div>
        <span className="logo" style={{ fontSize: 22 }}>AutoSpares</span>
      </div>
      <p className="landing-tagline">Automobile spare parts — search, identify, manage</p>

      <div className="portal-grid">
        <div className="portal-card" onClick={onCustomer}>
          <div className="portal-icon customer">🔍</div>
          <div className="portal-title">Customer Portal</div>
          <p className="portal-desc">Search thousands of auto spare parts by photo or part number. Get instant results.</p>
          <button className="btn btn-primary">Search Parts →</button>
        </div>

        <div className="portal-card" onClick={() => window.open(ADMIN_URL, "_blank")}>
          <div className="portal-icon admin">⚙️</div>
          <div className="portal-title">Admin Portal</div>
          <p className="portal-desc">Manage inventory, add parts, view users, and monitor platform activity.</p>
          <button className="btn btn-outline">Admin Dashboard →</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [screen, setScreen] = useState("home"); // home | results | detail | limit
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [selectedPart, setSelectedPart] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [portalChosen, setPortalChosen] = useState(false);

  // Detect password-recovery hash from Supabase email link
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      if (accessToken) {
        setTimeout(() => setRecoveryToken(accessToken), 0);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Check for existing session on load
  useEffect(() => {
    const token = localStorage.getItem("as_user_token");
    if (token) {
      api("/auth/me")
        .then(d => {
          setUser(d.user);
          setSubscription(d.subscription);
        })
        .catch(() => localStorage.removeItem("as_user_token"))
        .finally(() => setLoadingMe(false));
    } else {
      setTimeout(() => setLoadingMe(false), 0);
    }
  }, []);

  function handleLogin(u) {
    setUser(u);
    // Refresh subscription info after login
    api("/auth/me").then(d => setSubscription(d.subscription)).catch(() => {});
    setScreen("home");
  }

  function handleLogout() {
    localStorage.removeItem("as_user_token");
    clearHistory();
    setUser(null);
    setSubscription(null);
    setScreen("home");
    setPortalChosen(false);
  }

  function handleResults(res, q, limitHit = false, tot = 0) {
    if (limitHit) { setScreen("limit"); return; }
    setResults(res);
    setQuery(q);
    setTotal(tot);
    setScreen("results");
    // Refresh usage count
    if (subscription?.plan === "free") {
      api("/auth/me").then(d => setSubscription(d.subscription)).catch(() => {});
    }
  }

  if (loadingMe) {
    return (
      <>
        <style>{css}</style>
        <div className="spinner-wrap" style={{ minHeight: "100vh" }}>
          <div className="spinner" />
        </div>
      </>
    );
  }

  if (recoveryToken) {
    return (
      <>
        <style>{css}</style>
        <ResetPassword token={recoveryToken} onDone={() => setRecoveryToken(null)} />
      </>
    );
  }

  // Show landing portal-selector for unauthenticated visitors who haven't chosen yet
  if (!user && !portalChosen) {
    return (
      <>
        <style>{css}</style>
        <Landing onCustomer={() => setPortalChosen(true)} />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <style>{css}</style>
        <Login onLogin={handleLogin} onBack={() => setPortalChosen(false)} />
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <Topbar user={user} subscription={subscription} onLogout={handleLogout} onHome={() => setScreen("home")} />

      {screen === "home" && (
        <Home
          onResults={handleResults}
          onIdentifyResults={(res, terms, queryUsed) => handleResults(res, queryUsed || terms?.join(", ") || "Photo", false, res.length)}
          subscription={subscription}
        />
      )}
      {screen === "results" && (
        <Results
          results={results} query={query} total={total}
          onSelect={p => { setSelectedPart(p); setScreen("detail"); }}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "detail" && (
        <Detail
          partId={selectedPart?.id}
          partPreview={selectedPart}
          onBack={() => setScreen("results")}
        />
      )}
      {screen === "limit" && <LimitWall onBack={() => setScreen("home")} />}
    </>
  );
}
