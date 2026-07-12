import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a fresh deploy, this file and its sibling chunks get new content
// hashes (e.g. index-CMooo9G4.js -> index-XyZ123.js). Any tab left open
// from before the deploy — or any visitor whose browser cached the old
// index.html — still references the old hashed filenames, which now 404 on
// the CDN. Vite's dynamic `import()` rejects with "Failed to fetch
// dynamically imported module" in that case and dispatches a
// `vite:preloadError` event on `window`. Catch it and force a single hard
// reload so the visitor picks up the new index.html + new hashes instead of
// being stuck on an error screen.
if (typeof window !== "undefined") {
  const RELOAD_FLAG = "sd_chunk_reload_attempted";

  window.addEventListener("vite:preloadError", (event) => {
    // Guard against a reload loop if the visitor is genuinely offline or a
    // deploy is actually broken: only auto-reload once per browser tab.
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
    event.preventDefault();
    window.location.reload();
  });

  // If the app then loads and stays up for a few seconds, this bundle is
  // healthy — clear the flag so a *future* deploy can still trigger the
  // auto-reload for this same tab instead of being permanently suppressed.
  window.addEventListener("load", () => {
    setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 5000);
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
