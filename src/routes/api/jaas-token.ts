import { createFileRoute } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Helpers — Web Crypto RS256 JWT signing (Cloudflare Workers compatible)
// ---------------------------------------------------------------------------

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJson(obj: object): string {
  return base64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// ---------------------------------------------------------------------------
// Route — requires a valid Supabase session
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/jaas-token")({
  server: {
    middleware: [requireSupabaseAuth],
    handlers: {
      POST: async ({ request, context }) => {
        const appId = process.env.JAAS_APP_ID;
        const apiKey = process.env.JAAS_API_KEY;
        const privateKey = process.env.JAAS_PRIVATE_KEY;

        if (!appId || !apiKey || !privateKey) {
          return new Response(
            JSON.stringify({ error: "JaaS not configured — set JAAS_APP_ID, JAAS_API_KEY, JAAS_PRIVATE_KEY" }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        // context.userId and context.claims come from requireSupabaseAuth
        const userId: string = (context as any).userId;

        let body: { room?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Bad JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { room } = body;
        if (!room || typeof room !== "string" || room.trim() === "") {
          return new Response(JSON.stringify({ error: "room is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        // Sanitise room name — only allow UUID-like or slug chars
        const safeRoom = room.trim().replace(/[^a-zA-Z0-9_\-]/g, "");
        if (!safeRoom) {
          return new Response(JSON.stringify({ error: "Invalid room name" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        // Fetch real user identity and role from DB — never trust client-supplied values
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", userId)
          .maybeSingle();

        if (profileErr || !profile) {
          return new Response(JSON.stringify({ error: "User profile not found" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        // Determine moderator status from DB role — never from request body
        const { data: roleRow } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();

        const isModerator =
          roleRow?.role === "admin" ||
          roleRow?.role === "teacher" ||
          roleRow?.role === "school_admin";

        const now = Math.floor(Date.now() / 1000);

        const jwtPayload = {
          iss: "chat",
          iat: now,
          exp: now + 3600,
          nbf: now - 10,
          aud: "jitsi",
          sub: appId,
          room: safeRoom,          // specific room only — no wildcard
          context: {
            user: {
              id: userId,
              name: profile.full_name ?? "User",
              email: profile.email ?? "",
              moderator: isModerator,
            },
            features: {
              livestreaming: false,
              recording: false,
              transcription: false,
              "outbound-call": false,
            },
          },
        };

        const headerOverride = { alg: "RS256", typ: "JWT", kid: apiKey };
        const headerB64 = encodeJson(headerOverride);
        const payloadB64 = encodeJson(jwtPayload);
        const signingInput = `${headerB64}.${payloadB64}`;

        let key: CryptoKey;
        try {
          key = await importPrivateKey(privateKey);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: `Private key parse failed: ${e.message}` }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const signature = await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          new TextEncoder().encode(signingInput),
        );

        const token = `${signingInput}.${base64urlEncode(signature)}`;

        return new Response(JSON.stringify({ token }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
