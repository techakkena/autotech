// ============================================================
//  routes/parts.js  —  Search & Part Detail
//
//  GET /api/parts/search?q=brake+pad&limit=10&page=1
//  GET /api/parts/:id
//  GET /api/parts/categories          (list all categories)
// ============================================================

import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, trackUsage, logUsage } from "../middleware/auth.js";

const router = Router();

// ── GET /api/parts/search ────────────────────────────────────
//  Searches part_number, description, application, company_brand, manufacturer_name
//  Supports pagination: ?page=1&limit=10
//  Protected: user must be logged in; usage is tracked for
//  free-tier limit enforcement.
router.get("/search", requireAuth, trackUsage, async (req, res) => {
  const { q, page = 1, limit = 20, category } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: "Search query must be at least 2 characters",
    });
  }

  const offset = (Number(page) - 1) * Number(limit);
  const searchTerm = q.trim().toLowerCase();

  try {
    // Build query — Supabase full-text search using ilike (case-insensitive)
    // We search across 5 columns and combine with OR
    let query = supabase
      .from("spare_parts")
      .select(
        `id, part_number, description, application,
         company_brand, manufacturer_name, category,
         mrp, basic_price, gst_rate, hsn_code, image_urls`,
        { count: "exact" }
      )
      .or(
        `part_number.ilike.%${searchTerm}%,` +
        `description.ilike.%${searchTerm}%,` +
        `application.ilike.%${searchTerm}%,` +
        `company_brand.ilike.%${searchTerm}%,` +
        `manufacturer_name.ilike.%${searchTerm}%`
      )
      .order("part_number", { ascending: true })
      .range(offset, offset + Number(limit) - 1);

    // Optionally filter by category
    if (category) {
      query = query.eq("category", category);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Compute GST-inclusive price for each result
    const results = data.map(enrichPart);

    logUsage(req, {
      action: "text_search",
      query: q,
      success: results.length > 0,
    });

    return res.json({
      success: true,
      query: q,
      total: count,
      page: Number(page),
      limit: Number(limit),
      results,
    });
  } catch (err) {
    console.error("Search error:", err.message);
    logUsage(req, { action: "text_search", query: q, success: false });
    return res.status(500).json({ success: false, error: "Search failed" });
  }
});

// ── GET /api/parts/categories ────────────────────────────────
//  Returns the managed list of categories for filter dropdowns
//  and the admin "Add Part" form.
router.get("/categories", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, description")
      .order("name", { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      categories: data.map((c) => c.name),
      items: data,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/parts/:id ───────────────────────────────────────
//  Returns full detail for one spare part by UUID
router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("spare_parts")
      .select("*")
      .eq("id", id)
      .single(); // throws if 0 or >1 rows

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ success: false, error: "Part not found" });
      }
      throw error;
    }

    return res.json({ success: true, part: enrichPart(data) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Helper: enrich a raw DB row with computed fields ─────────
//  Adds gst_amount and mrp_inclusive so the frontend
//  never has to do price math itself.
function enrichPart(part) {
  const basic = parseFloat(part.basic_price) || 0;
  const gstRate = parseFloat(part.gst_rate) || 0;
  const gstAmount = parseFloat((basic * gstRate) / 100).toFixed(2);
  const mrpInclusive = parseFloat(part.mrp).toFixed(2);

  return {
    ...part,
    gst_amount: parseFloat(gstAmount),
    mrp_inclusive: parseFloat(mrpInclusive),
    // Primary image — first URL in the array for easy display
    primary_image: part.image_urls?.[0] || null,
  };
}

export default router;
