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

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (native && !slug) {
    return (
      <SchoolPicker
        onPicked={(pickedSlug) => {
          if (pickedSlug && typeof window !== "undefined") {
            window.location.replace(`https://${pickedSlug}.smartdev.co.ke/login`);
          }
        }}
      />
    );
  }

  if (slug) {
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-muted to-background p-6 text-center">
      <div className="max-w-md space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary text-primary-foreground shadow-lg text-4xl font-bold">
          S
        </div>
        <h1 className="text-4xl font-bold tracking-tight">SmartDev ERP</h1>
        <p className="text-muted-foreground text-lg">
          School management made simple.
        </p>
        <div className="bg-muted rounded-xl p-5 text-left space-y-2">
          <p className="font-semibold text-sm">To sign in, visit your school portal:</p>
          <code className="block text-primary text-sm bg-background rounded px-3 py-2">
            yourschool.smartdev.co.ke
          </code>
          <p className="text-xs text-muted-foreground">
            Contact your school administrator if you don't know your school's address.
          </p>
        </div>
      </div>
    </div>
  );
}
