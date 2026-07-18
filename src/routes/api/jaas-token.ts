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

/**
 * Import an RSA private key for signing.
 * Accepts both PKCS#8 ("BEGIN PRIVATE KEY") and legacy PKCS#1 ("BEGIN RSA PRIVATE KEY").
 * Cloudflare Workers' Web Crypto only supports PKCS#8 natively; PKCS#1 keys must be
 * converted first — this is done automatically via a minimal DER wrapping so you never
 * need to convert your key offline.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");

  const b64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  let keyData: ArrayBuffer;

  if (isPkcs1) {
    // Wrap PKCS#1 DER in a PKCS#8 container so Web Crypto can import it.
    // PKCS#8 = SEQUENCE { version=0, algorithmIdentifier (rsaEncryption OID), OCTET STRING { pkcs1Der } }
    const rsaOid = new Uint8Array([
      0x30, 0x0d,                   // SEQUENCE (13 bytes)
      0x06, 0x09,                   // OID (9 bytes)
      0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption
      0x05, 0x00,                   // NULL
    ]);

    // DER-encode the length of a field
    function derLen(n: number): Uint8Array {
      if (n < 0x80) return new Uint8Array([n]);
      if (n < 0x100) return new Uint8Array([0x81, n]);
      return new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
    }

    // Build OCTET STRING containing the PKCS#1 DER
    const octetLenBytes = derLen(der.length);
    const octetString = new Uint8Array([0x04, ...octetLenBytes, ...der]);

    // Build outer SEQUENCE
    const seqContent = new Uint8Array([
      0x02, 0x01, 0x00,             // INTEGER version = 0
      ...rsaOid,
      ...octetString,
    ]);
    const seqLenBytes = derLen(seqContent.length);
    const pkcs8 = new Uint8Array([0x30, ...seqLenBytes, ...seqContent]);
    keyData = pkcs8.buffer;
  } else {
    keyData = der.buffer;
  }

  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (err: any) {
    throw new Error(
      `Private key import failed (${isPkcs1 ? "PKCS#1→PKCS#8 wrap" : "PKCS#8"}): ${err?.message ?? err}. ` +
      `Make sure JAAS_PRIVATE_KEY is the full PEM including header/footer lines.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Route — requires a valid Supabase session (Bearer token in Authorization header)
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/jaas-token")({
  server: {
    middleware: [requireSupabaseAuth],
    handlers: {
      POST: async ({ request, context }) => {
        const appId    = process.env.JAAS_APP_ID;
        const apiKey   = process.env.JAAS_API_KEY;
        const privateKey = process.env.JAAS_PRIVATE_KEY;

        // Descriptive 503 so the developer knows exactly which vars to set
        const missing = [
          !appId     && "JAAS_APP_ID",
          !apiKey    && "JAAS_API_KEY",
          !privateKey && "JAAS_PRIVATE_KEY",
        ].filter(Boolean);

        if (missing.length) {
          return new Response(
            JSON.stringify({
              error: `JaaS not configured — add these Cloudflare Worker secrets: ${missing.join(", ")}`,
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        const userId: string = (context as any).userId;

        let body: { room?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Bad JSON body" }), {
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
          return new Response(JSON.stringify({ error: "Invalid room name — only letters, digits, hyphens and underscores allowed" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        // Fetch real user identity from DB — never trust client-supplied values
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .maybeSingle();

        if (profileErr) {
          console.error("[jaas-token] profile fetch error:", profileErr);
          return new Response(JSON.stringify({ error: "Failed to load user profile" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        if (!profile) {
          return new Response(
            JSON.stringify({ error: "User profile not found — contact your administrator" }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        }

        // Email lives on auth.users, not profiles — fetch it separately via the
        // service-role admin client. Non-fatal if it errors; we just fall back to "".
        const { data: authUserRes, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (authUserErr) {
          console.error("[jaas-token] auth user fetch error:", authUserErr);
        }
        const email = authUserRes?.user?.email ?? "";

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
          room: safeRoom,
          context: {
            user: {
              id: userId,
              name: profile.full_name ?? "User",
              email,
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

        const headerB64    = encodeJson({ alg: "RS256", typ: "JWT", kid: apiKey });
        const payloadB64   = encodeJson(jwtPayload);
        const signingInput = `${headerB64}.${payloadB64}`;

        let key: CryptoKey;
        try {
          key = await importPrivateKey(privateKey!);
        } catch (e: any) {
          console.error("[jaas-token] key import failed:", e?.message);
          return new Response(
            JSON.stringify({ error: e?.message ?? "Private key import failed" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
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
