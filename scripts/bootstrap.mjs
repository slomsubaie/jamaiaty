// One-off setup for a fresh Supabase project: makes you the platform superadmin
// and creates your own association with you as president.
//
// Usage (values come from apps/web/.env.local):
//   node --env-file=apps/web/.env.local scripts/bootstrap.mjs +9665XXXXXXXX "اسمك" "اسم الجمعية" "المدينة"
import { createClient } from "@supabase/supabase-js";

const [phoneArg, fullName, assocName, city] = process.argv.slice(2);
if (!phoneArg || !fullName || !assocName || !city) {
  console.error('Usage: node --env-file=apps/web/.env.local scripts/bootstrap.mjs +9665XXXXXXXX "الاسم" "اسم الجمعية" "المدينة"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in apps/web/.env.local");
  process.exit(1);
}

const phone = "+" + phoneArg.replace(/[^\d]/g, "").replace(/^0*/, "");
const admin = createClient(url, secret, { auth: { persistSession: false } });

let { data: profile } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
if (!profile) {
  const { data, error } = await admin.auth.admin.createUser({
    phone: phone.slice(1),
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  profile = { id: data.user.id };
}
await admin.from("profiles").update({ is_superadmin: true, full_name: fullName }).eq("id", profile.id).throwOnError();

const { data: assoc } = await admin.from("associations").insert({ name: assocName, city }).select("id").single().throwOnError();
await admin.from("memberships").insert({ association_id: assoc.id, user_id: profile.id, role: "president" }).throwOnError();

console.log(`Done. ${phone} is superadmin and president of "${assocName}" (${assoc.id}).`);
