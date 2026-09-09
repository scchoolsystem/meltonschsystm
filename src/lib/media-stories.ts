import { supabase } from "@/integrations/supabase/client";

// Shape of one item in the "media_items" landing_content row, edited from
// Platform Admin → Website Content → Media & Stories, and shown publicly on
// the marketing site's Media page and on individual shareable story pages
// (see src/routes/media.$slug.tsx).
export type MediaItemPublic = {
  title: string;
  type: "update" | "press" | "video" | "photo";
  cover_image_url: string | null;
  date: string;
  summary: string;
  body: string;
  external_url: string;
  // Publish/lock workflow (see platform.website.tsx MediaEditor). Optional
  // so older stories saved before this field existed are treated as
  // "published" — never hidden retroactively.
  status?: "draft" | "published";
};

export const MEDIA_TYPE_LABELS: Record<MediaItemPublic["type"], string> = {
  update: "Company update",
  press: "Press mention",
  video: "Video",
  photo: "Photo story",
};

// Turns a story title into a readable, URL-safe slug, e.g.
// "M-Pesa Fees Just Got Easier!" -> "m-pesa-fees-just-got-easier".
export function slugifyMediaTitle(title: string): string {
  const slug = (title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "story";
}

// Stories have no persisted id — they live as a JSON array in a single
// landing_content row — so the shareable URL is the slugified title, with
// the array index kept as a fallback for older links or duplicate titles.
export function mediaItemSlug(item: MediaItemPublic, index: number): string {
  const base = slugifyMediaTitle(item.title);
  return base === "story" ? String(index) : base;
}

export function findMediaItemBySlug(
  items: MediaItemPublic[],
  slug: string,
): { item: MediaItemPublic; index: number } | null {
  const bySlug = items.findIndex((m, i) => mediaItemSlug(m, i) === slug);
  if (bySlug !== -1) return { item: items[bySlug], index: bySlug };

  const asIndex = Number(slug);
  if (Number.isInteger(asIndex) && items[asIndex]) return { item: items[asIndex], index: asIndex };

  return null;
}

// Plain Supabase reads against a public table — safe to call from a route
// loader (runs server-side on first load) as well as from the browser.
export async function fetchMediaItems(): Promise<MediaItemPublic[]> {
  const { data, error } = await (supabase as any)
    .from("landing_content")
    .select("content")
    .eq("section", "media_items")
    .maybeSingle();
  if (error) return [];
  const items = (data?.content?.items ?? []) as MediaItemPublic[];
  // Drafts (and anything still awaiting owner verification) never show on
  // the public site — only fully published stories do. Items with no
  // `status` at all predate this field and are treated as published.
  return items.filter((m) => (m.status ?? "published") === "published");
}

export async function fetchSiteBrandName(): Promise<string> {
  const { data, error } = await (supabase as any)
    .from("landing_content")
    .select("content")
    .eq("section", "site_meta")
    .maybeSingle();
  const brandName = data?.content?.brand_name;
  if (error || !brandName) return "SMART DEV";
  return brandName as string;
}
