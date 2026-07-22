// src/routes/api/ai-remark.ts
//
// Backs the "AI suggest" button on the academics remarks page
// (_app.academics.remarks.tsx), which was calling this exact path already —
// it just never had a server-side implementation, so every click silently
// failed. Takes the prompt the frontend already builds (which encodes remark
// type, student name, grade, subject) and returns one short remark.
//
// Required Cloudflare Worker secret (set via `wrangler secret put`):
//   ANTHROPIC_API_KEY

import { createFileRoute } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Short, templated single-sentence generation — Haiku is plenty and keeps
// this fast/cheap for a button teachers may click dozens of times per sitting.
const MODEL = "claude-haiku-4-5-20251001";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/ai-remark")({
  server: {
    middleware: [requireSupabaseAuth],
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return jsonResponse(
            { error: "AI remarks aren't configured yet — add the ANTHROPIC_API_KEY Cloudflare Worker secret." },
            503,
          );
        }

        let body: { prompt?: string };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Bad JSON body" }, 400);
        }

        const { prompt } = body;
        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
          return jsonResponse({ error: "prompt is required" }, 400);
        }
        // The frontend only ever sends short templated prompts, but guard
        // against something pathological getting sent to the API anyway.
        if (prompt.length > 2000) {
          return jsonResponse({ error: "Prompt is too long" }, 400);
        }

        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 300,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!anthropicRes.ok) {
          const errText = await anthropicRes.text().catch(() => "");
          console.error("[ai-remark] Anthropic API error:", anthropicRes.status, errText);

          // Surface the actual reason (e.g. "credit balance is too low", "invalid
          // x-api-key") instead of just a bare status code — the earlier version
          // swallowed this into the Worker logs, so every failure looked identical
          // from the browser regardless of cause.
          let reason = "";
          try {
            const parsed = JSON.parse(errText);
            reason = parsed?.error?.message ?? "";
          } catch {
            reason = errText.slice(0, 300);
          }

          return jsonResponse(
            {
              error: reason
                ? `AI suggestion failed: ${reason}`
                : `AI suggestion failed (${anthropicRes.status})`,
            },
            502,
          );
        }

        const data: any = await anthropicRes.json();
        const remark = (data.content ?? [])
          .find((b: any) => b.type === "text")
          ?.text?.trim();

        if (!remark) {
          return jsonResponse({ error: "AI returned an empty suggestion" }, 502);
        }

        return jsonResponse({ remark });
      },
    },
  },
});
