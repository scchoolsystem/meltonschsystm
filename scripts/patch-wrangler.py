import json, sys
f = "dist/server/wrangler.json"
w = json.load(open(f))
w["routes"] = [
  {"pattern": "smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "www.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "*.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
]
# Route everything except /assets/* through the Worker first, so
# applySecurityHeaders() in server.ts runs on documents/navigations.
# /assets/* (hashed JS/CSS bundles) stay excluded so Cloudflare's Asset
# Worker keeps serving them directly — routing them through the Worker
# 404s them, since server.ts only knows how to call the SSR handler.
# /legal.html is also excluded so it's served as a plain static file.
# html_handling is set to "none" because Cloudflare's default clean-URL
# behavior auto-redirects /legal.html <-> /legal — combined with our own
# app-level /legal -> /legal.html redirect, that created an infinite
# redirect loop (ERR_TOO_MANY_REDIRECTS) entirely at the edge, before
# either request ever reached this Worker. /legal itself is NOT excluded
# from run_worker_first — it needs to hit the Worker so our app's single
# controlled redirect (src/routes/legal.tsx) is what sends it to
# /legal.html, instead of Cloudflare doing its own redirect dance.
w.setdefault("assets", {})["run_worker_first"] = ["/*", "!/assets/*", "!/legal.html"]
w["assets"]["html_handling"] = "none"
json.dump(w, open(f, "w"), indent=2)
print("Done: wrangler.json routes + assets.run_worker_first patched")
