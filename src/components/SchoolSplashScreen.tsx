// src/components/SchoolSplashScreen.tsx
// Branded loading screen shown while the app verifies a session on refresh.
// Uses the current tenant's logo + brand color (if resolved yet) so refreshes
// feel like "reloading into the school" instead of a blank flash or a bounce
// to /login.

import { GraduationCap } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";

export function SchoolSplashScreen() {
  const { school } = useTenant();
  const brand = school?.primary_color || "oklch(0.55 0.13 245)"; // falls back to --accent

  return (
    <div
      className="min-h-screen grid place-items-center px-4 relative overflow-hidden bg-background"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 35%, ${brand}14, transparent 60%)`,
      }}
    >
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
        {/* Logo with a soft breathing glow behind it */}
        <div className="relative grid place-items-center">
          <div
            className="splash-glow absolute inset-0 rounded-full blur-xl"
            style={{ backgroundColor: brand }}
            aria-hidden="true"
          />
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-card border shadow-lg grid place-items-center">
            {school?.logo_url ? (
              <img
                src={school.logo_url}
                alt={school.name ?? "School logo"}
                className="w-full h-full object-cover"
              />
            ) : (
              <GraduationCap className="w-9 h-9" style={{ color: brand }} />
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-base font-semibold text-foreground">
            {school?.name ?? "SmartDev ERP"}
          </p>
          <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
        </div>

        {/* Indeterminate progress bar instead of a spinning icon */}
        <div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="splash-bar-sweep h-full w-1/3 rounded-full"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, ${brand}, transparent)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
