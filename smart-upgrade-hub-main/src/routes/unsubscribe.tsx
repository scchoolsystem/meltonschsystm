import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [state, setState] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.valid) setState("valid");
        else if (data?.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json();
      if (data?.success) setState("done");
      else if (data?.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch { setState("error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader><CardTitle>Unsubscribe</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          {state === "loading" && <p className="text-muted-foreground">Checking your link…</p>}
          {state === "invalid" && <p>This unsubscribe link is invalid or has expired.</p>}
          {state === "already" && <p>You've already been unsubscribed. No further emails will be sent.</p>}
          {state === "valid" && (
            <>
              <p>Click the button below to stop receiving emails from Smartdev ERP at this address.</p>
              <Button onClick={confirm} disabled={busy}>{busy ? "Working…" : "Confirm unsubscribe"}</Button>
            </>
          )}
          {state === "done" && <p>You've been unsubscribed. We won't email this address anymore.</p>}
          {state === "error" && <p>Something went wrong. Please try again later.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
