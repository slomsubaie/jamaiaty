"use client";

import { formatSaudiPhone, sendLoginCode, t, toLatinDigits, verifyLoginCode } from "@jamaiah/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { sessionClock } from "@/lib/session";
import { supabase } from "@/lib/supabase/client";

const RESEND_SECONDS = 60;

export function LoginForm() {
  const router = useRouter();
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const res = await sendLoginCode(supabase(), phone ?? phoneInput);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setPhone(res.phone);
    setResendIn(RESEND_SECONDS);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setError("");
    const res = await verifyLoginCode(supabase(), phone, code);
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    sessionClock.start();
    router.replace("/");
    router.refresh();
  }

  if (!phone) {
    return (
      <Card>
        <form onSubmit={send} className="flex flex-col gap-4">
          <Field label={t.login.phoneLabel}>
            <Input
              dir="ltr"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t.login.phonePlaceholder}
              value={phoneInput}
              onChange={(e) => setPhoneInput(toLatinDigits(e.target.value))}
              required
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>{t.login.sendCode}</Button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={verify} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {t.login.codeSentTo} <span dir="ltr" className="font-medium text-foreground">{formatSaudiPhone(phone)}</span>
        </p>
        <Field label={t.login.codeLabel}>
          <Input
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="text-center text-lg tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(toLatinDigits(e.target.value))}
            autoFocus
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{t.login.verify}</Button>
        <div className="flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" className="px-0" onClick={() => { setPhone(null); setCode(""); setError(""); }}>
            {t.login.changePhone}
          </Button>
          {resendIn > 0 ? (
            <span className="text-muted">{t.login.resendIn(resendIn)}</span>
          ) : (
            <Button type="button" variant="ghost" className="px-0" onClick={() => send()} disabled={busy}>
              {t.login.resend}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
