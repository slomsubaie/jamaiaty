// Superadmin only: creates an association and its president.
import { createAssociationInput } from "../../../packages/shared/src/schemas.ts";
import { admin, corsHeaders, ensureUser, getCaller, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  const { data: isAdmin } = await caller.db.rpc("is_superadmin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const parsed = createAssociationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  const input = parsed.data;

  try {
    const { data: assoc, error: aErr } = await admin
      .from("associations")
      .insert({ name: input.name, city: input.city, mullak_number: input.mullak_number || null })
      .select("id")
      .single();
    if (aErr) throw aErr;

    const presidentId = await ensureUser(input.president_phone, input.president_name);
    const { error: mErr } = await admin.from("memberships").insert({
      association_id: assoc.id,
      user_id: presidentId,
      role: "president",
    });
    if (mErr) {
      await admin.from("associations").delete().eq("id", assoc.id);
      throw mErr;
    }

    return json({ association_id: assoc.id, president_id: presidentId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
