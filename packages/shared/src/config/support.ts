// ============================================================================
// Support contact details shown on the login page (website and mobile app).
// Edit the values below whenever you need to; leave a value as "" to hide it.
// ============================================================================

export const SUPPORT_CONTACT = {
  /** Support email address, e.g. "support@yourdomain.com". */
  email: "support@example.com",

  /** WhatsApp number in international format (digits only, with country code), e.g. "966500000000". */
  whatsapp: "966500000000",

  /** Message pre-filled when someone opens WhatsApp from the login page. */
  whatsappMessage: "السلام عليكم، أحتاج مساعدة في تسجيل الدخول إلى منصة جمعيتي.",

  /** Optional phone number for calls, international format, e.g. "966112345678". "" hides it. */
  phone: "",

  /** Optional working hours text. "" hides it. */
  hours: "",
};

// ----------------------------------------------------------------------------
// Links built from the values above (no need to edit below this line).
// ----------------------------------------------------------------------------

const digits = (v: string) => v.replace(/[^\d]/g, "");

export interface SupportLink {
  kind: "whatsapp" | "email" | "phone";
  label: string;
  /** What's shown to the user, e.g. the email or +966 number. */
  value: string;
  href: string;
}

export function supportLinks(c = SUPPORT_CONTACT): SupportLink[] {
  const links: SupportLink[] = [];
  if (digits(c.whatsapp)) {
    const text = c.whatsappMessage ? `?text=${encodeURIComponent(c.whatsappMessage)}` : "";
    links.push({ kind: "whatsapp", label: "واتساب", value: `+${digits(c.whatsapp)}`, href: `https://wa.me/${digits(c.whatsapp)}${text}` });
  }
  if (c.email.trim()) {
    links.push({ kind: "email", label: "البريد الإلكتروني", value: c.email.trim(), href: `mailto:${c.email.trim()}` });
  }
  if (digits(c.phone)) {
    links.push({ kind: "phone", label: "اتصال هاتفي", value: `+${digits(c.phone)}`, href: `tel:+${digits(c.phone)}` });
  }
  return links;
}
