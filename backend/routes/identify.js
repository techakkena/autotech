// ============================================================
//  routes/identify.js  —  Photo Upload & DB-Based Part Search
//
//  POST /api/identify
//    Body: multipart/form-data
//      image: <file>          (required — stored to Cloudinary)
//      query: <text>          (optional — drives the DB match)
//    Returns: spare parts matching the text query, ranked.
//
//  Flow (no AI for now):
//    1. User uploads photo + optional text (part no, brand, etc).
//    2. Image goes to Cloudinary (kept for future image-similarity search).
//    3. If `query` was sent, search Supabase: part_number gets highest weight,
//       then other text columns. Multiple terms are ranked by hit count.
//    4. If no `query` was sent, return a recent slice of the catalog so the
//       user can browse and pick one.
//    5. Frontend displays results in a row; user picks one → checkout flow.
//
//  Image-similarity matching (compare uploaded image to image_urls in DB)
//  is deferred: it requires a perceptual-hash column + a backfill job.
// ============================================================

import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "../lib/supabase.js";
import { requireAuth, trackUsage, logUsage } from "../middleware/auth.js";

const router = Router();

// ── Configure Cloudinary ──────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer: in-memory upload (no temp files) ──────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

// ── POST /api/identify ────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  trackUsage,
  upload.single("image"),
  async (req, res) => {
    console.log("IDENTIFY ROUTE HIT");
    console.log("FILE:", req.file?.originalname, req.file?.size, "bytes");
    console.log("QUERY:", req.body?.query);

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    try {
      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer);

      const rawQuery = (req.body?.query || "").trim();
      const terms = tokenizeQuery(rawQuery);
      console.log("SEARCH TERMS:", terms);

      const results = terms.length > 0
        ? await searchByTerms(rawQuery, terms)
        : await listRecentParts();

      logUsage(req, {
        action: "photo_identify",
        query: rawQuery || null,
        success: results.length > 0,
      });

      return res.json({
        success: true,
        identified: terms.length > 0 && results.length > 0,
        cloudinary_url: cloudinaryUrl,
        query_used: rawQuery || null,
        search_terms_used: terms,
        results,
        message: terms.length === 0
          ? "No search text provided — showing recent parts. Type a part number, brand, or description to narrow down."
          : results.length === 0
          ? "No parts matched your search."
          : null,
      });
    } catch (err) {
      console.error("Identify error:", err.message);
      logUsage(req, { action: "photo_identify", query: null, success: false });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Helper: Upload buffer to Cloudinary ──────────────────────
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "autospares/user-uploads",
        resource_type: "image",
        invalidate: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ── Tokenize the user's text query ────────────────────────────
// Split on non-alphanumeric, lowercase, drop very short stopwords.
// Numeric tokens (4+ digits) are kept — they may be part-number fragments.
const STOPWORDS = new Set([
  "and", "the", "with", "for", "from", "into", "this", "that",
]);

function tokenizeQuery(text) {
  if (!text) return [];
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    ),
  ];
}

// ── Score a row against the user's query ──────────────────────
// part_number hits weigh heavily; full-query substring on part_number
// is the strongest signal (user is searching for a specific SKU).
const TEXT_COLUMNS = [
  "part_number",
  "description",
  "application",
  "company_brand",
  "manufacturer_name",
  "category",
];

function scoreRow(row, rawQuery, terms) {
  const pn = (row.part_number || "").toLowerCase();
  let score = 0;

  // Strong: whole query appears in part_number
  if (rawQuery && pn.includes(rawQuery.toLowerCase())) {
    score += 1000;
    if (pn === rawQuery.toLowerCase()) score += 5000; // exact PN match
  }

  // Per-column term hits — part_number weighted higher than the rest.
  for (const t of terms) {
    if (pn.includes(t)) score += 10;
    for (const c of TEXT_COLUMNS) {
      if (c === "part_number") continue;
      const v = (row[c] || "").toString().toLowerCase();
      if (v.includes(t)) score += 1;
    }
  }

  return score;
}

// ── Search Supabase by terms, then rank in JS ─────────────────
async function searchByTerms(rawQuery, terms) {
  const orClauses = terms
    .map(
      (t) =>
        `part_number.ilike.%${t}%,description.ilike.%${t}%,` +
        `application.ilike.%${t}%,company_brand.ilike.%${t}%,` +
        `manufacturer_name.ilike.%${t}%,category.ilike.%${t}%`
    )
    .join(",");

  const { data, error } = await supabase
    .from("spare_parts")
    .select(
      `id, part_number, description, application,
       company_brand, manufacturer_name, category,
       mrp, basic_price, gst_rate, hsn_code, image_urls`
    )
    .or(orClauses)
    .limit(50);

  if (error) {
    console.error("Supabase search error:", error.message);
    return [];
  }

  const ranked = data
    .map((row) => ({ row, score: scoreRow(row, rawQuery, terms) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  console.log(
    "RANKED MATCHES:",
    ranked.map((r) => ({
      id: r.row.id,
      part_number: r.row.part_number,
      score: r.score,
    }))
  );

  return ranked.map(({ row, score }) => enrichPart(row, score));
}

// ── Fallback: list recent parts when user didn't type anything ─
async function listRecentParts(limit = 20) {
  const { data, error } = await supabase
    .from("spare_parts")
    .select(
      `id, part_number, description, application,
       company_brand, manufacturer_name, category,
       mrp, basic_price, gst_rate, hsn_code, image_urls, created_at`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Supabase recent-parts error:", error.message);
    return [];
  }

  return data.map((row) => enrichPart(row, 0));
}

// ── Shape a row for the frontend ──────────────────────────────
function enrichPart(row, score) {
  const basic = parseFloat(row.basic_price) || 0;
  const gstRate = parseFloat(row.gst_rate) || 0;
  return {
    id: row.id,
    part_number: row.part_number,
    description: row.description,
    application: row.application,
    company_brand: row.company_brand,
    manufacturer_name: row.manufacturer_name,
    category: row.category,
    mrp: row.mrp,
    basic_price: row.basic_price,
    gst_rate: row.gst_rate,
    gst_amount: parseFloat(((basic * gstRate) / 100).toFixed(2)),
    hsn_code: row.hsn_code,
    image_urls: row.image_urls || [],
    primary_image: row.image_urls?.[0] || null,
    match_score: score,
  };
}

export default router;
