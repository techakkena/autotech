import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ── User frontend runs on port 5173 ───────────────────────────
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ✅ Fix - pointing to Koyeb
proxy: {
  '/api': {
    target: 'https://agreed-doti-techvizag-4b1bfc58.koyeb.app',
    changeOrigin: true,
    secure: true,
  }
},
  },
});
