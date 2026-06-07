import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTenant, isNativeApp } from "@/hooks/use-tenant";
import { SchoolPicker } from "@/components/SchoolPicker";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const { slug, loading } = useTenant();
  const [checked, setChecked] = useState(false);
  const native = isNativeApp();

  useEffect(() => {
    if (!loading) setChecked(true);
  }, [loading]);

  // Still resolving stored slug
  if (!checked) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Native app with no school selected -> show picker
  if (native && !slug) {
    return <SchoolPicker onPicked={() => window.location.replace("/login")} />;
  }

  // Web with no subdomain -> redirect to marketing site or show picker
  if (!native && !slug) {
    if (typeof window !== "undefined") {
      window.location.replace("https://smartdev.co.ke");
    }
    return null;
  }

  // School resolved -> go to login
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
  return null;
}
