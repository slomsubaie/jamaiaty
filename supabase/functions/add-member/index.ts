// Adds a person (from the association's Mullak records) to an association.
// Only phone numbers added here can log in, because the apps call signInWithOtp
// with shouldCreateUser: false.
import { addMemberInput } from "../../../packages/shared/src/schemas.ts";
import { admin, corsHeaders, ensureUser, getCaller, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  const parsed = addMemberInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  const input = parsed.data;

  // Check rights as the caller, so the same rules as RLS apply.
  if (input.role === "president") return json({ error: "use_presidency_transfer" }, 400);
  const { data: callerRole, error: roleError } = await caller.db.rpc("member_role", { a: input.association_id });
  if (roleError) return json({ error: roleError.message }, 500);
  const isPresident = callerRole === "president";
  let allowed = isPresident;
  if (!allowed && input.role === "owner") {
    const { data, error } = await caller.db.rpc("has_permission", { a: input.association_id, perm: "owners_units" });
    if (error) return json({ error: error.message }, 500);
    allowed = data === true;
  }
  if (!allowed) return json({ error: "forbidden" }, 403);

  if (input.unit_id) {
    const { data: unit } = await admin
      .from("units").select("id").eq("id", input.unit_id).eq("association_id", input.association_id).maybeSingle();
    if (!unit) return json({ error: "unit_not_found" }, 400);
  }

  try {
    const userId = await ensureUser(input.phone, input.full_name);

    // Roles are additive: adding "owner" to the president keeps them president.
    const { error: mErr } = await admin.from("memberships").upsert(
      {
        association_id: input.association_id,
        user_id: userId,
        role: input.role,
        permissions: input.permissions,
        active: true,
      },
      { onConflict: "association_id,user_id,role" },
    );
    if (mErr?.message.includes("cannot also be a board member")) return json({ error: "already_president" }, 409);
    if (mErr) throw mErr;

    if (input.unit_id) {
      const { error: oErr } = await admin.from("unit_ownerships").insert({
        association_id: input.association_id,
        unit_id: input.unit_id,
        user_id: userId,
        share_pct: input.share_pct ?? 100,
      });
      if (oErr) throw oErr;
    }

    await admin.from("audit_log").insert({
      association_id: input.association_id,
      actor_id: caller.user.id,
      action: "add_member",
      table_name: "memberships",
      record_id: userId,
      details: { role: input.role, unit_id: input.unit_id ?? null },
    });

    return json({ user_id: userId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
