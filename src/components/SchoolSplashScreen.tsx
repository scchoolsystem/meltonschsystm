// src/components/SchoolSplashScreen.tsx
// Branded loading screen shown while the app verifies a session on refresh.
// Uses the current tenant's logo (if resolved yet) so refreshes feel like
// "reloading into the school" instead of a blank flash or a bounce to /login.

import { GraduationCap, Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";

export function SchoolSplashScreen() {
  const { school } = useTenant();

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted grid place-items-center border">
          {school?.logo_url ? (
            <img
              src={school.logo_url}
              alt={school.name ?? "School logo"}
              className="w-full h-full object-cover"
            />
          ) : (
            <GraduationCap className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        {school?.name && (
          <p className="text-sm font-medium text-foreground">{school.name}</p>
        )}
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
