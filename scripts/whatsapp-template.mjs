// Creates (or reports) the Arabic AUTHENTICATION template used by supabase/functions/send-otp.
// Usage: set -a; source .env; set +a; node scripts/whatsapp-template.mjs
const { WHATSAPP_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_GRAPH_VERSION = "v23.0" } = process.env;
if (!WHATSAPP_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
  console.error("Set WHATSAPP_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID in .env first.");
  process.exit(1);
}

const base = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;
const headers = { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" };

const existing = await fetch(`${base}?name=login_code`, { headers }).then((r) => r.json());
if (existing.error) {
  console.error("Meta API error:", existing.error.message);
  process.exit(1);
}
const found = existing.data?.find((t) => t.name === "login_code" && t.language === "ar");
if (found) {
  console.log(`Template "login_code" (ar) already exists, status: ${found.status}`);
  process.exit(0);
}

// Authentication templates use Meta's fixed wording ("<code> هو رمز التحقق الخاص بك").
const res = await fetch(base, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "login_code",
    language: "ar",
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "نسخ الرمز" }] },
    ],
  }),
}).then((r) => r.json());

if (res.error) {
  console.error("Meta API error:", res.error.message, res.error.error_user_msg ?? "");
  process.exit(1);
}
console.log(`Created template "login_code" (ar): id ${res.id}, status ${res.status}`);
