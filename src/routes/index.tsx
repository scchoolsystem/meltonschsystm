import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { SchoolPicker } from "@/components/SchoolPicker";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { slug, loading } = useTenant();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    console.log("DEBUG - loading:", loading);
    console.log("DEBUG - slug:", slug);
    if (!loading) setChecked(true);
  }, [loading]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="ml-2">Loading... (loading: {String(loading)}, checked: {String(checked)})</p>
      </div>
    );
  }

  if (!slug) {
    console.log("DEBUG - Rendering SchoolPicker because slug is null");
    return (
      <div>
        <div className="bg-yellow-200 p-4 text-center">
          <strong>Debug:</strong> slug is null, showing school picker
        </div>
        <SchoolPicker onPicked={(pickedSlug) => {
          console.log("DEBUG - onPicked called with:", pickedSlug);
          if (pickedSlug && typeof window !== "undefined") {
            const host = window.location.hostname;
            const parts = host.split(".");
            const root = parts.length >= 2 ? parts.slice(-2).join(".") : host;
            const redirectUrl = "https://" + pickedSlug + "." + root + "/login";
            console.log("DEBUG - redirecting to:", redirectUrl);
            window.location.href = redirectUrl;
          }
        }} />
      </div>
    );
  }

  console.log("DEBUG - slug exists, redirecting to /login");
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
  return null;
}
