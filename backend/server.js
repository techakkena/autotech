// ============================================================
//  server.js  —  AutoSpares API entry point
// ============================================================

import "dotenv/config";
import express from "express";
import cors from "cors";
import uploadRoutes from './routes/upload.js';

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

const allowedOrigins = [
  ...(process.env.FRONTEND_URL || "").split(","),
  ...(process.env.ADMIN_URL || "").split(","),
]
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const normalized = origin.replace(/\/$/, "");

    // Allow exact matches from env vars
    if (allowedOrigins.includes(normalized)) return cb(null, true);

    // Allow ALL Vercel preview deployments for your projects
    if (/https:\/\/autotech-.*\.vercel\.app$/.test(normalized)) return cb(null, true);

    console.warn(`CORS blocked origin: ${origin}`);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
//app.options("*", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth",     authRoutes);
app.use("/api/parts",    partsRoutes);
app.use("/api/identify", identifyRoutes);
app.use("/api/admin",    adminRoutes);
app.use('/api/upload', uploadRoutes);

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

// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () => {
//   console.log(`AutoSpares API listening on http://localhost:${PORT}`);
// });
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
;
