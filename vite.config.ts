import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    // Emit a self-contained SPA shell (dist/client/index.html) in addition to
    // the SSR server build. Native apps (Capacitor/Tauri) load this shell
    // directly with no server; client-side routing then takes over for all
    // routes, and server functions are reached via app.smartdev.co.ke
    // (see src/lib/native-api-base.ts).
    spa: {
      enabled: true,
      prerender: { outputPath: "/index.html" },
    },
  },
});
