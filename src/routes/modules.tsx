import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

export const Route = createFileRoute("/modules")({
  head: () => ({
    meta: [
      { title: "Modules | SmartDev ERP" },
      { name: "description", content: "Explore SmartDev ERP's modules — academics, finance, attendance, boarding, transport, library and more, all in one school system." },
      { property: "og:title", content: "Modules | SmartDev ERP" },
      { property: "og:description", content: "Academics, finance, attendance, boarding, transport, library and more." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/modules" },
    ],
  }),
  component: () => <IndexPage initialPage="modules" />,
});
