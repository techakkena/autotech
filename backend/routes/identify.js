// ============================================================
//  routes/identify.js  —  Photo Upload & Part Identification
//
//  POST /api/identify
//    Body: multipart/form-data  { image: <file> }
//    Returns: matched spare parts based on visual AI labels
//
//  Flow:
//    1. User uploads photo (camera or gallery)
//    2. Upload to Cloudinary (CDN URL)
//    3. POST image URL to Google Vision REST API (free tier, API key)
//    4. Vision returns labels + text + web entities
//    5. Search Supabase by those terms
//    6. Return matched parts + the Cloudinary URL
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

const VISION_URL =
  `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`;

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
    console.log("FILE:", req.file);

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    try {
      const cloudinaryUrl = await uploadToCloudinary(
        req.file.buffer,
        req.file.mimetype
      );

      // Send the raw bytes inline rather than asking Vision to fetch the
      // Cloudinary URL — Vision's URL fetcher is unreliable for some hosts.
      const { labels, texts } = await analyzeImage(req.file.buffer);
      console.log("FINAL LABELS:", labels);
      const searchTerms = buildSearchTerms(labels, texts);
      console.log("SEARCH TERMS:", searchTerms);

      if (searchTerms.length === 0) {
        logUsage(req, {
          action: "photo_identify",
          query: null,
          success: false,
        });
        return res.json({
          success: true,
          identified: false,
          message: "Could not identify a spare part in this image",
          cloudinary_url: cloudinaryUrl,
          results: [],
        });
      }

      const results = await searchByTerms(searchTerms);

      logUsage(req, {
        action: "photo_identify",
        query: searchTerms.join(" "),
        success: results.length > 0,
      });

      return res.json({
        success: true,
        identified: results.length > 0,
        cloudinary_url: cloudinaryUrl,
        search_terms_used: searchTerms,
        results,
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

// ── Helper: Analyse image with Google Vision REST API ─────────
//  Uses API-key auth (free tier — 1,000 calls/month).
//  Accepts a Buffer of image bytes, sent inline as base64.
async function analyzeImage(imageBuffer) {
  try {
    const body = {
      requests: [
        {
          image: { content: imageBuffer.toString("base64") },
          features: [
            { type: "LABEL_DETECTION", maxResults: 15 },
            { type: "TEXT_DETECTION" },
            { type: "WEB_DETECTION", maxResults: 5 },
          ],
        },
      ],
    };

    const resp = await fetch(VISION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Vision API HTTP error:", resp.status, errText);
      return { labels: [], texts: [] };
    }

    const json = await resp.json();
    const result = json.responses?.[0] || {};
    console.log("VISION RESULT:", JSON.stringify(result, null, 2));

    const labels = (result.labelAnnotations || [])
      .filter((l) => l.score >= 0.6)
      .map((l) => l.description.toLowerCase());

    const fullText = result.textAnnotations?.[0]?.description?.toLowerCase() || "";
    const texts = fullText
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const webLabels = (result.webDetection?.webEntities || [])
      .filter((e) => e.score >= 0.5)
      .map((e) => e.description?.toLowerCase())
      .filter(Boolean);

    return { labels: [...new Set([...labels, ...webLabels])], texts };
  } catch (err) {
    console.error("Vision API error:", err.message);
    return { labels: [], texts: [] };
  }
}

// ── Filter out generic/useless Vision labels ──────────────────
const IGNORE_LABELS = new Set([
  "product", "object", "material", "metal", "hardware",
  "tool", "equipment", "item", "part", "component",
  "automotive", "vehicle", "car", "auto",
]);

function buildSearchTerms(labels, texts) {
  const useful = labels.filter((l) => !IGNORE_LABELS.has(l));
  const partNumberLike = texts.filter((t) => /^[a-z0-9-]{4,20}$/.test(t));
  return [...new Set([...useful.slice(0, 5), ...partNumberLike])];
}

// ── Helper: Search Supabase by multiple terms (OR logic) ──────
async function searchByTerms(terms) {
  if (!terms.length) return [];

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
    .limit(10);

  if (error) {
    console.error("Supabase search error:", error.message);
    return [];
  }

  return data.map((part) => ({
    ...part,
    primary_image: part.image_urls?.[0] || null,
    gst_amount: parseFloat(
      ((parseFloat(part.basic_price) * parseFloat(part.gst_rate)) / 100).toFixed(2)
    ),
  }));
}

export default router;
