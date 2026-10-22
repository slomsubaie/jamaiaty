"use client";

import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TOPICS,
  feedbackInput,
  submitFeedback,
  t,
  toLatinDigits,
} from "@jamaiah/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Card, ErrorText, Input, Select, Textarea } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

type Kind = (typeof FEEDBACK_KINDS)[number];
type Topic = (typeof FEEDBACK_TOPICS)[number];
type FieldErrors = Partial<Record<string, string>>;

const ERR = t.feedback.errors as Record<string, string>;

function Labeled({ id, label, required, error, children, hint }: {
  id: string; label: string; required?: boolean; error?: string; children: ReactNode; hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={id} className="flex items-center justify-between font-medium">
        <span>
          {label} {required && <span className="text-danger" aria-hidden="true">*</span>}
        </span>
        {hint}
      </label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FeedbackForm() {
  const empty = {
    kind: "complaint" as Kind,
    topic: "" as Topic | "",
    full_name: "",
    email: "",
    phone: "",
    association_name: "",
    message: "",
    consent: false,
    website: "", // honeypot
  };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const describedBy = (id: string) => (errors[id] ? `${id}-error` : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const input = { ...form, topic: form.topic || undefined };
    // Same rules as the server, for instant feedback.
    const check = feedbackInput.safeParse(input);
    if (!check.success) {
      const next: FieldErrors = {};
      for (const issue of check.error.issues) {
        const field = String(issue.path[0]);
        const value = (input as Record<string, unknown>)[field];
        // Empty → "required"; otherwise the specific problem (too short, invalid email…).
        next[field] ??= value === "" || value === undefined ? t.feedback.required : ERR[issue.message] ?? t.feedback.required;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    const res = await submitFeedback(supabase(), { ...input, consent: true });
    setSending(false);
    if (res.ok) {
      setReference(res.reference);
      setForm(empty);
      return;
    }
    if (res.fields?.length) {
      setErrors(Object.fromEntries(res.fields.map((f) => [f.field, ERR[f.code] ?? t.feedback.required])));
    } else {
      setFormError(ERR[res.error] ?? ERR.generic);
    }
  }

  if (reference) {
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary" aria-hidden="true">✓</div>
        <h2 className="text-lg font-bold">{t.feedback.successTitle}</h2>
        <p className="text-sm text-muted">{t.feedback.successBody(reference)}</p>
        <p dir="ltr" className="rounded-lg bg-background px-4 py-2 font-mono text-lg font-semibold">{reference}</p>
        <Button variant="secondary" onClick={() => setReference(null)}>{t.feedback.another}</Button>
      </Card>
    );
  }

  const length = form.message.length;

  return (
    <Card>
      <form noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">
            {t.feedback.kind} <span className="text-danger" aria-hidden="true">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_KINDS.map((k) => (
              <label
                key={k}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${
                  form.kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"
                }`}
              >
                <input type="radio" name="kind" value={k} checked={form.kind === k} onChange={() => set("kind", k)} className="sr-only" />
                {t.feedback.kinds[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <Labeled id="full_name" label={t.feedback.fullName} required error={errors.full_name}>
          <Input id="full_name" autoComplete="name" maxLength={100} value={form.full_name} aria-invalid={Boolean(errors.full_name)}
            aria-describedby={describedBy("full_name")} onChange={(e) => set("full_name", e.target.value)} required />
        </Labeled>

        <Labeled id="email" label={t.feedback.email} required error={errors.email}>
          <Input id="email" type="email" dir="ltr" autoComplete="email" maxLength={254} value={form.email}
            aria-invalid={Boolean(errors.email)} aria-describedby={describedBy("email")} onChange={(e) => set("email", e.target.value)} required />
        </Labeled>

        <Labeled id="phone" label={t.feedback.phone} error={errors.phone}>
          <Input id="phone" type="tel" dir="ltr" autoComplete="tel" placeholder="05XXXXXXXX" maxLength={16} value={form.phone}
            aria-invalid={Boolean(errors.phone)} aria-describedby={describedBy("phone")} onChange={(e) => set("phone", toLatinDigits(e.target.value))} />
        </Labeled>

        <Labeled id="topic" label={t.feedback.topic}>
          <Select id="topic" value={form.topic} onChange={(e) => set("topic", e.target.value as Topic | "")}>
            <option value="">—</option>
            {FEEDBACK_TOPICS.map((tp) => <option key={tp} value={tp}>{t.feedback.topics[tp]}</option>)}
          </Select>
        </Labeled>

        <div className="sm:col-span-2">
          <Labeled id="association_name" label={t.feedback.association} error={errors.association_name}>
            <Input id="association_name" maxLength={150} value={form.association_name} onChange={(e) => set("association_name", e.target.value)} />
          </Labeled>
        </div>

        <div className="sm:col-span-2">
          <Labeled
            id="message"
            label={t.feedback.message}
            required
            error={errors.message}
            hint={
              <span className={`text-xs ${length > FEEDBACK_MESSAGE_MAX * 0.9 ? "text-danger" : "text-muted"}`} aria-live="polite">
                {t.feedback.counter(length, FEEDBACK_MESSAGE_MAX)}
              </span>
            }
          >
            <Textarea id="message" rows={6} maxLength={FEEDBACK_MESSAGE_MAX} placeholder={t.feedback.messagePlaceholder} value={form.message}
              aria-invalid={Boolean(errors.message)} aria-describedby={describedBy("message")} onChange={(e) => set("message", e.target.value)} required />
          </Labeled>
        </div>

        {/* Honeypot: hidden from people and assistive tech; bots that fill it are ignored. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.consent} aria-invalid={Boolean(errors.consent)}
              aria-describedby={describedBy("consent")} onChange={(e) => set("consent", e.target.checked)} />
            <span>{t.feedback.consent} <span className="text-danger" aria-hidden="true">*</span></span>
          </label>
          {errors.consent && <p id="consent-error" role="alert" className="text-xs text-danger">{errors.consent}</p>}
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={sending} className="min-w-32">{sending ? t.feedback.sending : t.feedback.submit}</Button>
          <ErrorText>{formError}</ErrorText>
        </div>
      </form>
    </Card>
  );
}
