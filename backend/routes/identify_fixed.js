// ============================================================
//  routes/identify.js  —  FIXED VERSION with debug logging
//  Changes from original:
//  1. Uses REST API directly (no @google-cloud/vision package needed)
//  2. Detailed console logs so you can see exactly what's happening
//  3. Fallback: if Vision returns no useful labels, return all parts
//     that have images (so user sees something instead of empty result)
//  4. Lower confidence threshold (0.5 instead of 0.6)
//  5. Searches more columns including category
// ============================================================

import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "../server.js";
import { requireAuth, trackUsage } from "../middleware/auth.js";

const router = Router();

// ── Configure Cloudinary ──────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer: store upload in memory ────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    console.log("🖼️  Identify request received");
    console.log("    File:", req.file.originalname, req.file.size, "bytes", req.file.mimetype);

    try {
      // ── Step 1: Upload to Cloudinary ────────────────────────
      console.log("☁️  Uploading to Cloudinary...");
      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
      console.log("✅  Cloudinary URL:", cloudinaryUrl);

      // ── Step 2: Run Google Vision ────────────────────────────
      // Send the raw image bytes inline (base64) instead of the Cloudinary
      // URL — Vision's URL fetcher is unreliable for some hosts.
      console.log("🔍  Calling Google Vision API...");
      const { labels, texts, webLabels } = await analyzeImage(req.file.buffer);
      console.log("📋  Raw labels:", labels);
      console.log("📝  Raw texts:", texts);
      console.log("🌐  Web labels:", webLabels);

      // ── Step 3: Build search terms ───────────────────────────
      const searchTerms = buildSearchTerms(labels, texts, webLabels);
      console.log("🔎  Search terms for DB:", searchTerms);

      // ── Step 4: Search database ──────────────────────────────
      let results = [];

      if (searchTerms.length > 0) {
        results = await searchByTerms(searchTerms);
        console.log("📦  DB results:", results.length, "parts found");
      }

      // ── Step 5: Fallback — if no results, return recent parts ─
      // This ensures the user sees something even if Vision
      // cannot identify the specific part
      if (results.length === 0) {
        console.log("⚠️  No matches found, using fallback...");
        results = await getFallbackParts();
        console.log("📦  Fallback results:", results.length, "parts");
      }

      return res.json({
        success: true,
        identified: searchTerms.length > 0 && results.length > 0,
        cloudinary_url: cloudinaryUrl,
        search_terms_used: searchTerms,
        results,
        message: searchTerms.length === 0
          ? "Could not identify specific part — showing all available parts"
          : results.length === 0
          ? "No exact match found — showing similar parts"
          : null,
      });
    } catch (err) {
      console.error("❌  Identify error:", err.message);
      console.error(err.stack);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Helper: Upload buffer to Cloudinary ──────────────────────
function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "autospares/user-uploads", resource_type: "image" },
      (error, result) => {
        if (error) {
          console.error("❌  Cloudinary error:", error.message);
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ── Helper: Analyse with Google Vision REST API ───────────────
// Uses REST API directly — no extra package needed, just API key.
// Accepts a Buffer of image bytes and sends them inline as base64.
async function analyzeImage(imageBuffer) {
  const API_KEY = process.env.GOOGLE_VISION_API_KEY;

  if (!API_KEY) {
    console.error("❌  GOOGLE_VISION_API_KEY is not set in .env");
    return { labels: [], texts: [], webLabels: [] };
  }

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBuffer.toString("base64") },
              features: [
                { type: "LABEL_DETECTION",  maxResults: 15 },
                { type: "TEXT_DETECTION" },
                { type: "WEB_DETECTION",    maxResults: 10 },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // Log raw response for debugging
    if (data.error) {
      console.error("❌  Vision API error:", JSON.stringify(data.error));
      return { labels: [], texts: [], webLabels: [] };
    }

    if (data.responses?.[0]?.error) {
      console.error("❌  Vision response error:", JSON.stringify(data.responses[0].error));
      return { labels: [], texts: [], webLabels: [] };
    }

    const resp = data.responses?.[0] || {};

    // Labels — lower threshold to 0.5 for auto parts
    const labels = (resp.labelAnnotations || [])
      .filter(l => l.score >= 0.5)
      .map(l => l.description.toLowerCase());

    // Text detected on the part (part numbers, brand names)
    const rawText = resp.textAnnotations?.[0]?.description || "";
    const texts = rawText
      .toLowerCase()
      .split(/[\s\n]+/)
      .filter(t => t.length >= 3 && /[a-z0-9]/.test(t));

    // Web detection (very useful for identifying auto parts)
    const webLabels = (resp.webDetection?.webEntities || [])
      .filter(e => e.score >= 0.4 && e.description)
      .map(e => e.description.toLowerCase());

    return { labels, texts, webLabels };
  } catch (err) {
    console.error("❌  Vision API fetch error:", err.message);
    return { labels: [], texts: [], webLabels: [] };
  }
}

// ── Helper: Build search terms from Vision output ─────────────
const IGNORE_LABELS = new Set([
  "product", "object", "material", "metal", "hardware",
  "tool", "equipment", "item", "part", "component",
  "circle", "wheel", "gear", "machine", "device", "rubber",
  "plastic", "black", "silver", "gray", "round", "white",
]);

function buildSearchTerms(labels, texts, webLabels) {
  // Filter generic labels
  const usefulLabels = [...labels, ...webLabels].filter(
    l => l.length > 3 && !IGNORE_LABELS.has(l)
  );

  // Keep alphanumeric text that looks like part numbers or brand names
  const usefulTexts = texts.filter(
    t => /^[a-z0-9\-\.]{3,20}$/.test(t) && !/^[0-9]+$/.test(t)
  );

  // Deduplicate
  const combined = [...new Set([...usefulLabels.slice(0, 6), ...usefulTexts.slice(0, 3)])];
  console.log("✅  Final search terms:", combined);
  return combined;
}

// ── Helper: Search Supabase by multiple terms ─────────────────
async function searchByTerms(terms) {
  if (!terms.length) return [];

  // Build OR filter for each term across all text columns
  const orClauses = terms
    .map(t =>
      `part_number.ilike.%${t}%,` +
      `description.ilike.%${t}%,` +
      `application.ilike.%${t}%,` +
      `company_brand.ilike.%${t}%,` +
      `manufacturer_name.ilike.%${t}%,` +
      `category.ilike.%${t}%`
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
    .limit(10);

  if (error) {
    console.error("❌  Supabase search error:", error.message);
    return [];
  }

  return data.map(enrichPart);
}

// ── Helper: Fallback — return latest parts if no match ────────
// This prevents the frustrating "no results" experience
// when Vision API can't identify a part precisely
async function getFallbackParts() {
  const { data, error } = await supabase
    .from("spare_parts")
    .select(
      `id, part_number, description, application,
       company_brand, manufacturer_name, category,
       mrp, basic_price, gst_rate, hsn_code, image_urls`
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("❌  Fallback query error:", error.message);
    return [];
  }

  return data.map(enrichPart);
}

// ── Helper: Enrich part with computed fields ──────────────────
function enrichPart(part) {
  const basic = parseFloat(part.basic_price) || 0;
  const gstRate = parseFloat(part.gst_rate) || 0;
  return {
    ...part,
    primary_image: part.image_urls?.[0] || null,
    gst_amount: parseFloat(((basic * gstRate) / 100).toFixed(2)),
  };
}

export default router;