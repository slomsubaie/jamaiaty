// Supabase Auth "Send SMS" hook: delivers login codes over WhatsApp using Meta's
// WhatsApp Cloud API (free test number while developing).
//
// Secrets (npx supabase secrets set ...):
//   SEND_SMS_HOOK_SECRET      v1,whsec_... (same value as [auth.hook.send_sms] secrets)
//   WHATSAPP_TOKEN            Meta access token
//   WHATSAPP_PHONE_NUMBER_ID  Phone number ID of the WhatsApp sender
//   WHATSAPP_TEMPLATE_MODE    "sample" (free test account) or "authentication" (default)
//   WHATSAPP_TEMPLATE         approved AUTHENTICATION template name (default: login_code)
//   WHATSAPP_TEMPLATE_LANG    template language code (default: ar)
//   WHATSAPP_GRAPH_VERSION    Graph API version (default: v23.0)
import { Webhook } from "standardwebhooks";

interface HookPayload {
  user: { id: string; phone: string };
  sms: { otp: string };
}

const env = (name: string, fallback?: string) => {
  const v = Deno.env.get(name) ?? fallback;
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
};

/**
 * Supabase Auth only reads an error from a hook that answers 2xx with an `error` object;
 * any other status becomes a bare "Unexpected status code returned from hook: 500".
 * `message` reaches the app, which maps it to an Arabic explanation.
 */
function hookError(message: string, httpCode = 503) {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const body = await req.text();
  let payload: HookPayload;
  try {
    const secret = env("SEND_SMS_HOOK_SECRET").replace("v1,whsec_", "");
    payload = new Webhook(secret).verify(body, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid hook signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    const code = payload.sms.otp;
    const to = payload.user.phone.replace(/^\+/, "");

    // "sample": Meta's free test account can't create templates, so for practice the code is
    // sent inside the pre-approved sample template (Hi {{1}}, ... order number is {{2}} ... {{3}}).
    // "authentication" (default): our own approved Arabic login template with a copy-code button.
    const template =
      env("WHATSAPP_TEMPLATE_MODE", "authentication") === "sample"
        ? {
            name: "jaspers_market_order_confirmation_v1",
            language: { code: "en_US" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: "رمز الدخول إلى جمعيتي" },
                  { type: "text", text: code },
                  { type: "text", text: "صالح لمدة 10 دقائق" },
                ],
              },
            ],
          }
        : {
            name: env("WHATSAPP_TEMPLATE", "login_code"),
            language: { code: env("WHATSAPP_TEMPLATE_LANG", "ar") },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              // Authentication templates have a copy-code button that also takes the code.
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
            ],
          };

    const res = await fetch(
      `https://graph.facebook.com/${env("WHATSAPP_GRAPH_VERSION", "v23.0")}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template,
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      // Meta error 190 = access token expired or invalid (e.g. the 24-hour temporary token).
      const expired = /"code":\s*190\b/.test(detail);
      console.error(expired ? "WHATSAPP TOKEN EXPIRED OR INVALID — replace WHATSAPP_TOKEN" : "whatsapp send failed", res.status, detail);
      return hookError(expired ? "otp_delivery_unavailable:token" : "otp_delivery_unavailable");
    }
  } catch (e) {
    // e.g. a missing secret or Meta unreachable — report it in the format Supabase Auth reads.
    console.error("send-otp failed", e);
    return hookError("otp_delivery_unavailable");
  }
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
});
