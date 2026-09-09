#!/usr/bin/env node
// Refreshes the dynamic part of public/sitemap.xml: one <url> per published
// "Media & Stories" item (src/lib/media-stories.ts / Platform Admin →
// Website Content → Media & Stories). Those stories live in a Supabase
// table and change whenever someone publishes a new one, so they can't be
// hand-written into the sitemap the way the app's static pages are —
// everything between the MEDIA_STORIES_START/END markers gets replaced
// each time this runs.
//
// Run manually before a deploy, or wire it into your deploy pipeline:
//   node scripts/generate-sitemap.mjs
//
// Uses the same public Supabase URL + publishable (anon) key already
// embedded in src/integrations/supabase/client.ts — this only ever reads
// published, public content, same as the website itself does.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = join(__dirname, "..", "public", "sitemap.xml");
const SITE_URL = "https://smartdev.co.ke";

const SUPABASE_URL = "https://vpikrrytxeyybfhnozyt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LoBEcMCHCaFrg-oTLulmXw_qTRCsI26";

function slugifyMediaTitle(title) {
  const slug = (title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "story";
}

function mediaItemSlug(item, index, usedSlugs) {
  const base = slugifyMediaTitle(item.title);
  const slug = base === "story" ? String(index) : base;
  // Mirror findMediaItemBySlug: if two published stories slugify to the
  // same thing, only the first one is reachable at that slug, so don't
  // list a duplicate URL that would 404 the router.
  if (usedSlugs.has(slug)) return null;
  usedSlugs.add(slug);
  return slug;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  const { data, error } = await supabase
    .from("landing_content")
    .select("content")
    .eq("section", "media_items")
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch media_items from Supabase:", error.message);
    process.exit(1);
  }

  const items = data?.content?.items ?? [];
  const published = items.filter((m) => (m.status ?? "published") === "published");

  const usedSlugs = new Set();
  const urls = published
    .map((item, index) => {
      const slug = mediaItemSlug(item, index, usedSlugs);
      return slug ? `  <url><loc>${SITE_URL}/media/${slug}</loc></url>` : null;
    })
    .filter(Boolean);

  const block = [
    "  <!-- MEDIA_STORIES_START: regenerate with `node scripts/generate-sitemap.mjs` -->",
    ...urls,
    "  <!-- MEDIA_STORIES_END -->",
  ].join("\n");

  const sitemap = readFileSync(SITEMAP_PATH, "utf8");
  const updated = sitemap.replace(
    /  <!-- MEDIA_STORIES_START:.*?-->\n(?:.*\n)*?  <!-- MEDIA_STORIES_END -->/,
    block,
  );

  if (updated === sitemap && urls.length === 0) {
    console.log("No published media stories found; sitemap left unchanged.");
    return;
  }

  writeFileSync(SITEMAP_PATH, updated);
  console.log(`Wrote ${urls.length} media story URL(s) to ${SITEMAP_PATH}`);
}

main();
