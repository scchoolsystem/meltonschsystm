import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// ─── Desktop SPA build ────────────────────────────────────────────────────────
// Plain static SPA — no SSR, no Cloudflare Worker.
// Output → dist-desktop/   (tauri.conf.json points frontendDist here)
// The UI loads from disk; all data still comes from Supabase over the internet.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  // Point vite at the desktop index.html, not the SSR root
  root: ".",
  build: {
    outDir: "dist-desktop",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
