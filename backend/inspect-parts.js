// ============================================================
//  inspect-parts.js  —  one-off: cross-check DB rows vs Vision vocabulary
//  Run:  node inspect-parts.js
//  Purpose: tell us whether identify.js failures are a SEARCH bug or
//  a DATA bug. If common Vision labels don't appear in any rows, the
//  fix is to enrich the data, not the matching code.
// ============================================================

import "dotenv/config";
import { supabase } from "./lib/supabase.js";

// Words Google Vision commonly returns for auto-parts photos.
const VISION_VOCAB = [
  "brake", "disc", "rotor", "caliper", "pad", "drum",
  "tire", "tyre", "tread", "wheel", "rim",
  "filter", "oil", "air", "fuel",
  "exhaust", "muffler", "pipe", "manifold",
  "spark", "plug", "ignition", "coil",
  "battery", "alternator", "starter",
  "suspension", "shock", "absorber", "strut", "spring",
  "engine", "piston", "valve", "gasket", "belt", "pulley",
  "clutch", "gear", "transmission",
  "hose", "pump", "radiator", "fan",
  "headlight", "taillight", "mirror", "bumper",
];

const TEXT_COLUMNS = [
  "part_number",
  "description",
  "application",
  "company_brand",
  "manufacturer_name",
  "category",
];

async function main() {
  console.log("\n📊  Fetching sample of spare_parts...");

  const { data, error, count } = await supabase
    .from("spare_parts")
    .select(TEXT_COLUMNS.join(","), { count: "exact" })
    .limit(500);

  if (error) {
    console.error("❌  Query error:", error.message);
    process.exit(1);
  }

  console.log(`✅  Total rows in spare_parts: ${count}`);
  console.log(`✅  Sample size pulled:        ${data.length}\n`);

  if (data.length === 0) {
    console.log("⚠️   Table is EMPTY. That's the entire problem.");
    return;
  }

  // ── Show 3 example rows so we can see what the text actually looks like ──
  console.log("─".repeat(70));
  console.log("📋  EXAMPLE ROWS (first 3):");
  console.log("─".repeat(70));
  data.slice(0, 3).forEach((row, i) => {
    console.log(`\n  Row ${i + 1}:`);
    TEXT_COLUMNS.forEach((c) => {
      const val = row[c] == null ? "(null)" : String(row[c]);
      console.log(`    ${c.padEnd(20)} ${val.slice(0, 80)}`);
    });
  });

  // ── Coverage: for each Vision word, how many rows mention it? ──
  console.log("\n" + "─".repeat(70));
  console.log("🎯  VOCABULARY COVERAGE  (rows that contain each Vision word)");
  console.log("─".repeat(70));

  const haystacks = data.map((row) =>
    TEXT_COLUMNS.map((c) => (row[c] || "").toString().toLowerCase()).join(" ")
  );

  const hits = VISION_VOCAB
    .map((word) => ({
      word,
      count: haystacks.filter((h) => h.includes(word)).length,
    }))
    .sort((a, b) => b.count - a.count);

  hits.forEach(({ word, count }) => {
    const pct = ((count / data.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.min(40, Math.floor(count / data.length * 40)));
    console.log(`  ${word.padEnd(14)} ${String(count).padStart(4)} rows  ${pct.padStart(5)}%  ${bar}`);
  });

  const totalHits = hits.reduce((s, h) => s + h.count, 0);
  const dryWords = hits.filter((h) => h.count === 0);

  console.log("\n" + "─".repeat(70));
  console.log("📊  SUMMARY");
  console.log("─".repeat(70));
  console.log(`  Total Vision-vocab hits across sample:  ${totalHits}`);
  console.log(`  Vision words with ZERO matches:         ${dryWords.length}/${VISION_VOCAB.length}`);
  if (dryWords.length > 0) {
    console.log(`    → ${dryWords.map((w) => w.word).join(", ")}`);
  }

  console.log("\n💡  INTERPRETATION:");
  if (totalHits === 0) {
    console.log("    DB rows contain NONE of the common auto-part words Vision returns.");
    console.log("    The matching code is fine — the data is the problem.");
    console.log("    Fix: enrich description/category with human-readable terms.");
  } else if (dryWords.length > VISION_VOCAB.length * 0.7) {
    console.log("    DB has narrow vocabulary coverage. Most Vision labels will miss.");
    console.log("    Fix: add a `tags` or `keywords` column with generic descriptors.");
  } else {
    console.log("    DB vocabulary looks reasonable. If real uploads still return nothing,");
    console.log("    re-check the labels Vision is actually producing for YOUR test image.");
  }
  console.log();
}

main().catch((err) => {
  console.error("❌  Fatal:", err);
  process.exit(1);
});
