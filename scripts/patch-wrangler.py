import json, sys
f = "dist/server/wrangler.json"
w = json.load(open(f))
w["routes"] = [
  {"pattern": "smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "www.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "*.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
]
json.dump(w, open(f, "w"), indent=2)
print("✓ wrangler.json routes patched")
