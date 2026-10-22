// Superadmin only: grant or revoke superadmin for a phone number.
// Granting creates the account if the number is new; the platform always keeps one superadmin.
import { saudiPhone } from "../../../packages/shared/src/schemas.ts";
import { admin, corsHeaders, ensureUser, getCaller, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await caller.db.rpc("is_superadmin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => null);
  const phone = saudiPhone.safeParse(body?.phone);
  const grant = body?.grant === true;
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  if (!phone.success || typeof body?.grant !== "boolean") return json({ error: "invalid_input" }, 400);

  try {
    let userId: string | undefined;
    if (grant) {
      if (fullName.length < 2) {
        const { data: existing } = await admin.from("profiles").select("id").eq("phone", phone.data).maybeSingle();
        if (!existing) return json({ error: "invalid_input" }, 400);
      }
      userId = await ensureUser(phone.data, fullName);
    } else {
      const { data } = await admin.from("profiles").select("id").eq("phone", phone.data).maybeSingle();
      if (!data) return json({ error: "not_found" }, 404);
      userId = data.id;
    }
    // Runs as the caller so the database re-checks the rule and records them in the audit log.
    const { error } = await caller.db.rpc("set_superadmin", { target: userId, grant_it: grant });
    if (error) {
      if (error.message.includes("at least one superadmin")) return json({ error: "last_superadmin" }, 409);
      throw error;
    }
    return json({ user_id: userId, is_superadmin: grant });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
