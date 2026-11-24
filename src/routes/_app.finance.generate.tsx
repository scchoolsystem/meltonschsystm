import { createFileRoute, redirect } from "@tanstack/react-router";

// "Bulk Generate" lives on the Fee Structures page ("Generate term invoices")
// and in the Invoices page "Issue Invoice" dialog. This route used to contain a
// stray copy of the JaaS token API, which made /finance/generate return 500.
export const Route = createFileRoute("/_app/finance/generate")({
  beforeLoad: () => {
    throw redirect({ to: "/finance/fees" });
  },
});
