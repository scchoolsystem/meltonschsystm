import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing | SmartDev ERP" },
      { name: "description", content: "SmartDev ERP pricing for schools — see plans, modules and add-ons for the all-in-one school management system." },
      { property: "og:title", content: "Pricing | SmartDev ERP" },
      { property: "og:description", content: "Plans, modules and add-ons for SmartDev ERP." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/pricing" },
    ],
  }),
  component: () => <IndexPage initialPage="pricing" />,
});
