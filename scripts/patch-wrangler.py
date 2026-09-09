import json, sys
f = "dist/server/wrangler.json"
w = json.load(open(f))
w["routes"] = [
  {"pattern": "smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "www.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
  {"pattern": "*.smartdev.co.ke/*", "zone_name": "smartdev.co.ke"},
]
# Route everything except /assets/*, /images/*, /legal.html, and a handful
# of root-level static files (favicon, PWA manifest, icons, robots.txt,
# sitemap.xml) through the Worker first, so applySecurityHeaders() in
# server.ts runs on documents/navigations.
# /assets/* (hashed JS/CSS bundles) stay excluded so Cloudflare's Asset
# Worker keeps serving them directly — routing them through the Worker
# 404s them, since server.ts only knows how to call the SSR handler.
# /images/* (static screenshots/marketing images copied verbatim from
# public/) are excluded for the same reason: they're plain files, not
# routes, and the SSR handler has no route for them — sending them
# through the Worker returned the app shell instead of the image bytes,
# which is why marketing-page screenshots showed up as broken images.
# The same bug hit /favicon.ico, /manifest.webmanifest, /icons/*,
# /robots.txt and /sitemap.xml too, for the exact same reason: none of
# them are app routes, so the Worker returned the app's own 404 page
# instead of the actual file — which is why the browser tab showed a
# generic globe instead of the SmartDev icon.
# /legal.html is also excluded so it's served as a plain static file.
# html_handling is set to "none" because Cloudflare's default clean-URL
# behavior auto-redirects /legal.html <-> /legal — combined with our own
# app-level /legal -> /legal.html redirect, that created an infinite
# redirect loop (ERR_TOO_MANY_REDIRECTS) entirely at the edge, before
# either request ever reached this Worker. /legal itself is NOT excluded
# from run_worker_first — it needs to hit the Worker so our app's single
# controlled redirect (src/routes/legal.tsx) is what sends it to
# /legal.html, instead of Cloudflare doing its own redirect dance.
w.setdefault("assets", {})["run_worker_first"] = [
    "/*",
    "!/assets/*",
    "!/images/*",
    "!/legal.html",
    "!/favicon.ico",
    "!/manifest.webmanifest",
    "!/robots.txt",
    "!/sitemap.xml",
    "!/icons/*",
]
w["assets"]["html_handling"] = "none"
json.dump(w, open(f, "w"), indent=2)
print("Done: wrangler.json routes + assets.run_worker_first patched")
