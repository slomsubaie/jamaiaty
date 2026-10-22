// Public complaints & suggestions form.
// Security layers: strict schema validation (types, lengths, email/phone formats, control
// characters stripped), a honeypot field against bots, rate limits per sender IP (stored only
// as a salted hash) and per email, a body-size cap, and parameterised inserts through the
// Supabase client (no SQL is ever built from user text). The table's CHECK constraints and RLS
// are a second line of defence.
import { feedbackInput } from "../../../packages/shared/src/schemas.ts";
import { admin, corsHeaders, getCaller, json } from "../_shared/supabase.ts";

const MAX_BODY_BYTES = 8 * 1024;
const PER_IP_PER_HOUR = 5;
const PER_EMAIL_PER_HOUR = 3;

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_input" }, 400);
  }

  const parsed = feedbackInput.safeParse(body);
  if (!parsed.success) {
    // A filled honeypot looks like success to the bot, but nothing is stored.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return json({ reference: "JM-000000" });
    return json({ error: "invalid_input", fields: parsed.error.issues.map((i) => ({ field: i.path[0], code: i.message })) }, 400);
  }
  const input = parsed.data;

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256(`${Deno.env.get("FEEDBACK_IP_SALT") ?? "jamaiah"}:${ip}`);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ count: byIp }, { count: byEmail }] = await Promise.all([
    admin.from("feedback").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
    admin.from("feedback").select("id", { count: "exact", head: true }).eq("email", input.email).gte("created_at", hourAgo),
  ]);
  if ((byIp ?? 0) >= PER_IP_PER_HOUR || (byEmail ?? 0) >= PER_EMAIL_PER_HOUR) {
    return json({ error: "rate_limited" }, 429);
  }

  // Link to the account when sent while logged in (optional).
  const caller = req.headers.get("Authorization") ? await getCaller(req) : null;

  const { data, error } = await admin
    .from("feedback")
    .insert({
      kind: input.kind,
      topic: input.topic ?? null,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone ?? null,
      association_name: input.association_name ?? null,
      message: input.message,
      user_id: caller?.user.id ?? null,
      ip_hash: ipHash,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    })
    .select("reference")
    .single();
  if (error) {
    console.error("feedback insert failed", error.message);
    return json({ error: "generic" }, 500);
  }
  return json({ reference: data.reference });
});
