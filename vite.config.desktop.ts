import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

// Desktop SPA build — completely separate from the SSR/Cloudflare build.
// - Entry: desktop/index.html  (NOT the repo root, so pnpm build ignores it)
// - Output: dist-desktop/      (tauri.conf.json frontendDist points here)
// - No SSR, no Cloudflare Worker — plain HTML/JS/CSS bundled into the installer.

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: path.resolve(__dirname, "./src/routes"),
      generatedRouteTree: path.resolve(__dirname, "./src/routeTree.gen.ts"),
    }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  root: "desktop",
  build: {
    outDir: "../dist-desktop",
    emptyOutDir: true,
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