// ============================================================
//  AdminApp.jsx  —  AutoSpares Complete Admin Panel
//  Single-file React app. Replace src/App.jsx with this.
//
//  Screens:
//   • Login         — email + password
//   • Dashboard     — stats: parts, users, searches today
//   • Parts List    — search, paginate, delete
//   • Add Part      — form with multi-image upload
//   • Edit Part     — pre-filled form
//   • Users         — list users, toggle free/paid plan
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Config ────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "/api";

// ── Tiny API helper ───────────────────────────────────────────
async function api(path, options = {}) {
  const token = localStorage.getItem("as_token");
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Multipart helper for forms with files ─────────────────────
async function apiForm(path, formData, method = "POST") {
  const token = localStorage.getItem("as_token");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #0f1117;
    --bg2:      #181c27;
    --bg3:      #1e2333;
    --border:   #2a2f42;
    --text:     #e8eaf0;
    --muted:    #7b82a0;
    --accent:   #4f8ef7;
    --accent2:  #7c5cf7;
    --success:  #34c97a;
    --warn:     #f5a623;
    --danger:   #e85454;
    --radius:   10px;
    --font:     'DM Sans', sans-serif;
    --mono:     'DM Mono', monospace;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }

  /* Layout */
  .layout { display: flex; min-height: 100vh; }
  .sidebar {
    width: 220px; flex-shrink: 0; background: var(--bg2);
    border-right: 1px solid var(--border); display: flex;
    flex-direction: column; padding: 0 0 24px;
    position: sticky; top: 0; height: 100vh; overflow-y: auto;
  }
  .sidebar-logo {
    padding: 22px 20px 18px; font-size: 16px; font-weight: 600;
    letter-spacing: -.3px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px;
  }
  .logo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .sidebar-section { font-size: 10px; color: var(--muted); padding: 18px 20px 6px; text-transform: uppercase; letter-spacing: .08em; }
  .nav-item {
    display: flex; align-items: center; gap: 10px; padding: 9px 20px;
    cursor: pointer; color: var(--muted); font-size: 13px; font-weight: 500;
    border-left: 2px solid transparent; transition: all .15s;
  }
  .nav-item:hover { color: var(--text); background: var(--bg3); }
  .nav-item.active { color: var(--accent); border-left-color: var(--accent); background: rgba(79,142,247,.07); }
  .nav-icon { font-size: 16px; width: 20px; text-align: center; }
  .main { flex: 1; overflow-x: hidden; }
  .topbar {
    padding: 16px 28px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    background: var(--bg); position: sticky; top: 0; z-index: 10;
  }
  .page-title { font-size: 17px; font-weight: 600; }
  .page-body { padding: 24px 28px; }

  /* Cards */
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
  .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
  .stat-val { font-size: 28px; font-weight: 600; font-family: var(--mono); }
  .stat-sub { font-size: 11px; color: var(--muted); margin-top: 4px; }

  /* Table */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 14px; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--border); font-weight: 500; }
  td { padding: 11px 14px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,.02); }

  /* Badges */
  .badge { display: inline-block; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 500; }
  .badge-free { background: rgba(123,130,160,.15); color: var(--muted); }
  .badge-paid { background: rgba(52,201,122,.12); color: var(--success); }
  .badge-cat  { background: rgba(79,142,247,.12); color: var(--accent); }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; font-family: var(--font); transition: all .15s; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #3a7af5; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--muted); }
  .btn-danger { background: rgba(232,84,84,.12); color: var(--danger); border: 1px solid rgba(232,84,84,.2); }
  .btn-danger:hover { background: rgba(232,84,84,.2); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: .45; cursor: not-allowed; }

  /* Forms */
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .form-grid.cols3 { grid-template-columns: 1fr 1fr 1fr; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-group.span2 { grid-column: span 2; }
  .form-group.span3 { grid-column: span 3; }
  label { font-size: 12px; color: var(--muted); font-weight: 500; }
  label .req { color: var(--danger); margin-left: 2px; }
  input, select, textarea {
    background: var(--bg3); border: 1px solid var(--border); border-radius: 7px;
    padding: 9px 12px; color: var(--text); font-family: var(--font); font-size: 13px;
    outline: none; transition: border-color .15s; width: 100%;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 80px; }
  select option { background: var(--bg2); }

  /* Image upload zone */
  .upload-zone {
    border: 1.5px dashed var(--border); border-radius: var(--radius);
    padding: 24px; text-align: center; cursor: pointer; transition: all .15s;
    background: var(--bg3);
  }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--accent); background: rgba(79,142,247,.05); }
  .upload-zone p { font-size: 13px; color: var(--muted); margin-top: 6px; }
  .img-previews { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .img-preview { position: relative; width: 80px; height: 80px; border-radius: 7px; overflow: hidden; border: 1px solid var(--border); }
  .img-preview img { width: 100%; height: 100%; object-fit: cover; }
  .img-preview button { position: absolute; top: 3px; right: 3px; background: rgba(0,0,0,.6); border: none; color: #fff; border-radius: 4px; width: 18px; height: 18px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; }

  /* Search */
  .search-row { display: flex; gap: 10px; margin-bottom: 18px; }
  .search-input { flex: 1; }

  /* Login */
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); }
  .login-card { width: 380px; background: var(--bg2); border: 1px solid var(--border); border-radius: 14px; padding: 36px; }
  .login-logo { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
  .login-sub { font-size: 13px; color: var(--muted); margin-bottom: 28px; }

  /* Toast */
  .toast-wrap { position: fixed; bottom: 24px; right: 24px; display: flex; flex-direction: column; gap: 8px; z-index: 999; }
  .toast { background: var(--bg2); border: 1px solid var(--border); border-radius: 9px; padding: 12px 16px; font-size: 13px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.4); animation: slideIn .2s ease; min-width: 260px; }
  .toast.success { border-color: var(--success); }
  .toast.error   { border-color: var(--danger); }
  @keyframes slideIn { from { transform: translateX(30px); opacity:0; } to { transform: translateX(0); opacity:1; } }

  /* Pagination */
  .pagination { display: flex; align-items: center; gap: 6px; margin-top: 16px; justify-content: flex-end; }
  .page-btn { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
  .page-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .page-btn:hover:not(.active):not(:disabled) { border-color: var(--muted); color: var(--text); }
  .page-btn:disabled { opacity: .35; cursor: not-allowed; }

  /* Part image thumb in table */
  .part-thumb { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); background: var(--bg3); }
  .no-thumb { width: 40px; height: 40px; border-radius: 6px; background: var(--bg3); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 18px; }

  /* Misc */
  .flex { display: flex; }
  .items-center { align-items: center; }
  .gap-8 { gap: 8px; }
  .gap-12 { gap: 12px; }
  .mono { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .empty { text-align: center; padding: 48px; color: var(--muted); font-size: 13px; }
  .loading { text-align: center; padding: 40px; color: var(--muted); }
  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
  .text-danger { color: var(--danger); font-size: 12px; margin-top: 4px; }
  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .confirm-box { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 28px; width: 340px; }
  .confirm-box h3 { font-size: 15px; margin-bottom: 8px; }
  .confirm-box p  { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
  .confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
`;

// ═══════════════════════════════════════════════════════════════
//  TOAST SYSTEM
// ═══════════════════════════════════════════════════════════════
let _addToast = () => {};
function useToasts() {
  const [toasts, setToasts] = useState([]);
  _addToast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return toasts;
}
const toast = (msg, type) => _addToast(msg, type);

// ═══════════════════════════════════════════════════════════════
//  CONFIRM DIALOG
// ═══════════════════════════════════════════════════════════════
function Confirm({ msg, onYes, onNo }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <h3>Are you sure?</h3>
        <p>{msg}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onNo}>Cancel</button>
          <button className="btn btn-danger" onClick={onYes}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════
function Login({ onLogin }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      // Use Supabase anon client via backend or direct
      const res = await fetch(`${API}/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("as_token", data.session.access_token);
      onLogin(data.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">⚙ Auto Tech-Technology for spares</div>
        <div className="login-sub">Admin Portal — sign in to continue</div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Email</label>
          <input type="email" value={form.email} required
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="admin@yourcompany.com" />
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label>Password</label>
          <input type="password" value={form.password} required
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="••••••••" />     
        </div>
        {err && <div className="text-danger" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? <><div className="spinner" /> Signing in…</> : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/admin/stats")
      .then(d => setStats(d.stats))
      .catch(() => toast("Failed to load stats", "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {loading ? <div className="loading">Loading stats…</div> : (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total spare parts</div>
            <div className="stat-val" style={{ color: "var(--accent)" }}>{stats?.total_parts ?? "—"}</div>
            <div className="stat-sub">in catalogue</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Registered users</div>
            <div className="stat-val" style={{ color: "var(--success)" }}>{stats?.total_users ?? "—"}</div>
            <div className="stat-sub">mechanics, retailers, customers</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Searches today</div>
            <div className="stat-val" style={{ color: "var(--warn)" }}>{stats?.searches_today ?? "—"}</div>
            <div className="stat-sub">text + photo identifies</div>
          </div>
        </div>
      )}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Quick actions</div>
        <div className="flex gap-8">
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("nav", { detail: "add-part" }))}>
            + Add spare part
          </button>
          <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("nav", { detail: "parts" }))}>
            View all parts
          </button>
          <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent("nav", { detail: "users" }))}>
            Manage users
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  IMAGE UPLOAD ZONE
// ═══════════════════════════════════════════════════════════════
function ImageUploadZone({ files, setFiles, existingUrls = [], onRemoveExisting }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);

  function addFiles(newFiles) {
    const imgs = Array.from(newFiles).filter(f => f.type.startsWith("image/"));
    setFiles(prev => [...prev, ...imgs].slice(0, 5));
  }

  return (
    <div>
      <div
        className={`upload-zone ${drag ? "drag" : ""}`}
        onClick={() => ref.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <div style={{ fontSize: 28 }}>📷</div>
        <p>Click or drag images here (max 5, 10 MB each)</p>
        <input ref={ref} type="file" accept="image/*" multiple hidden
          onChange={e => addFiles(e.target.files)} />
      </div>
      <div className="img-previews">
        {existingUrls.map((url, i) => (
          <div className="img-preview" key={`ex-${i}`}>
            <img src={url} alt="" />
            <button onClick={() => onRemoveExisting(i)} title="Remove">✕</button>
          </div>
        ))}
        {files.map((f, i) => (
          <div className="img-preview" key={`new-${i}`}>
            <img src={URL.createObjectURL(f)} alt="" />
            <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} title="Remove">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PART FORM  (used for both Add and Edit)
// ═══════════════════════════════════════════════════════════════
const EMPTY_FORM = {
  part_number: "", description: "", application: "",
  mrp: "", basic_price: "", gst_rate: "18", hsn_code: "",
  company_brand: "", manufacturer_name: "", category: "",
};

const CATEGORIES = [
  "Brakes", "Engine", "Filters", "Electrical", "Suspension",
  "Transmission", "Cooling", "Fuel System", "Body Parts",
  "Lights", "Exhaust", "Tyres & Wheels", "Other",
];

function PartForm({ initial = null, onSaved, onCancel }) {
  const [form, setForm] = useState(initial ? {
    part_number: initial.part_number || "",
    description: initial.description || "",
    application: initial.application || "",
    mrp: initial.mrp || "",
    basic_price: initial.basic_price || "",
    gst_rate: initial.gst_rate || "18",
    hsn_code: initial.hsn_code || "",
    company_brand: initial.company_brand || "",
    manufacturer_name: initial.manufacturer_name || "",
    category: initial.category || "",
  } : { ...EMPTY_FORM });

  const [files, setFiles] = useState([]);
  const [existingUrls, setExistingUrls] = useState(initial?.image_urls || []);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function validate() {
    const e = {};
    if (!form.part_number.trim()) e.part_number = "Required";
    if (!form.description.trim()) e.description = "Required";
    if (!form.mrp) e.mrp = "Required";
    if (!form.company_brand.trim()) e.company_brand = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      files.forEach(f => fd.append("images", f));
      // Pass remaining existing URLs so backend can merge
      existingUrls.forEach(u => fd.append("existing_urls", u));

      if (initial) {
        await apiForm(`/admin/parts/${initial.id}`, fd, "PUT");
        toast("Part updated successfully");
      } else {
        await apiForm("/admin/parts", fd, "POST");
        toast("Part added successfully");
      }
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  const F = ({ name, label, required, type = "text", ...props }) => (
    <div className={`form-group ${props.span ? `span${props.span}` : ""}`}>
      <label>{label}{required && <span className="req">*</span>}</label>
      <input type={type} value={form[name]} onChange={e => set(name, e.target.value)} {...props} />
      {errors[name] && <div className="text-danger">{errors[name]}</div>}
    </div>
  );

  return (
    <form onSubmit={submit}>
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 18 }}>
          {initial ? "Edit spare part" : "Add new spare part"}
        </div>

        {/* ── Part identity ── */}
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Part Identity</div>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <F name="part_number" label="Part Number" required placeholder="e.g. 68RD35672A" />
          <div className="form-group">
            <label>Category</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}>
              <option value="">Select category</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group span2">
            <label>Description<span className="req">*</span></label>
            <input value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Front Brake Pad Set" />
            {errors.description && <div className="text-danger">{errors.description}</div>}
          </div>
          <div className="form-group span2">
            <label>Application (vehicle fitment)</label>
            <input value={form.application} onChange={e => set("application", e.target.value)} placeholder="e.g. Maruti Suzuki Swift 2018–2024, Hyundai i20 2019+" />
          </div>
        </div>

        <hr className="divider" />

        {/* ── Brand ── */}
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Brand Information</div>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label>Company Brand<span className="req">*</span></label>
            <input value={form.company_brand} onChange={e => set("company_brand", e.target.value)} placeholder="e.g. Bosch, Minda, Denso, MRF" />
            {errors.company_brand && <div className="text-danger">{errors.company_brand}</div>}
          </div>
          <div className="form-group">
            <label>Manufacturer Name <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
            <input value={form.manufacturer_name} onChange={e => set("manufacturer_name", e.target.value)} placeholder="e.g. Robert Bosch GmbH" />
          </div>
        </div>

        <hr className="divider" />

        {/* ── Pricing & tax ── */}
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Pricing & Tax</div>
        <div className="form-grid cols3" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label>MRP (₹ incl. GST)<span className="req">*</span></label>
            <input type="number" step="0.01" value={form.mrp} onChange={e => set("mrp", e.target.value)} placeholder="1250.00" />
            {errors.mrp && <div className="text-danger">{errors.mrp}</div>}
          </div>
          <div className="form-group">
            <label>Basic Price (₹ excl. GST)</label>
            <input type="number" step="0.01" value={form.basic_price} onChange={e => set("basic_price", e.target.value)} placeholder="1059.32" />
          </div>
          <div className="form-group">
            <label>GST Rate (%)</label>
            <select value={form.gst_rate} onChange={e => set("gst_rate", e.target.value)}>
              {["0","5","12","18","28"].map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>HSN Code</label>
            <input value={form.hsn_code} onChange={e => set("hsn_code", e.target.value)} placeholder="e.g. 8708" />
          </div>
          {form.basic_price && form.gst_rate && (
            <div className="form-group" style={{ justifyContent: "flex-end" }}>
              <label>GST Amount (computed)</label>
              <input readOnly value={`₹ ${((parseFloat(form.basic_price)||0) * (parseFloat(form.gst_rate)||0) / 100).toFixed(2)}`}
                style={{ background: "var(--bg)", color: "var(--muted)" }} />
            </div>
          )}
        </div>

        <hr className="divider" />

        {/* ── Images ── */}
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Part Images</div>
        <ImageUploadZone
          files={files} setFiles={setFiles}
          existingUrls={existingUrls}
          onRemoveExisting={i => setExistingUrls(u => u.filter((_, j) => j !== i))}
        />

        <hr className="divider" />

        <div className="flex gap-8" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><div className="spinner" />{initial ? "Saving…" : "Adding…"}</> : (initial ? "Save changes" : "Add part")}
          </button>
        </div>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════
//  BULK EXCEL IMPORT
// ═══════════════════════════════════════════════════════════════
const IMPORT_COLUMNS = [
  "part_number", "description", "application",
  "mrp", "basic_price", "gst_rate", "hsn_code",
  "company_brand", "manufacturer_name", "category",
  "image_urls",
];

const SAMPLE_ROWS = [
  {
    part_number: "BP-001",
    description: "Front Brake Pad Set",
    application: "Maruti Suzuki Swift 2018-2024",
    mrp: 1250,
    basic_price: 1059.32,
    gst_rate: 18,
    hsn_code: "8708",
    company_brand: "Bosch",
    manufacturer_name: "Robert Bosch GmbH",
    category: "Brakes",
    image_urls: "https://res.cloudinary.com/demo/image/upload/sample.jpg, https://res.cloudinary.com/demo/image/upload/sample2.jpg",
  },
  {
    part_number: "OF-200",
    description: "Engine Oil Filter",
    application: "Hyundai i20 2019+",
    mrp: 350,
    basic_price: 312.5,
    gst_rate: 12,
    hsn_code: "8421",
    company_brand: "Mann-Filter",
    manufacturer_name: "",
    category: "Filters",
    image_urls: "",
  },
];

function BulkImport({ onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  function downloadSample() {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: IMPORT_COLUMNS });
    // Widen the columns a little for readability
    ws["!cols"] = IMPORT_COLUMNS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Spare Parts");
    XLSX.writeFile(wb, "spare_parts_sample.xlsx");
  }

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setValidationErrors([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const errs = [];
        json.forEach((r, i) => {
          const missing = [];
          if (!String(r.part_number || "").trim())   missing.push("part_number");
          if (!String(r.description || "").trim())   missing.push("description");
          if (!String(r.company_brand || "").trim()) missing.push("company_brand");
          if (r.mrp === "" || r.mrp == null || isNaN(parseFloat(r.mrp))) missing.push("mrp");
          if (missing.length) errs.push(`Row ${i + 2}: missing ${missing.join(", ")}`);
        });

        setRows(json);
        setValidationErrors(errs);
      } catch (err) {
        toast(`Could not parse file: ${err.message}`, "error");
        setRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function submitImport() {
    if (!rows.length) return;
    setLoading(true);
    try {
      const data = await api("/admin/parts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      setResult(data);
      toast(`Imported ${data.inserted} parts (${data.skipped} skipped)`);
      if (data.inserted > 0) onImported?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setRows([]);
    setFileName("");
    setValidationErrors([]);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const previewRows = rows.slice(0, 5);
  const canSubmit = rows.length > 0 && validationErrors.length === 0 && !loading;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-head">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Bulk import from Excel</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Add many spare parts at once. Download the sample file, fill it in, then upload.
            For images, paste one or more public image URLs (comma-separated) in the <code>image_urls</code> column.
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={downloadSample}>
          ⬇ Download sample (.xlsx)
        </button>
      </div>

      <div
        className="upload-zone"
        onClick={() => fileRef.current?.click()}
      >
        <div style={{ fontSize: 28 }}>📄</div>
        <p>
          {fileName
            ? <>Selected: <strong style={{ color: "var(--text)" }}>{fileName}</strong> — click to choose a different file</>
            : <>Click to upload an .xlsx, .xls or .csv file</>}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 14, fontSize: 13 }}>
            <strong>{rows.length}</strong> rows detected
            {validationErrors.length > 0 && (
              <span style={{ color: "var(--danger)", marginLeft: 8 }}>
                · {validationErrors.length} row(s) have errors
              </span>
            )}
          </div>

          {validationErrors.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", border: "1px solid rgba(232,84,84,.3)", background: "rgba(232,84,84,.08)", borderRadius: 7, fontSize: 12, color: "var(--danger)", maxHeight: 120, overflowY: "auto" }}>
              {validationErrors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
              {validationErrors.length > 20 && <div>… and {validationErrors.length - 20} more</div>}
            </div>
          )}

          <div className="table-wrap" style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 8 }}>
            <table>
              <thead>
                <tr>
                  {IMPORT_COLUMNS.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    {IMPORT_COLUMNS.map(c => (
                      <td key={c} style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r[c] !== undefined && r[c] !== "" ? String(r[c]) : <span style={{ color: "var(--muted)" }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > previewRows.length && (
              <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
                Showing first {previewRows.length} of {rows.length} rows
              </div>
            )}
          </div>

          <div className="flex gap-8" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={reset}>Clear</button>
            <button type="button" className="btn btn-primary" onClick={submitImport} disabled={!canSubmit}>
              {loading
                ? <><div className="spinner" /> Importing…</>
                : `Import ${rows.length - validationErrors.length} parts`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div style={{ marginTop: 14, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg3)", fontSize: 13 }}>
          <div><strong>Inserted:</strong> {result.inserted} · <strong>Skipped:</strong> {result.skipped} of {result.total_rows} total</div>
          {result.skipped_details?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", maxHeight: 140, overflowY: "auto" }}>
              {result.skipped_details.slice(0, 30).map((s, i) => (
                <div key={i}>· {s.part_number}: {s.reason}</div>
              ))}
              {result.skipped_details.length > 30 && <div>… and {result.skipped_details.length - 30} more</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PARTS LIST
// ═══════════════════════════════════════════════════════════════
function PartsList({ onEdit }) {
  const [parts, setParts] = useState([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const LIMIT = 15;

  const load = useCallback(async (query, pg) => {
    if (!query.trim()) { setParts([]); setTotal(0); return; }
    setLoading(true);
    try {
      const d = await api(`/parts/search?q=${encodeURIComponent(query)}&page=${pg}&limit=${LIMIT}`);
      setParts(d.results);
      setTotal(d.total);
    } catch {
      toast("Search failed", "error");
    } finally { setLoading(false); }
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(q, 1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { if (q.trim()) load(q, page); }, [page]);

  async function deletePart(id, partNum) {
    try {
      await api(`/admin/parts/${id}`, { method: "DELETE" });
      toast(`Part ${partNum} deleted`);
      load(q, page);
    } catch (e) { toast(e.message, "error"); }
    setConfirm(null);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      {confirm && <Confirm msg={`Delete part ${confirm.part_number}? This cannot be undone.`}
        onYes={() => deletePart(confirm.id, confirm.part_number)} onNo={() => setConfirm(null)} />}
      <div className="search-row">
        <input className="search-input" placeholder="Search by part number, description, brand, application…"
          value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("nav", { detail: "add-part" }))}>
          + Add part
        </button>
      </div>

      {loading && <div className="loading">Searching…</div>}
      {!loading && q && parts.length === 0 && <div className="empty">No parts found for "{q}"</div>}
      {!q && <div className="empty" style={{ padding: 40 }}>Type a search term to browse parts</div>}

      {parts.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Part No.</th>
                  <th>Description</th>
                  <th>Company Brand</th>
                  <th>Manufacturer</th>
                  <th>Category</th>
                  <th>MRP (₹)</th>
                  <th>GST</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.primary_image
                        ? <img src={p.primary_image} alt="" className="part-thumb" />
                        : <div className="no-thumb">🔩</div>}
                    </td>
                    <td><span className="mono">{p.part_number}</span></td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</td>
                    <td><strong>{p.company_brand}</strong></td>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{p.manufacturer_name || "—"}</td>
                    <td>{p.category ? <span className="badge badge-cat">{p.category}</span> : "—"}</td>
                    <td><strong>₹{parseFloat(p.mrp).toLocaleString("en-IN")}</strong></td>
                    <td><span className="badge badge-free">{p.gst_rate}%</span></td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirm(p)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination" style={{ padding: "12px 16px" }}>
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(pg => (
                <button key={pg} className={`page-btn ${pg === page ? "active" : ""}`} onClick={() => setPage(pg)}>{pg}</button>
              ))}
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{total} total</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  USERS LIST
// ═══════════════════════════════════════════════════════════════
function UsersList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    api("/admin/users")
      .then(d => setUsers(d.users))
      .catch(() => toast("Failed to load users", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function togglePlan(user) {
    const newPlan = user.subscription.plan === "paid" ? "free" : "paid";
    setUpdating(user.id);
    try {
      await api(`/admin/users/${user.id}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      setUsers(u => u.map(x => x.id === user.id
        ? { ...x, subscription: { ...x.subscription, plan: newPlan } }
        : x));
      toast(`${user.email || user.phone} → ${newPlan} plan`);
    } catch (e) { toast(e.message, "error"); }
    setUpdating(null);
  }

  if (loading) return <div className="loading">Loading users…</div>;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 20px", fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
        {users.length} registered users
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email / Phone</th>
              <th>Joined</th>
              <th>Last login</th>
              <th>Searches used</th>
              <th>Plan</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={6} className="empty">No users yet</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{u.email || u.phone || "—"}</div>
                  <div className="mono">{u.id.slice(0, 8)}…</div>
                </td>
                <td style={{ color: "var(--muted)", fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                <td style={{ color: "var(--muted)", fontSize: 12 }}>{u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString("en-IN") : "Never"}</td>
                <td>
                  <span style={{ fontFamily: "var(--mono)" }}>{u.subscription.queries_used}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>/{u.subscription.queries_limit || 20}</span>
                </td>
                <td>
                  <span className={`badge ${u.subscription.plan === "paid" ? "badge-paid" : "badge-free"}`}>
                    {u.subscription.plan}
                  </span>
                </td>
                <td>
                  <button
                    className={`btn btn-sm ${u.subscription.plan === "paid" ? "btn-ghost" : "btn-primary"}`}
                    disabled={updating === u.id}
                    onClick={() => togglePlan(u)}
                  >
                    {updating === u.id ? <div className="spinner" /> : (u.subscription.plan === "paid" ? "Revoke paid" : "Grant paid")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR NAV
// ═══════════════════════════════════════════════════════════════
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "parts",     label: "Spare Parts", icon: "🔩" },
  { id: "add-part",  label: "Add Part",    icon: "＋" },
  { id: "users",     label: "Users",       icon: "👥" },
];

function Sidebar({ page, setPage, onLogout }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-dot" />
        Automobile Spares
      </div>
      <div className="sidebar-section">Menu</div>
      {NAV.map(n => (
        <div key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
          <span className="nav-icon">{n.icon}</span>
          {n.label}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="nav-item" onClick={onLogout}>
        <span className="nav-icon">⏻</span> Logout
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem("as_token");
    return t ? { token: t } : null;
  });
  const [page, setPage] = useState("dashboard");
  const [editPart, setEditPart] = useState(null);
  const toasts = useToasts();

  // Allow nav from child components via CustomEvent
  useEffect(() => {
    const h = e => setPage(e.detail);
    window.addEventListener("nav", h);
    return () => window.removeEventListener("nav", h);
  }, []);

  function logout() {
    localStorage.removeItem("as_token");
    setUser(null);
  }

  if (!user) return (
    <>
      <style>{css}</style>
      <Login onLogin={u => setUser(u)} />
    </>
  );

  const PAGE_TITLES = {
    dashboard: "Dashboard",
    parts: "Spare Parts",
    "add-part": "Add Spare Part",
    "edit-part": `Edit: ${editPart?.part_number || ""}`,
    users: "Users",
  };

  function renderPage() {
    if (page === "dashboard") return <Dashboard />;
    if (page === "parts") return <PartsList onEdit={p => { setEditPart(p); setPage("edit-part"); }} />;
    if (page === "add-part") return (
      <>
        <BulkImport onImported={() => setPage("parts")} />
        <PartForm onSaved={() => setPage("parts")} onCancel={() => setPage("parts")} />
      </>
    );
    if (page === "edit-part" && editPart) return <PartForm initial={editPart} onSaved={() => { setPage("parts"); setEditPart(null); }} onCancel={() => setPage("parts")} />;
    if (page === "users") return <UsersList />;
    return null;
  }

  return (
    <>
      <style>{css}</style>
      <div className="layout">
        <Sidebar page={page} setPage={setPage} onLogout={logout} />
        <div className="main">
          <div className="topbar">
            <div className="page-title">{PAGE_TITLES[page]}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Admin Portal</div>
          </div>
          <div className="page-body">{renderPage()}</div>
        </div>
      </div>
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === "success" ? "✓" : "✕"}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </>
  );
}
