import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

export const Route = createFileRoute("/merch")({
  head: () => ({
    meta: [
      { title: "Merch | SmartDev ERP" },
      { name: "description", content: "SmartDev ERP branded merchandise." },
      { property: "og:title", content: "Merch | SmartDev ERP" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/merch" },
    ],
  }),
  component: () => <IndexPage initialPage="merch" />,
});
