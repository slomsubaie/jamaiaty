// Meta WhatsApp webhook (the "Callback URL" in the Meta App Dashboard).
// GET  → Meta's one-time verification handshake (hub.verify_token must match).
// POST → delivery/status events; logged so failed OTP deliveries show up in the function logs.
//
// Secrets: WHATSAPP_VERIFY_TOKEN (required), WHATSAPP_APP_SECRET (optional, verifies POST signatures).

const encoder = new TextEncoder();

async function validSignature(body: string, header: string | null): Promise<boolean> {
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!appSecret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const expected = "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, header);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token && constantTimeEqual(token, expected) && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const body = await req.text();
    if (!(await validSignature(body, req.headers.get("X-Hub-Signature-256")))) {
      return new Response("invalid signature", { status: 401 });
    }
    try {
      const event = JSON.parse(body);
      for (const entry of event.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const status of change.value?.statuses ?? []) {
            // e.g. sent / delivered / read / failed (with errors[] explaining why)
            console.log("whatsapp status", status.status, status.recipient_id, JSON.stringify(status.errors ?? []));
          }
        }
      }
    } catch {
      // Ignore malformed bodies; always acknowledge so Meta doesn't retry forever.
    }
    return new Response("ok", { status: 200 });
  }

  return new Response("method not allowed", { status: 405 });
});
