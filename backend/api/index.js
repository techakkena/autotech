// ============================================================
//  api/index.js  —  Vercel serverless entry for the Express app
//  Mirrors server.js but exports the app instead of calling
//  app.listen(). Vercel invokes this as a Node serverless function.
// ============================================================

import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes     from "../routes/auth.js";
import partsRoutes    from "../routes/parts.js";
import identifyRoutes from "../routes/identify.js";
import adminRoutes    from "../routes/admin.js";

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
}

const app = express();

const allowedOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(normalized)) return cb(null, true);
    console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(", ")}`);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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

export default app;
