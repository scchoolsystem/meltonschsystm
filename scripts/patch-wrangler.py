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
w.setdefault("assets", {})["run_worker_first"] = ["/*", "!/assets/*"]
json.dump(w, open(f, "w"), indent=2)
print("Done: wrangler.json routes + assets.run_worker_first patched")
