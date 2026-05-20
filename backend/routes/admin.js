// ============================================================
//  routes/admin.js  —  Admin-only CRUD & User Management
//
//  All routes require: valid JWT + admin role
//
//  POST   /api/admin/parts           → add new spare part
//  PUT    /api/admin/parts/:id       → update spare part
//  DELETE /api/admin/parts/:id       → delete spare part
//  GET    /api/admin/users           → list all users
//  PUT    /api/admin/users/:id/plan  → change user plan
//  GET    /api/admin/stats           → dashboard numbers
// ============================================================

import { Router } from "express";
import express from "express";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Every admin route requires: logged in AND admin role
router.use(requireAuth, requireAdmin);

// ── Multer config (same as identify.js) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed"), false);
    }
    cb(null, true);
  },
});

// ── POST /api/admin/parts ─────────────────────────────────────
//  Accepts multipart/form-data with one or more images + JSON fields
//  Fields: part_number, description, application, mrp,
//          basic_price, gst_rate, hsn_code,
//          company_brand (MANDATORY), manufacturer_name (optional),
//          category
router.post("/parts", upload.array("images", 5), async (req, res) => {
  const {
    part_number, description, application,
    mrp, basic_price, gst_rate, hsn_code,
    company_brand, manufacturer_name,
    category,
  } = req.body;

  // Basic validation — company_brand is now mandatory
  if (!part_number || !description || !mrp || !company_brand) {
    return res.status(400).json({
      success: false,
      error: "part_number, description, mrp and company_brand are required",
    });
  }

  try {
    // Upload all provided images to Cloudinary
    const imageUrls = await uploadImages(req.files || []);

    const { data, error } = await supabase
      .from("spare_parts")
      .insert({
        part_number:       part_number.trim().toUpperCase(),
        description:       description.trim(),
        application:       application?.trim()       || null,
        mrp:               parseFloat(mrp),
        basic_price:       parseFloat(basic_price)   || null,
        gst_rate:          parseFloat(gst_rate)      || 18,
        hsn_code:          hsn_code?.trim()          || null,
        company_brand:     company_brand.trim(),            // mandatory
        manufacturer_name: manufacturer_name?.trim()  || null, // optional
        category:          category?.trim()           || null,
        image_urls:        imageUrls,
      })
      .select()
      .single();

    if (error) {
      // Duplicate part_number — Postgres unique constraint
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          error: `Part number ${part_number} already exists`,
        });
      }
      throw error;
    }

    return res.status(201).json({ success: true, part: data });
  } catch (err) {
    console.error("Add part error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/admin/parts/bulk ────────────────────────────────
//  Bulk insert spare parts from an Excel/CSV import.
//  Admin frontend parses the .xlsx in-browser and posts JSON rows.
//  Body: { rows: [ { part_number, description, mrp, company_brand, ... }, ... ] }
router.post("/parts/bulk", express.json({ limit: "5mb" }), async (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({
      success: false,
      error: "rows must be a non-empty array",
    });
  }
  if (rows.length > 1000) {
    return res.status(400).json({
      success: false,
      error: "Maximum 1000 rows per import",
    });
  }

  const skipped = [];
  const records = [];

  rows.forEach((r, idx) => {
    const part_number    = r.part_number    != null ? String(r.part_number).trim()    : "";
    const description    = r.description    != null ? String(r.description).trim()    : "";
    const company_brand  = r.company_brand  != null ? String(r.company_brand).trim()  : "";
    const mrp            = parseFloat(r.mrp);

    if (!part_number || !description || !company_brand || isNaN(mrp)) {
      skipped.push({
        row: idx + 2, // +2: header row + 1-based
        part_number: part_number || "(missing)",
        reason: "Missing required: part_number, description, mrp, company_brand",
      });
      return;
    }

    records.push({
      part_number:       part_number.toUpperCase(),
      description,
      application:       r.application       ? String(r.application).trim()       : null,
      mrp,
      basic_price:       r.basic_price       ? parseFloat(r.basic_price)          : null,
      gst_rate:          r.gst_rate          ? parseFloat(r.gst_rate)             : 18,
      hsn_code:          r.hsn_code          ? String(r.hsn_code).trim()          : null,
      company_brand,
      manufacturer_name: r.manufacturer_name ? String(r.manufacturer_name).trim() : null,
      category:          r.category          ? String(r.category).trim()          : null,
      image_urls:        parseImageUrls(r.image_urls),
    });
  });

  let inserted = 0;
  for (const rec of records) {
    const { error } = await supabase.from("spare_parts").insert(rec);
    if (error) {
      skipped.push({
        part_number: rec.part_number,
        reason: error.code === "23505" ? "Duplicate part number" : error.message,
      });
    } else {
      inserted += 1;
    }
  }

  return res.json({
    success: true,
    inserted,
    skipped: skipped.length,
    skipped_details: skipped,
    total_rows: rows.length,
  });
});

// ── PUT /api/admin/parts/:id ──────────────────────────────────
//  Update any fields of an existing spare part.
//  Pass new images to append; existing image_urls preserved.
router.put("/parts/:id", upload.array("images", 5), async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch existing record first
    const { data: existing, error: fetchErr } = await supabase
      .from("spare_parts")
      .select("image_urls")
      .eq("id", id)
      .single();

    if (fetchErr) throw fetchErr;

    // Upload any new images and merge with existing URLs
    const newUrls = await uploadImages(req.files || []);
    const mergedUrls = [...(existing.image_urls || []), ...newUrls];

    // Build update object — only include fields that were sent
    const updates = {};
    const fields = [
      "description", "application", "mrp", "basic_price",
      "gst_rate", "hsn_code", "company_brand", "manufacturer_name", "category",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    // Prevent wiping out the mandatory company_brand with an empty string
    if (updates.company_brand !== undefined && !updates.company_brand?.trim()) {
      return res.status(400).json({
        success: false,
        error: "company_brand cannot be empty",
      });
    }
    if (newUrls.length) updates.image_urls = mergedUrls;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("spare_parts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, part: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/admin/parts/:id ───────────────────────────────
router.delete("/parts/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("spare_parts")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return res.json({ success: true, message: "Part deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────
//  Returns users from Supabase Auth + their subscription info
router.get("/users", async (_req, res) => {
  try {
    // Get all users from Supabase Auth (admin API)
    const { data: authData, error: authErr } =
      await supabase.auth.admin.listUsers();
    if (authErr) throw authErr;

    // Get subscription records for all users
    const { data: subs, error: subErr } = await supabase
      .from("user_subscriptions")
      .select("*");
    if (subErr) throw subErr;

    // Merge auth users with subscription data
    const subMap = Object.fromEntries(subs.map((s) => [s.user_id, s]));
    const users = authData.users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
      subscription: subMap[u.id] || { plan: "free", queries_used: 0 },
    }));

    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/admin/users/:id/plan ─────────────────────────────
//  Manually set a user's plan to "free" or "paid"
//  Admin can gift free access or revoke subscription
//  Body: { plan: "free" | "paid", expires_at: "2025-12-31" }
router.put("/users/:id/plan", async (req, res) => {
  const { id } = req.params;
  const { plan, expires_at } = req.body;

  if (!["free", "paid"].includes(plan)) {
    return res.status(400).json({ success: false, error: "plan must be free or paid" });
  }

  try {
    // Upsert — create if not exists, update if exists
    const { data, error } = await supabase
      .from("user_subscriptions")
      .upsert({
        user_id: id,
        plan,
        expires_at: expires_at || null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, subscription: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────
//  Dashboard summary numbers
router.get("/stats", async (_req, res) => {
  try {
    const [partsRes, usersRes, searchesTodayRes] = await Promise.all([
      supabase.from("spare_parts").select("id", { count: "exact", head: true }),
      supabase.auth.admin.listUsers(),
      supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date().toISOString().split("T")[0]), // today
    ]);

    return res.json({
      success: true,
      stats: {
        total_parts: partsRes.count || 0,
        total_users: usersRes.data?.users?.length || 0,
        searches_today: searchesTodayRes.count || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helper: Parse image_urls cell from bulk import ────────────
//  Accepts a string ("https://a, https://b") or an array.
//  Returns up to 5 trimmed http(s) URLs.
function parseImageUrls(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\n|]/);
  return list
    .map((u) => String(u).trim())
    .filter((u) => /^https?:\/\/\S+$/i.test(u))
    .slice(0, 5);
}

// ── Helper: Upload array of files to Cloudinary ───────────────
async function uploadImages(files) {
  if (!files.length) return [];

  const uploads = files.map(
    (file) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "autospares/spare-parts" },
          (err, result) => {
            if (err) return reject(err);
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      })
  );

  return Promise.all(uploads);
}

export default router;
