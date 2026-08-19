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

// ─────────────────────────────────────────────────────────────────────────
// Release download redirect.
//
// The repo is now PUBLIC, so GitHub's release assets are reachable directly
// by anonymous visitors — no server-side proxy or token is required for
// this to work. The Worker just resolves which asset is "latest" and 302s
// the visitor straight to GitHub's CDN (browser_download_url).
//
// RELEASES_GITHUB_TOKEN is now OPTIONAL: if present, it's sent so this
// lookup counts against the token's 5,000/hr quota instead of the shared
// 60/hr anonymous quota for the Worker's egress IP. If the token is ever
// missing, expired, or revoked, the lookup still works unauthenticated
// (public repos allow this) — it just has a lower shared rate limit.
// This means an expired token can no longer take the download page down.
// ─────────────────────────────────────────────────────────────────────────

const RELEASES_GITHUB_REPO = "scchoolsystem/meltonschsystm";

type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = { assets: GithubAsset[] };

function pickReleaseAsset(assets: GithubAsset[], kind: "android" | "windows"): GithubAsset | undefined {
  if (kind === "android") {
    return assets.find((a) => /\.apk$/i.test(a.name));
  }
  return (
    assets.find((a) => /setup\.exe$/i.test(a.name)) ??
    assets.find((a) => /\.exe$/i.test(a.name)) ??
    assets.find((a) => /\.msi$/i.test(a.name))
  );
}

async function handleReleaseDownload(kind: "android" | "windows", env: Env): Promise<Response> {
  const token = env.RELEASES_GITHUB_TOKEN;

  const githubHeaders: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "smartdev-erp-release-proxy",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    githubHeaders.Authorization = `Bearer ${token}`;
  } else {
    console.warn("RELEASES_GITHUB_TOKEN not set — using unauthenticated GitHub API (60 req/hr shared limit)");
  }

  const releaseRes = await fetch(
    `https://api.github.com/repos/${RELEASES_GITHUB_REPO}/releases/latest`,
    { headers: githubHeaders },
  );
  if (!releaseRes.ok) {
    const body = await releaseRes.text().catch(() => "");
    console.error(`GitHub releases lookup failed: ${releaseRes.status} ${releaseRes.statusText} — ${body}`);
    return new Response("Could not find the latest release.", { status: 502 });
  }
  const release = (await releaseRes.json()) as GithubRelease;
  const asset = pickReleaseAsset(release.assets ?? [], kind);
  if (!asset) {
    console.error(`No matching ${kind} asset in latest release. Assets: ${JSON.stringify(release.assets?.map((a) => a.name))}`);
    return new Response("Release asset not found.", { status: 404 });
  }

  // Public repo: browser_download_url is directly fetchable by anyone,
  // no auth needed. Redirect the visitor straight to GitHub's CDN instead
  // of streaming bytes through the Worker (faster, less Worker CPU/egress).
  return Response.redirect(asset.browser_download_url, 302);
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

    const url = new URL(request.url);
    if (url.pathname === "/dl/android") {
      return handleReleaseDownload("android", env as Env);
    }
    if (url.pathname === "/dl/windows") {
      return handleReleaseDownload("windows", env as Env);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return await stripCfChallengeScripts(normalized);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
