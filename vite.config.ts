import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          // The earlier build showed one 1.1MB (329KB gzip) chunk loaded on
          // every single page, because nothing separated framework/vendor
          // code from route code. Route-level splitting itself was already
          // working (TanStack Router's plugin handles that) — this just
          // breaks that one always-loaded chunk into smaller pieces the
          // browser can fetch in parallel and cache independently, so a
          // deploy that only touches app code doesn't invalidate vendor JS
          // the visitor already has cached.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("/@supabase/")) return "vendor-supabase";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("date-fns")) return "vendor-date";
            if (/\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
            if (id.includes("@tanstack/react-router") || id.includes("@tanstack/router-core")) return "vendor-router";
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query-core")) return "vendor-query";
          },
        },
      },
    },
  },
});
