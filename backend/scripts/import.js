// ============================================================
//  scripts/import.js  —  Bulk CSV import for spare_parts
//
//  Usage:
//    node scripts/import.js <csv-path>              (real import)
//    node scripts/import.js <csv-path> --dry-run    (validate only)
//
//  CSV columns (header row required):
//    part_number, description, application, mrp, basic_price,
//    gst_rate, hsn_code, company_brand, manufacturer_name,
//    category, image_paths
//
//  image_paths is a `|`-separated list of either:
//    • local file paths (absolute, or relative to the CSV file)
//    • http(s) URLs (Cloudinary will fetch them directly)
//
//  Rows are upserted by part_number, so re-running is idempotent.
//  If image_paths is blank on a re-run, existing image_urls
//  in the DB are preserved (we don't overwrite with [] ).
// ============================================================

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { parse } from "csv-parse/sync";
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "../lib/supabase.js";

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");

if (!csvPath) {
  console.error("Usage: node scripts/import.js <csv-path> [--dry-run]");
  process.exit(1);
}

const absCsvPath = resolve(csvPath);
if (!existsSync(absCsvPath)) {
  console.error(`CSV not found: ${absCsvPath}`);
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const csvDir = dirname(absCsvPath);
const rows = parse(readFileSync(absCsvPath, "utf8"), {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

console.log(
  `Loaded ${rows.length} rows from ${absCsvPath}` +
  (dryRun ? "  [DRY RUN — no DB writes, no image uploads]" : "")
);

const REQUIRED = ["part_number", "description", "mrp", "company_brand"];
const CONCURRENCY = dryRun ? 1 : 4;

let ok = 0;
let failed = 0;
const errors = [];
const queue = rows.map((r, i) => ({ row: r, lineNo: i + 2 })); // +2: header is line 1
const total = queue.length;

const workers = Array.from({ length: CONCURRENCY }, () => runWorker());
await Promise.all(workers);

console.log(""); // newline after progress
console.log(`Done — OK: ${ok}, FAILED: ${failed}`);

if (errors.length) {
  console.log("\nFailures:");
  for (const e of errors) {
    console.log(`  line ${e.lineNo} (${e.partNumber || "?"}): ${e.error}`);
  }
  process.exit(1);
}

// ── Worker loop ───────────────────────────────────────────────
async function runWorker() {
  while (queue.length) {
    const { row, lineNo } = queue.shift();
    try {
      await importRow(row);
      ok++;
    } catch (err) {
      failed++;
      errors.push({
        lineNo,
        partNumber: row.part_number,
        error: err.message,
      });
    }
    if ((ok + failed) % 5 === 0 || ok + failed === total) {
      process.stdout.write(
        `\rOK ${ok} | FAIL ${failed} | ${ok + failed}/${total}    `
      );
    }
  }
}

// ── Per-row import ────────────────────────────────────────────
async function importRow(row) {
  for (const f of REQUIRED) {
    if (!row[f] || !String(row[f]).trim()) {
      throw new Error(`missing required field "${f}"`);
    }
  }

  const mrp = parseFloat(row.mrp);
  if (!Number.isFinite(mrp) || mrp <= 0) {
    throw new Error(`mrp must be a positive number, got "${row.mrp}"`);
  }

  const imageUrls = dryRun
    ? []
    : await uploadImages(row.image_paths, row.part_number);

  const record = {
    part_number:       row.part_number.trim().toUpperCase(),
    description:       row.description.trim(),
    application:       row.application?.trim() || null,
    mrp,
    basic_price:       row.basic_price ? parseFloat(row.basic_price) : null,
    gst_rate:          row.gst_rate ? parseFloat(row.gst_rate) : 18,
    hsn_code:          row.hsn_code?.trim() || null,
    company_brand:     row.company_brand.trim(),
    manufacturer_name: row.manufacturer_name?.trim() || null,
    category:          row.category?.trim() || null,
    updated_at:        new Date().toISOString(),
  };

  // Only overwrite image_urls when we actually uploaded new images.
  // Preserves existing URLs on re-runs that leave image_paths blank.
  if (imageUrls.length) record.image_urls = imageUrls;

  if (dryRun) return;

  const { error } = await supabase
    .from("spare_parts")
    .upsert(record, { onConflict: "part_number" });

  if (error) throw new Error(`supabase: ${error.message}`);
}

// ── Image upload — local file or http(s) URL ──────────────────
async function uploadImages(rawList, partNumber) {
  const items = (rawList || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!items.length) return [];

  const urls = [];
  for (const item of items) {
    const source = /^https?:\/\//i.test(item)
      ? item
      : isAbsolute(item)
      ? item
      : resolve(csvDir, item);

    if (!/^https?:\/\//i.test(source) && !existsSync(source)) {
      throw new Error(`image not found: ${source}`);
    }

    const result = await cloudinary.uploader.upload(source, {
      folder: "autospares/spare-parts",
      public_id: `${partNumber.toLowerCase()}-${urls.length + 1}`,
      overwrite: true,
    });
    urls.push(result.secure_url);
  }
  return urls;
}
