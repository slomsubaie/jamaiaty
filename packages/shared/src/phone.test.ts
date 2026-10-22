import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSaudiPhone, normalizeSaudiPhone, toAuthPhone, toLatinDigits } from "./phone.ts";
import { addMemberInput } from "./schemas.ts";

test("normalizes the ways owners type Saudi mobile numbers", () => {
  for (const input of ["0501234567", "501234567", "966501234567", "+966501234567", "00966501234567", "050 123 4567", "٠٥٠١٢٣٤٥٦٧"]) {
    assert.equal(normalizeSaudiPhone(input), "+966501234567", input);
  }
});

test("rejects non-mobile or malformed numbers", () => {
  for (const input of ["", "0112345678", "05012345", "+201001234567", "abc"]) {
    assert.equal(normalizeSaudiPhone(input), null, input);
  }
});

test("auth and display formats", () => {
  assert.equal(toAuthPhone("+966501234567"), "966501234567");
  assert.equal(formatSaudiPhone("+966501234567"), "050 123 4567");
});

test("add-member input: permissions only for board members", () => {
  const base = { association_id: crypto.randomUUID(), full_name: "مالك", phone: "0501234567" };
  assert.equal(addMemberInput.safeParse({ ...base, role: "owner", permissions: ["finance"] }).success, false);
  const ok = addMemberInput.parse({ ...base, role: "board_member", permissions: ["finance"] });
  assert.equal(ok.phone, "+966501234567");
});

test("converts Arabic and Persian digits to English digits as typed", () => {
  assert.equal(toLatinDigits("٠٥١٢٣٤٥٦٧٨"), "0512345678");
  assert.equal(toLatinDigits("۰۵۴۶"), "0546");
  assert.equal(toLatinDigits("+٩٦٦ ٥٠"), "+966 50");
  assert.equal(toLatinDigits("05x"), "05x");
});

import { supportLinks } from "./config/support.ts";

test("support links: built from the config, empty values hidden", () => {
  const links = supportLinks({ email: "help@x.com", whatsapp: "+966 50 000 0000", whatsappMessage: "مرحبا", phone: "", hours: "" });
  assert.deepEqual(links.map((l) => l.kind), ["whatsapp", "email"]);
  assert.equal(links[0].href, "https://wa.me/966500000000?text=" + encodeURIComponent("مرحبا"));
  assert.equal(links[1].href, "mailto:help@x.com");
  assert.equal(supportLinks({ email: "", whatsapp: "", whatsappMessage: "", phone: "966112345678", hours: "" })[0].href, "tel:+966112345678");
});

import { feedbackInput } from "./schemas.ts";

test("feedback form: required fields, 1000-char limit, cleaning, honeypot", () => {
  const base = { kind: "complaint", full_name: "  سليمان  ", email: " A@B.CO ", message: "نص", consent: true };
  const ok = feedbackInput.parse({ ...base, phone: "٠٥٠١٢٣٤٥٦٧", association_name: "" });
  assert.equal(ok.full_name, "سليمان");
  assert.equal(ok.email, "a@b.co");
  assert.equal(ok.phone, "+966501234567");
  assert.equal(ok.association_name, undefined);
  assert.equal(feedbackInput.safeParse({ ...base, message: "x".repeat(1000) }).success, true);
  assert.equal(feedbackInput.safeParse({ ...base, message: "x".repeat(1001) }).success, false);
  for (const missing of ["full_name", "email", "message"] as const) {
    const v = { ...base }; delete v[missing];
    assert.equal(feedbackInput.safeParse(v).success, false, missing);
  }
  assert.equal(feedbackInput.safeParse({ ...base, email: "not-an-email" }).success, false);
  assert.equal(feedbackInput.safeParse({ ...base, consent: false }).success, false);
  assert.equal(feedbackInput.safeParse({ ...base, website: "http://spam" }).success, false);
  assert.equal(feedbackInput.parse({ ...base, message: "a\u0000b\u0007c" }).message, "abc");
});
