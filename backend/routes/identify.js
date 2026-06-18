// ============================================================
//  routes/identify.js  —  Photo Upload & DB-Based Part Search
//
//  POST /api/identify
//    Body: multipart/form-data
//      image: <file>          (required — stored to Cloudinary)
//      query: <text>          (optional — extra DB search hint)
//    Returns: spare parts matching database fields for this request only.
//
//  Flow:
//    1. User uploads or captures a photo, optionally with text hint.
//    2. Image goes to Cloudinary for storage.
//    3. Search terms are built only from database-searchable request data:
//       the optional text hint and the uploaded file name.
//    4. Supabase is the only search source. No Google Vision/API image
//       analysis is called, and no recent/catalog fallback is returned.
// ============================================================

import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "../lib/supabase.js";
import { optionalAuth, trackUsage, logUsage } from "../middleware/auth.js";

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
  optionalAuth,
  trackUsage,
  upload.single("image"),
  async (req, res) => {
    console.log("IDENTIFY ROUTE HIT");
    console.log("FILE:", req.file?.originalname, req.file?.size, "bytes");
    console.log("QUERY:", req.body?.query);
    console.log("UPLOAD ID:", req.body?.upload_id);

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    try {
      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer);

      const rawQuery = (req.body?.query || "").trim();
      const filenameTerms = tokenizeQuery(stripFileExtension(req.file.originalname || ""));
      const terms = buildSearchTerms(rawQuery, filenameTerms);
      const imageSignals = await analyzeImage(req.file.buffer);
      const filenameTerms = tokenizeQuery(stripFileExtension(req.file.originalname || ""));
      const terms = buildSearchTerms(rawQuery, imageSignals, filenameTerms);
      console.log("IMAGE SIGNALS:", imageSignals);
      console.log("SEARCH TERMS:", terms);

      const results = terms.length > 0
        ? await searchByTerms(rawQuery, terms)
        : [];

      logUsage(req, {
        action: "photo_identify",
        query: rawQuery || null,
        success: results.length > 0,
      });

      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");

      return res.json({
        success: true,
        identified: terms.length > 0 && results.length > 0,
        cloudinary_url: cloudinaryUrl,
        query_used: rawQuery || null,
        search_terms_used: terms,
        results,
        message: terms.length === 0
          ? "No database search terms were found for this upload. Add a part number, brand, or description and try again."
          ? "No readable part number or label was found in this photo. Try a clearer photo or add a part number, brand, or description in text search."
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
  "image", "photo", "camera", "upload", "jpg", "jpeg", "png", "webp",
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

function stripFileExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

function buildSearchTerms(rawQuery, filenameTerms) {
  const queryTerms = tokenizeQuery(rawQuery);

  return [...new Set([...queryTerms, ...filenameTerms])]
const IGNORE_IMAGE_TERMS = new Set([
  "product", "object", "material", "metal", "hardware", "tool",
  "equipment", "item", "part", "component", "auto", "automotive",
  "black", "white", "silver", "gray", "grey", "round", "plastic",
]);

async function analyzeImage(imageBuffer) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) return { labels: [], texts: [], webLabels: [] };

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBuffer.toString("base64") },
              features: [
                { type: "TEXT_DETECTION", maxResults: 10 },
                { type: "LABEL_DETECTION", maxResults: 15 },
                { type: "WEB_DETECTION", maxResults: 10 },
              ],
            },
          ],
        }),
      }
    );
    const data = await response.json();
    const resp = data.responses?.[0] || {};
    if (data.error || resp.error) {
      console.error("Vision API error:", data.error || resp.error);
      return { labels: [], texts: [], webLabels: [] };
    }

    const textBlock = resp.textAnnotations?.[0]?.description || "";
    const texts = tokenizeQuery(textBlock).filter((t) => t.length >= 3);
    const labels = (resp.labelAnnotations || [])
      .filter((label) => label.score >= 0.55 && label.description)
      .flatMap((label) => tokenizeQuery(label.description));
    const webLabels = (resp.webDetection?.webEntities || [])
      .filter((entity) => entity.score >= 0.4 && entity.description)
      .flatMap((entity) => tokenizeQuery(entity.description));

    return { labels, texts, webLabels };
  } catch (err) {
    console.error("Vision API fetch error:", err.message);
    return { labels: [], texts: [], webLabels: [] };
  }
}

function buildSearchTerms(rawQuery, imageSignals, filenameTerms) {
  const queryTerms = tokenizeQuery(rawQuery);
  const imageTerms = [
    ...(imageSignals.texts || []),
    ...(imageSignals.webLabels || []),
    ...(imageSignals.labels || []),
  ].filter((term) => !IGNORE_IMAGE_TERMS.has(term));

  return [...new Set([...queryTerms, ...imageTerms, ...filenameTerms])]
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term))
    .slice(0, 12);
}

// ── Score a row against the user's query ──────────────────────
// part_number hits weigh heavily; full-query substring on part_number
// is the strongest signal (user is searching for a specific SKU).
const TEXT_COLUMNS = [
  "part_number",
  "alternate_part_number",
  "description",
  "application",
  "company_brand",
  "manufacturer_name",
  "category",
];

function scoreRow(row, rawQuery, terms) {
  const pn = (row.part_number || "").toLowerCase();
  const apn = (row.alternate_part_number || "").toLowerCase();
  let score = 0;

  // Strong: whole query appears in part_number or alternate_part_number
  if (rawQuery) {
    const rq = rawQuery.toLowerCase();
    if (pn.includes(rq)) {
      score += 1000;
      if (pn === rq) score += 5000; // exact PN match
    }
    if (apn && apn.includes(rq)) {
      score += 1000;
      if (apn === rq) score += 5000; // exact alt-PN match
    }
  }

  // Per-column term hits — part_number / alternate_part_number weighted higher than the rest.
  for (const t of terms) {
    if (pn.includes(t)) score += 10;
    if (apn.includes(t)) score += 10;
    for (const c of TEXT_COLUMNS) {
      if (c === "part_number" || c === "alternate_part_number") continue;
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
        `part_number.ilike.%${t}%,alternate_part_number.ilike.%${t}%,` +
        `description.ilike.%${t}%,application.ilike.%${t}%,` +
        `company_brand.ilike.%${t}%,manufacturer_name.ilike.%${t}%,` +
        `category.ilike.%${t}%`
    )
    .join(",");

  const { data, error } = await supabase
    .from("spare_parts")
    .select(
      `id, part_number, alternate_part_number, description, application,
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

// ── Shape a row for the frontend ──────────────────────────────
function enrichPart(row, score) {
  const basic = parseFloat(row.basic_price) || 0;
  const gstRate = parseFloat(row.gst_rate) || 0;
  return {
    id: row.id,
    part_number: row.part_number,
    alternate_part_number: row.alternate_part_number,
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
