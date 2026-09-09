import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

// "Our Story" used to only be reachable as a client-side hash on the
// homepage (/#story), so it never got its own indexable, shareable URL.
// This thin route renders the exact same marketing shell pre-set to that
// section, giving it a real address search engines and links can point to.
export const Route = createFileRoute("/story")({
  head: () => ({
    meta: [
      { title: "Our Story | SmartDev ERP" },
      { name: "description", content: "The story behind SmartDev ERP — why it was built, who it's for, and the mission driving a modern school management system for Kenya & East Africa." },
      { property: "og:title", content: "Our Story | SmartDev ERP" },
      { property: "og:description", content: "The story behind SmartDev ERP and the mission driving it." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/story" },
    ],
  }),
  component: () => <IndexPage initialPage="story" />,
});
