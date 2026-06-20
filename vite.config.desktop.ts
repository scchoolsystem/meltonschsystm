import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

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
    "@tanstack/start-server-core": path.resolve(__dirname, "./desktop/empty-stub.ts"),
    "@tanstack/start-storage-context": path.resolve(__dirname, "./desktop/empty-stub.ts"),
    "node:stream": path.resolve(__dirname, "./desktop/node-stream-stub.ts"),
    "node:stream/web": path.resolve(__dirname, "./desktop/node-stream-web-stub.ts"),
  },
},
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});