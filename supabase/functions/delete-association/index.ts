// Superadmin only: deletes an association together with its stored files.
// Runs server-side because the superadmin can't see the association's files without a
// support grant, and files in Storage aren't removed by the database cascade.
import { admin, corsHeaders, getCaller, json } from "../_shared/supabase.ts";

const BUCKET = "association-files";

async function listAll(prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Folders have no id; recurse into them.
      if (entry.id === null) paths.push(...(await listAll(path)));
      else paths.push(path);
    }
    if (data.length < 1000) return paths;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await caller.db.rpc("is_superadmin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => null);
  const id = typeof body?.association_id === "string" ? body.association_id : null;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "invalid_input" }, 400);

  try {
    const paths = await listAll(id);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
    const { data, error } = await admin.from("associations").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return json({ error: "not_found" }, 404);
    await admin.from("audit_log").insert({
      association_id: id,
      actor_id: caller.user.id,
      action: "delete_association",
      table_name: "associations",
      record_id: id,
      details: { files_removed: paths.length },
    });
    return json({ deleted: id, files_removed: paths.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
