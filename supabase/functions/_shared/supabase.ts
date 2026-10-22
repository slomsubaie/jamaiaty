import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = Deno.env.get("SUPABASE_URL")!;

function key(kind: "PUBLISHABLE" | "SECRET"): string {
  const dict = Deno.env.get(`SUPABASE_${kind}_KEYS`);
  if (dict) return JSON.parse(dict)["default"];
  // Legacy key names, still provided by the platform.
  return Deno.env.get(kind === "SECRET" ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY")!;
}

/** Bypasses RLS. Only use after checking the caller's rights. */
export const admin: SupabaseClient = createClient(url, key("SECRET"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface Caller {
  user: User;
  /** Client acting as the caller, so RLS applies. */
  db: SupabaseClient;
}

export async function getCaller(req: Request): Promise<Caller | null> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return null;
  // Forward the app's selected role so the database applies the same limits as in the app.
  const acting = req.headers.get("x-acting-role");
  const db = createClient(url, key("PUBLISHABLE"), {
    global: { headers: { Authorization: authorization, ...(acting ? { "x-acting-role": acting } : {}) } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(authorization.replace(/^Bearer /, ""));
  if (error || !data.user) return null;
  return { user: data.user, db };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-acting-role",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Finds the auth user for a phone, creating it if needed. `phone` is E.164 (+966...). */
export async function ensureUser(phone: string, fullName: string): Promise<string> {
  const { data: existing } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    phone: phone.replace(/^\+/, ""),
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(error?.message ?? "could not create user");
  return data.user.id;
}
