import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Skeleton } from "@/components/ui/skeleton";

// Shown when a route transition takes longer than defaultPendingMs. Without
// this, no route in the app has its own pendingComponent, so a tab switch
// (e.g. timetable -> analytics) just sits on the old screen — URL already
// changed, UI frozen — until the new route's data finishes loading. This
// gives instant visual feedback instead of an apparent freeze.
function DefaultPending() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

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
    // Prefetch a route's chunk + data as soon as the user hovers/focuses a
    // Link (e.g. a sidebar tab), not only when they actually click it. On a
    // fast connection this makes most tab switches feel instant since the
    // chunk is already in memory by click time.
    defaultPreload: "intent",
    // Don't flash a skeleton for transitions that resolve fast (<150ms) —
    // avoids UI flicker on cached/quick navigations — but show one for
    // anything slower instead of leaving the screen looking frozen.
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
    defaultPendingComponent: DefaultPending,
  });

  return router;
};
