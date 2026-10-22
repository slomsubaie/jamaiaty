// Superadmin only: checks that login codes can be delivered over WhatsApp — the access token
// is valid and can reach the sender number — without sending any message.
import { corsHeaders, getCaller, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await caller.db.rpc("is_superadmin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v23.0";
  if (!token || !phoneId) return json({ ok: false, reason: "not_configured" });

  // Token introspection: works for both temporary and System User tokens.
  const res = await fetch(`https://graph.facebook.com/${version}/debug_token?input_token=${token}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  const info = body?.data;
  if (!res.ok || !info?.is_valid) {
    return json({ ok: false, reason: "token_invalid", detail: body?.error?.message ?? info?.error?.message ?? null });
  }
  // expires_at = 0 means the token never expires (System User token).
  const expiresAt = info.expires_at ? new Date(info.expires_at * 1000).toISOString() : null;
  return json({ ok: true, permanent: !info.expires_at, expires_at: expiresAt, mode: Deno.env.get("WHATSAPP_TEMPLATE_MODE") ?? "authentication" });
});
