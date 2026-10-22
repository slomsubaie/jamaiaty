import { formatSaudiPhone, sendLoginCode, SUPPORT_CONTACT, supportLinks, t, toLatinDigits, verifyLoginCode } from "@jamaiah/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, View } from "react-native";
import { Button, Card, ErrorText, Input, LinkButton, Row, Screen, Text, useColors } from "@/components/ui";
import { sessionClock, supabase } from "@/lib/supabase";

const RESEND_SECONDS = 60;

export default function SignIn() {
  const c = useColors();
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

  async function send() {
    setBusy(true);
    setError("");
    const res = await sendLoginCode(supabase, phone ?? phoneInput);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setPhone(res.phone);
    setResendIn(RESEND_SECONDS);
  }

  async function verify() {
    if (!phone) return;
    setBusy(true);
    setError("");
    const res = await verifyLoginCode(supabase, phone, code);
    setBusy(false);
    // On success the session listener switches to the (app) stack automatically.
    if (!res.ok) setError(res.message);
    else sessionClock.start();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={{ marginTop: 80, gap: 4 }}>
          <Text bold size={28} style={{ color: c.primary, textAlign: "center" }}>{t.appName}</Text>
          <Text muted style={{ textAlign: "center" }}>{t.login.title}</Text>
        </View>
        <Card style={{ gap: 14 }}>
          {!phone ? (
            <>
              <Input
                label={t.login.phoneLabel}
                ltr
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder={t.login.phonePlaceholder}
                value={phoneInput}
                onChangeText={(v) => setPhoneInput(toLatinDigits(v))}
              />
              <ErrorText>{error}</ErrorText>
              <Button title={t.login.sendCode} onPress={send} disabled={busy || !phoneInput} />
            </>
          ) : (
            <>
              <Text muted>
                {t.login.codeSentTo} <Text bold>{"⁦" + formatSaudiPhone(phone) + "⁩"}</Text>
              </Text>
              <Input
                label={t.login.codeLabel}
                ltr
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                value={code}
                onChangeText={(v) => setCode(toLatinDigits(v))}
                style={{ textAlign: "center", fontSize: 22, letterSpacing: 8 }}
              />
              <ErrorText>{error}</ErrorText>
              <Button title={t.login.verify} onPress={verify} disabled={busy || code.length < 6} />
              {resendIn > 0 ? (
                <Text muted style={{ textAlign: "center" }}>{t.login.resendIn(resendIn)}</Text>
              ) : (
                <Button variant="ghost" title={t.login.resend} onPress={send} disabled={busy} />
              )}
              <Button variant="ghost" title={t.login.changePhone} onPress={() => { setPhone(null); setCode(""); setError(""); }} />
            </>
          )}
        </Card>
        <SupportContacts />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** Contact details come from packages/shared/src/config/support.ts. */
function SupportContacts() {
  const links = supportLinks();
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Text muted size={14} style={{ textAlign: "center" }}>{t.login.needHelp}</Text>
      <Row style={{ justifyContent: "center", gap: 16 }}>
        {links.map((l) => (
          <LinkButton key={l.kind} title={l.label} onPress={() => void Linking.openURL(l.href)} />
        ))}
      </Row>
      {SUPPORT_CONTACT.hours ? <Text muted size={12} style={{ textAlign: "center" }}>{SUPPORT_CONTACT.hours}</Text> : null}
      <LinkButton title={t.feedback.link} onPress={() => router.push("/feedback")} />
    </View>
  );
}
