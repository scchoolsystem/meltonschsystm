import { createFileRoute } from "@tanstack/react-router";
import { IndexPage } from "./index";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us | SmartDev ERP" },
      { name: "description", content: "Get in touch with SmartDev ERP — sales, support and general enquiries for schools in Kenya & East Africa." },
      { property: "og:title", content: "Contact Us | SmartDev ERP" },
      { property: "og:description", content: "Get in touch with SmartDev ERP." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://smartdev.co.ke/contact" },
    ],
  }),
  component: () => <IndexPage initialPage="contact" />,
});
