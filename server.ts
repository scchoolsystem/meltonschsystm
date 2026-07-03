import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type Env = Record<string, string>;

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return false;
  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) return false;
  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) return response;
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// Strip Cloudflare challenge scripts injected into HTML responses.
// These break React hydration by blocking script execution.
async function stripCfChallengeScripts(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  let html = await response.text();

  // Remove CF Browser Integrity Check iframe injection (breaks React hydration)
  html = html.replace(/<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?challenge-platform[\s\S]*?\}\)\(\);<\/script>/g, "");

  // Ensure the TanStack entry module script is always present.
  // The $_TSR bootstrap sometimes fails to inject it on subdomain requests.
  const entryMatch = html.match(/["'](\/assets\/index-[^"']+\.js)["']/);
  if (entryMatch && !html.includes('<script type="module" src="' + entryMatch[1])) {
    html = html.replace("</body>", `<script type="module" src="${entryMatch[1]}"></script></body>`);
  }

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
}

// Content-Security-Policy — allowlist built from the app's actual external
// dependencies (Supabase, JaaS/8x8 video, font-awesome CDN, QR code images,
// Unsplash/Google Storage images). M-Pesa/Africa's Talking calls happen
// server-side only, so they don't need to appear here.
const CSP = [
  "default-src 'self'",
  // TanStack Start/Vite ship inline bootstrap scripts; hashing them per-build
  // isn't practical here, so 'unsafe-inline' is kept for script-src.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "font-src 'self' https://cdnjs.cloudflare.com data:",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://storage.googleapis.com https://api.qrserver.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.safaricom.co.ke https://sandbox.safaricom.co.ke https://api.africastalking.com https://8x8.vc",
  "frame-src 'self' https://8x8.vc",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(), payment=(self), usb=(), interest-cohort=()",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Bridge Cloudflare Worker vars/secrets into process.env so that
    // process.env.SUPABASE_URL etc. work in SSR code.
    if (env && typeof env === "object") {
      for (const [key, value] of Object.entries(env as Env)) {
        if (typeof value === "string") {
          process.env[key] = value;
        }
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const stripped = await stripCfChallengeScripts(normalized);
      return applySecurityHeaders(stripped);
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(brandedErrorResponse());
    }
  },
};
