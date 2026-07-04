import json, sys
f = "dist/server/wrangler.json"
w = json.load(open(f))
w["routes"] = [
  {"pattern": "smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "www.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "*.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
]
# Force every request (including static assets) through the Worker's fetch
# handler so applySecurityHeaders() in server.ts always runs. Without this,
# Cloudflare's Asset Worker serves matching static files (e.g. "/") directly
# and the security headers set in code never get attached.
w.setdefault("assets", {})["run_worker_first"] = True
json.dump(w, open(f, "w"), indent=2)
print("Done: wrangler.json routes + assets.run_worker_first patched")
