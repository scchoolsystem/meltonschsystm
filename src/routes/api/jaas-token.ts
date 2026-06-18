import { createFileRoute } from "@tanstack/react-router";

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
  // Strip PEM headers/footers and whitespace
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

async function signRS256(payload: object, privateKeyPem: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = encodeJson(header);
  const payloadB64 = encodeJson(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64urlEncode(signature)}`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/jaas-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const appId = process.env.JAAS_APP_ID;
        const apiKey = process.env.JAAS_API_KEY;
        const privateKey = process.env.JAAS_PRIVATE_KEY;

        if (!appId || !apiKey || !privateKey) {
          return new Response(
            JSON.stringify({ error: "JaaS not configured — set JAAS_APP_ID, JAAS_API_KEY, JAAS_PRIVATE_KEY" }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }

        let body: { room?: string; displayName?: string; email?: string; moderator?: boolean };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Bad JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { room, displayName = "User", email = "", moderator = false } = body;

        if (!room) {
          return new Response(JSON.stringify({ error: "room is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const now = Math.floor(Date.now() / 1000);

        const jwtPayload = {
          iss: "chat",
          iat: now,
          exp: now + 3600,       // 1 hour
          nbf: now - 10,
          aud: "jitsi",
          sub: appId,            // your JaaS App ID
          room: "*",             // wildcard — lets the same token work for any room under your app
          context: {
            user: {
              id: email || `user-${Date.now()}`,
              name: displayName,
              email: email,
              moderator: moderator === true,
            },
            features: {
              livestreaming: false,
              recording: false,
              transcription: false,
              "outbound-call": false,
            },
          },
        };

        // kid header must match the API key ID from the JaaS dashboard
        const headerOverride = { alg: "RS256", typ: "JWT", kid: apiKey };

        // We need to sign with the kid override — rebuild manually
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
