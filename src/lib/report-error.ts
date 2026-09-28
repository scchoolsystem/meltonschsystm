// ---------------------------------------------------------------------------
// Silent failure reporting (browser side).
//
//   reportError(err, { source, code, context })
//
// Sends the failure to /api/public/report-error, which logs it for the
// platform owner + the support staff allocated to the user's school. It never
// throws, never shows a toast/dialog, and never waits on the UI. If the
// request can't be delivered (offline, worker down, deploy in progress) the
// report is parked in localStorage and re-sent on the next page load / when
// the connection comes back, so a failure isn't lost just because the thing
// that failed was the network.
// ---------------------------------------------------------------------------

export type ReportOptions = {
  source: string; // 'live_class' | 'client' | 'render' | ...
  code?: string;
  severity?: "warning" | "error" | "critical";
  context?: Record<string, unknown>;
};

type Payload = {
  source: string;
  code?: string;
  severity: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  url?: string;
  at: string;
};

const ENDPOINT = "/api/public/report-error";
const QUEUE_KEY = "sd_error_queue_v1";
const MAX_QUEUE = 20;
const MAX_PER_SESSION = 25;
const DEDUPE_MS = 60_000;

let sentThisSession = 0;
const recent = new Map<string, number>();
let installed = false;

function toMessage(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack };
  if (typeof err === "string") return { message: err };
  try {
    const o = err as any;
    if (o?.message) return { message: String(o.message), stack: o.stack ? String(o.stack) : undefined };
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

function readQueue(): Payload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q: Payload[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    /* storage full / blocked — nothing more we can do */
  }
}

async function getToken(): Promise<string | undefined> {
  try {
    // Imported lazily so this module has zero import-time dependencies and
    // can still report when the supabase client is what failed to load.
    const { getSessionSafe } = await import("@/integrations/supabase/client");
    const { data } = await getSessionSafe(1500);
    return data.session?.access_token;
  } catch {
    return undefined;
  }
}

async function deliver(p: Payload): Promise<boolean> {
  try {
    const token = await getToken();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(p),
      keepalive: true,
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

async function flushQueue() {
  const q = readQueue();
  if (!q.length) return;
  writeQueue([]);
  const failed: Payload[] = [];
  for (const p of q) if (!(await deliver(p))) failed.push(p);
  if (failed.length) writeQueue(failed);
}

export function reportError(err: unknown, opts: ReportOptions): void {
  try {
    const { message, stack } = toMessage(err);
    const key = `${opts.source}|${opts.code ?? ""}|${message.slice(0, 120)}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    if (sentThisSession >= MAX_PER_SESSION) return;
    sentThisSession += 1;

    const payload: Payload = {
      source: opts.source,
      code: opts.code,
      severity: opts.severity ?? "error",
      message,
      stack,
      context: opts.context,
      url: typeof location !== "undefined" ? location.pathname + location.search : undefined,
      at: new Date().toISOString(),
    };

    void deliver(payload).then((ok) => {
      if (!ok) writeQueue([...readQueue(), payload]);
    });
  } catch {
    /* reporting must never break the app */
  }
}

// Browser noise that isn't a real failure and would only bury the real ones.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /AbortError/i,
  /The user aborted a request/i,
  /Non-Error promise rejection captured/i,
  /Loading chunk .* failed/i, // handled by the auto-reload in router.tsx
  /Failed to fetch dynamically imported module/i,
];

export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    const err = e.error ?? e.message;
    const { message } = toMessage(err);
    if (IGNORE.some((r) => r.test(message))) return;
    reportError(err, { source: "client", code: "UNCAUGHT_ERROR", context: { file: e.filename, line: e.lineno, col: e.colno } });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const { message } = toMessage(e.reason);
    if (IGNORE.some((r) => r.test(message))) return;
    reportError(e.reason, { source: "client", code: "UNHANDLED_REJECTION" });
  });

  window.addEventListener("online", () => void flushQueue());
  // Anything parked by a previous page load goes out now.
  setTimeout(() => void flushQueue(), 3_000);
}
