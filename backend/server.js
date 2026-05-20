// ============================================================
//  server.js  —  AutoSpares API entry point
// ============================================================

import "dotenv/config";
import express from "express";
import cors from "cors";

// ── Required env vars — fail fast if missing ──────────────────
const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_ANON_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "GOOGLE_VISION_API_KEY",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}
      
import authRoutes     from "./routes/auth.js";
import partsRoutes    from "./routes/parts.js";
import identifyRoutes from "./routes/identify.js";
import adminRoutes    from "./routes/admin.js";

const app = express();

app.use(
  cors({
    origin: (process.env.FRONTEND_URL || "http://localhost:5173").split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth",     authRoutes);
app.use("/api/parts",    partsRoutes);
app.use("/api/identify", identifyRoutes);
app.use("/api/admin",    adminRoutes);

app.get("/", (_req, res) =>
  res.json({ name: "AutoSpares API", health: "/health" })
);

app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString() })
);

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AutoSpares API listening on http://localhost:${PORT}`);
});
