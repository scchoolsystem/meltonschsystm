import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download | SmartDev ERP" },
      { name: "description", content: "Download the SmartDev ERP app for Android and Windows, or use it in your browser." },
      { property: "og:title", content: "Download | SmartDev ERP" },
      { property: "og:description", content: "Get SmartDev ERP for Android, Windows, or your browser." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/download" },
    ],
  }),
  component: () => <IndexPage initialPage="download" />,
});
