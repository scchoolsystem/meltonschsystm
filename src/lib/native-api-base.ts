/**
 * Native apps (Capacitor Android/iOS, Tauri desktop) load the bundled UI from
 * a local scheme (capacitor://localhost, tauri://localhost, http://localhost
 * etc). That origin has no server — TanStack Start server functions
 * (`useServerFn`, `/_serverFn/*`) and any other same-origin API routes must
 * instead be sent to the dedicated app API host.
 *
 * This module patches `window.fetch` so any *relative* request issued by the
 * app is rewritten to an absolute URL against APP_API_ORIGIN when running
 * inside a native shell. Web deployments (smartdev.co.ke, app.smartdev.co.ke,
 * admin.smartdev.co.ke) are completely unaffected — fetch behaves normally.
 */

export const APP_API_ORIGIN = "https://app.smartdev.co.ke";

function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const capacitorNative = (window as any)?.Capacitor?.isNativePlatform?.() === true;
  const tauriNative = typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
  return capacitorNative || tauriNative;
}

let patched = false;

export function installNativeApiBasePatch() {
  if (patched || typeof window === "undefined") return;
  if (!isNativeShell()) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // Only rewrite relative URLs (server functions, /_serverFn/*, /api/*).
      // Absolute URLs (e.g. https://<project>.supabase.co/...) pass through untouched.
      if (typeof input === "string" && input.startsWith("/")) {
        return originalFetch(APP_API_ORIGIN + input, init);
      }
      if (input instanceof URL && input.origin !== APP_API_ORIGIN && (input.protocol === "capacitor:" || input.protocol === "tauri:" || input.protocol === "http:" || input.protocol === "https:")) {
        // Relative URL constructed against the native origin — rewrite host, keep path.
        if (input.origin === window.location.origin) {
          return originalFetch(APP_API_ORIGIN + input.pathname + input.search + input.hash, init);
        }
      }
    } catch {
      // fall through to default fetch on any parsing issue
    }
    return originalFetch(input as any, init);
  };

  patched = true;
}
