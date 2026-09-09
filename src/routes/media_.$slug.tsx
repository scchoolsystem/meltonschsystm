import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, GraduationCap, Newspaper, Video, Camera, ExternalLink, Share2, Check,
} from "lucide-react";
import {
  fetchMediaItems, fetchSiteBrandName, findMediaItemBySlug, type MediaItemPublic,
} from "@/lib/media-stories";
import { sanitizeStoryHtml } from "@/components/ui/rich-text-editor";

// Public, top-level route — sits OUTSIDE the `_app` layout (like /verify),
// so it loads for anyone with no login. This is the page a "Share" tap or
// link points to: one story, its own URL, with the school/company logo and
// the story's own title + cover image driving the link preview when it's
// shared on WhatsApp, Facebook, X, etc.

const SITE_URL = "https://smartdev.co.ke";
const FALLBACK_OG_IMAGE = `${SITE_URL}/images/teacher.png`;

const TYPE_META: Record<MediaItemPublic["type"], { label: string; icon: typeof Newspaper }> = {
  update: { label: "Company update", icon: Newspaper },
  press: { label: "Press mention", icon: Newspaper },
  video: { label: "Video", icon: Video },
  photo: { label: "Photo story", icon: Camera },
};

export const Route = createFileRoute("/media_/$slug")({
  loader: async ({ params }) => {
    const [items, brandName] = await Promise.all([fetchMediaItems(), fetchSiteBrandName()]);
    const found = findMediaItemBySlug(items, params.slug);
    return { story: found?.item ?? null, brandName, slug: params.slug };
  },
  head: ({ loaderData }) => {
    const story = loaderData?.story;
    const brandName = loaderData?.brandName ?? "SMART DEV";
    const slug = loaderData?.slug ?? "";
    const url = `${SITE_URL}/media/${slug}`;

    if (!story) {
      const title = `Story not found | ${brandName}`;
      return { meta: [{ title }, { property: "og:title", content: title }] };
    }

    const title = `${story.title} | ${brandName}`;
    const description = story.summary || `A story from ${brandName}.`;
    const image = story.cover_image_url || FALLBACK_OG_IMAGE;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: MediaStoryPage,
});

function LogoLink() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
        <GraduationCap className="w-5 h-5" />
      </div>
    </Link>
  );
}

function StoryNotFound({ brandName }: { brandName: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center gap-2">
          <LogoLink />
          <span className="font-bold text-lg tracking-tight">{brandName}</span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Story not found</h1>
          <p className="text-muted-foreground mb-6">
            This story may have been removed, or the link is out of date.
          </p>
          <a href="/#media" className="inline-flex items-center gap-2 text-primary font-medium hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to Media
          </a>
        </div>
      </div>
    </div>
  );
}

function MediaStoryPage() {
  const { story, brandName, slug } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);

  if (!story) return <StoryNotFound brandName={brandName} />;

  const meta = TYPE_META[story.type] ?? TYPE_META.update;
  const shareUrl = typeof window !== "undefined" ? window.location.href : `${SITE_URL}/media/${slug}`;

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: story.title, text: story.summary, url: shareUrl });
        return;
      } catch {
        // User cancelled the native share sheet — fall through to nothing.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header carries the same logo + brand mark as the marketing site,
          so a shared link still reads as "from SmartDev" even landing here
          directly instead of via the homepage. */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoLink />
            <span className="font-bold text-lg tracking-tight">{brandName}</span>
          </div>
          <a href="/#media" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> All stories
          </a>
        </div>
      </header>

      <main className="py-10">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide bg-primary/10 text-primary rounded-full px-2 py-0.5">
              <meta.icon className="w-3 h-3" /> {meta.label}
            </span>
            {story.date && <span className="text-xs text-muted-foreground">{story.date}</span>}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{story.title}</h1>
          {story.summary && <p className="mt-4 text-lg text-muted-foreground">{story.summary}</p>}

          {story.cover_image_url && (
            <div className="mt-6 rounded-xl overflow-hidden border bg-muted">
              <img src={story.cover_image_url} alt={story.title} className="w-full h-auto object-cover" />
            </div>
          )}

          {story.body && (
            <div
              className="mt-6 text-base leading-relaxed text-foreground/90 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3"
              // Stories written before the rich text editor was added are
              // plain text with real newlines and no tags — convert those
              // newlines to <br> so old stories still show their line
              // breaks. Stories written with the editor are already HTML.
              dangerouslySetInnerHTML={{
                __html: sanitizeStoryHtml(
                  /<[a-z][\s\S]*>/i.test(story.body) ? story.body : story.body.replace(/\n/g, "<br>"),
                ),
              }}
            />
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? "Link copied" : "Share this story"}
            </button>
            {story.external_url && (
              <a
                href={story.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                View source <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
