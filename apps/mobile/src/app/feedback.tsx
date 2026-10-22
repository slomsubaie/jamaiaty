import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_TOPICS,
  feedbackInput,
  submitFeedback,
  t,
  toLatinDigits,
} from "@jamaiah/shared";
import { Stack } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Button, Card, Chip, ErrorText, Input, Row, Screen, Text, useColors } from "@/components/ui";
import { supabase } from "@/lib/supabase";

type Kind = (typeof FEEDBACK_KINDS)[number];
type Topic = (typeof FEEDBACK_TOPICS)[number];
const ERR = t.feedback.errors as Record<string, string>;

// Public screen: complaints & suggestions (works logged in or out).
export default function Feedback() {
  const c = useColors();
  const empty = { kind: "complaint" as Kind, topic: undefined as Topic | undefined, full_name: "", email: "", phone: "", association_name: "", message: "", consent: false };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setFormError("");
    const check = feedbackInput.safeParse(form);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const i of check.error.issues) {
        const field = String(i.path[0]);
        const value = (form as Record<string, unknown>)[field];
        next[field] ??= value === "" || value === undefined ? t.feedback.required : ERR[i.message] ?? t.feedback.required;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    const res = await submitFeedback(supabase, { ...form, consent: true });
    setSending(false);
    if (res.ok) {
      setReference(res.reference);
      setForm(empty);
    } else if (res.fields?.length) {
      setErrors(Object.fromEntries(res.fields.map((f) => [f.field, ERR[f.code] ?? t.feedback.required])));
    } else {
      setFormError(ERR[res.error] ?? ERR.generic);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ headerShown: true, title: t.feedback.title, headerBackButtonDisplayMode: "minimal" }} />
      <Screen>
        {reference ? (
          <Card style={{ alignItems: "center", gap: 10 }}>
            <Text bold size={18} style={{ textAlign: "center" }}>{t.feedback.successTitle}</Text>
            <Text muted style={{ textAlign: "center" }}>{t.feedback.successBody(reference)}</Text>
            <Text bold size={20} style={{ textAlign: "center" }}>{reference}</Text>
            <Button variant="ghost" title={t.feedback.another} onPress={() => setReference(null)} />
          </Card>
        ) : (
          <>
            <Text muted>{t.feedback.intro}</Text>
            <Card style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Text bold size={14}>{t.feedback.kind} *</Text>
                <Row>
                  {FEEDBACK_KINDS.map((k) => (
                    <Chip key={k} label={t.feedback.kinds[k]} selected={form.kind === k} onPress={() => set("kind", k)} />
                  ))}
                </Row>
              </View>
              <Input label={`${t.feedback.fullName} *`} value={form.full_name} maxLength={100} onChangeText={(v) => set("full_name", v)} autoComplete="name" />
              <ErrorText>{errors.full_name}</ErrorText>
              <Input label={`${t.feedback.email} *`} ltr value={form.email} maxLength={254} keyboardType="email-address" autoCapitalize="none"
                autoComplete="email" onChangeText={(v) => set("email", v)} />
              <ErrorText>{errors.email}</ErrorText>
              <Input label={t.feedback.phone} ltr value={form.phone} keyboardType="phone-pad" placeholder="05XXXXXXXX" maxLength={16}
                onChangeText={(v) => set("phone", toLatinDigits(v))} />
              <ErrorText>{errors.phone}</ErrorText>
              <View style={{ gap: 6 }}>
                <Text bold size={14}>{t.feedback.topic}</Text>
                <Row>
                  {FEEDBACK_TOPICS.map((tp) => (
                    <Chip key={tp} label={t.feedback.topics[tp]} selected={form.topic === tp} onPress={() => set("topic", form.topic === tp ? undefined : tp)} />
                  ))}
                </Row>
              </View>
              <Input label={t.feedback.association} value={form.association_name} maxLength={150} onChangeText={(v) => set("association_name", v)} />
              <Input label={`${t.feedback.message} *`} value={form.message} maxLength={FEEDBACK_MESSAGE_MAX} multiline
                placeholder={t.feedback.messagePlaceholder} onChangeText={(v) => set("message", v)}
                style={{ height: 140, textAlignVertical: "top", paddingTop: 10 }} />
              <Text muted size={12}>{t.feedback.counter(form.message.length, FEEDBACK_MESSAGE_MAX)}</Text>
              <ErrorText>{errors.message}</ErrorText>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: form.consent }} onPress={() => set("consent", !form.consent)}>
                <Row style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <Text size={18} style={{ color: form.consent ? c.primary : c.muted }}>{form.consent ? "☑" : "☐"}</Text>
                  <Text size={13} style={{ flex: 1 }}>{t.feedback.consent} *</Text>
                </Row>
              </Pressable>
              <ErrorText>{errors.consent}</ErrorText>
              <ErrorText>{formError}</ErrorText>
              <Button title={sending ? t.feedback.sending : t.feedback.submit} onPress={submit} disabled={sending} />
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
