// ============================================================
//  test-vision.js  —  Run this to test if Vision API works
//  Run: node test-vision.js
//  Place this in: autospares/backend/test-vision.js
// ============================================================

import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.GOOGLE_VISION_API_KEY;

if (!API_KEY) {
  console.error("❌  GOOGLE_VISION_API_KEY is missing from .env");
  process.exit(1);
}

console.log("✅  API Key found:", API_KEY.slice(0, 10) + "...");

// Test with a public spare part image URL
const TEST_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Brake_disc_and_caliper.jpg/640px-Brake_disc_and_caliper.jpg";

async function testVision() {
  console.log("\n⬇️   Downloading test image locally (Vision API can't fetch some external URLs directly)...");

  const imgRes = await fetch(TEST_IMAGE_URL, {
    headers: { "User-Agent": "autotech-test/1.0 (test@example.com)" },
  });
  if (!imgRes.ok) {
    console.error(`❌  Failed to download test image: ${imgRes.status} ${imgRes.statusText}`);
    return;
  }
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const imgBase64 = imgBuffer.toString("base64");
  console.log(`✅  Image downloaded (${(imgBuffer.length / 1024).toFixed(1)} KB)`);

  console.log("\n🔍  Calling Google Vision API...");

  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imgBase64 },
              features: [
                { type: "LABEL_DETECTION",  maxResults: 10 },
                { type: "TEXT_DETECTION" },
                { type: "WEB_DETECTION",    maxResults: 5 },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // Check for API errors
    if (data.error) {
      console.error("❌  Vision API error:", data.error.message);
      console.error("    Code:", data.error.code);
      console.error("    Status:", data.error.status);
      console.log("\n👉  Possible fixes:");
      console.log("    1. Enable Vision API at: https://console.cloud.google.com/apis/library/vision.googleapis.com");
      console.log("    2. Check your API key has Vision API permission");
      console.log("    3. Make sure billing is enabled on your Google Cloud project");
      return;
    }

    if (data.responses?.[0]?.error) {
      console.error("❌  Response error:", data.responses[0].error.message);
      return;
    }

    // Success — print what Vision returned
    console.log("\n✅  Vision API is WORKING!\n");

    const labels = data.responses[0].labelAnnotations || [];
    console.log("📋  Labels detected:");
    labels.forEach(l => {
      console.log(`    • ${l.description} (${Math.round(l.score * 100)}% confidence)`);
    });

    const texts = data.responses[0].textAnnotations || [];
    if (texts.length > 0) {
      console.log("\n📝  Text detected:");
      console.log("    ", texts[0]?.description?.replace(/\n/g, " ") || "none");
    }

    const web = data.responses[0].webDetection?.webEntities || [];
    if (web.length > 0) {
      console.log("\n🌐  Web entities:");
      web.forEach(e => console.log(`    • ${e.description} (${Math.round((e.score || 0) * 100)}%)`));
    }

    // Simulate what identify.js does with these labels
    const IGNORE_LABELS = new Set([
      "product", "object", "material", "metal", "hardware",
      "tool", "equipment", "item", "part", "component",
      "automotive", "vehicle", "car", "auto",
    ]);
    const usefulLabels = labels
      .filter(l => l.score >= 0.6 && !IGNORE_LABELS.has(l.description.toLowerCase()))
      .map(l => l.description.toLowerCase());

    console.log("\n🔎  Search terms that would be used in DB query:");
    console.log("   ", usefulLabels.length ? usefulLabels.join(", ") : "NONE — this is why search fails!");

    if (usefulLabels.length === 0) {
      console.log("\n⚠️  No useful labels found. This means:");
      console.log("    Vision API works but labels are too generic to match your DB.");
      console.log("    Fix: Add more specific descriptions to your spare_parts data.");
    }

  } catch (err) {
    console.error("❌  Network/fetch error:", err.message);
  }
}

testVision();