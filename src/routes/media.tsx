import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

// Media & Stories listing page. Individual stories already have their own
// route at /media/$slug — this is the index that lists them, previously
// only reachable via the homepage's #media hash tab.
export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { title: "Media & Stories | SmartDev ERP" },
      { name: "description", content: "Company updates, press mentions, videos and photo stories from SmartDev ERP." },
      { property: "og:title", content: "Media & Stories | SmartDev ERP" },
      { property: "og:description", content: "Company updates, press mentions, videos and photo stories from SmartDev ERP." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/media" },
    ],
  }),
  component: () => <IndexPage initialPage="media" />,
});
