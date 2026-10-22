import type { AuthError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { normalizeSaudiPhone, toAuthPhone } from "./phone.ts";
import { t } from "./strings.ts";

type Client = SupabaseClient<Database>;
export type AuthResult = { ok: true; phone: string } | { ok: false; message: string };

function messageFor(error: AuthError): string {
  switch (error.code) {
    // shouldCreateUser: false + unknown phone → sign-ups are disabled for OTP.
    case "otp_disabled":
    case "signup_disabled":
    case "user_not_found":
      return t.login.notRegistered;
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return t.login.tooManyRequests;
    case "otp_expired":
    case "invalid_credentials":
      return t.login.invalidCode;
  }
  // The send-otp hook couldn't deliver the code (e.g. the WhatsApp token expired).
  if (/otp_delivery_unavailable|returned from hook/i.test(error.message)) return t.login.deliveryUnavailable;
  if (error.status === 429) return t.login.tooManyRequests;
  if (/signups? not allowed/i.test(error.message)) return t.login.notRegistered;
  if (/expired|invalid/i.test(error.message)) return t.login.invalidCode;
  return t.login.genericError;
}

/** Step 1: send an OTP, but only to phone numbers already registered by a president/superadmin. */
export async function sendLoginCode(sb: Client, phoneInput: string): Promise<AuthResult> {
  const phone = normalizeSaudiPhone(phoneInput);
  if (!phone) return { ok: false, message: t.login.invalidPhone };
  const { error } = await sb.auth.signInWithOtp({
    phone: toAuthPhone(phone),
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (error) return { ok: false, message: messageFor(error) };
  return { ok: true, phone };
}

/** Step 2: verify the code; on success the client holds a session. */
export async function verifyLoginCode(sb: Client, phone: string, code: string): Promise<AuthResult> {
  const token = code.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  if (token.length !== 6) return { ok: false, message: t.login.invalidCode };
  const { error } = await sb.auth.verifyOtp({ phone: toAuthPhone(phone), token, type: "sms" });
  if (error) return { ok: false, message: messageFor(error) };
  return { ok: true, phone };
}
