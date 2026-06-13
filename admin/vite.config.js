import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ── Admin panel runs on port 5174 ─────────────────────────────
// ── Backend API proxied so no CORS issues in dev ──────────────


export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // ✅ Fix - pointing to Koyeb
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  }
},
  },
  // define: {
  //   // VITE_API_URL is empty in dev — proxy handles /api/*
  //   // In production set VITE_API_URL=https://your-backend.onrender.com/api
  //  //  VITE_API_BASE_URL=https://agreed-doti-techvizag-4b1bfc58.koyeb.app 
  //   "import.meta.env.VITE_API_URL": JSON.stringify(
  //     process.env.VITE_API_URL || ""
  //   ),
  // },
});
