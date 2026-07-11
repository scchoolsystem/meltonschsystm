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
# /legal and /legal.html are also excluded — both need to be handled
# purely by Cloudflare's static asset system. Cloudflare auto-redirects
# /legal.html -> /legal (clean URL). If either path were routed through
# the Worker instead, our app router had nothing to match it (404), or
# — if given its own redirecting route — would fight Cloudflare's redirect
# and loop forever (ERR_TOO_MANY_REDIRECTS).
w.setdefault("assets", {})["run_worker_first"] = ["/*", "!/assets/*", "!/legal.html", "!/legal"]
json.dump(w, open(f, "w"), indent=2)
print("Done: wrangler.json routes + assets.run_worker_first patched")
