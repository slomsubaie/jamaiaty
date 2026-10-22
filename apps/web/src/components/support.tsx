"use client";

import {
  actOnSupportRequest,
  createSupportRequest,
  GRANT_DIRECTION_LABELS,
  GRANT_EVENT_LABELS,
  GRANT_STATUS_LABELS,
  grantActions,
  grantJourney,
  grantState,
  SUPPORT_SECTION_LABELS,
  SUPPORT_SECTIONS,
  t,
  type Grant,
  type SupportAction,
  type SupportSection,
} from "@jamaiah/shared";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Button, Card, ErrorText, errorText, Field, Input, Select, Textarea } from "./ui";

export type GrantFormValue = { reason: string; sections: SupportSection[]; duration_hours: 24 | 72 | 168; can_edit: boolean };

export function GrantFields({ value, onChange }: { value: GrantFormValue; onChange: (v: GrantFormValue) => void }) {
  const toggle = (s: SupportSection) =>
    onChange({ ...value, sections: value.sections.includes(s) ? value.sections.filter((x) => x !== s) : [...value.sections, s] });
  return (
    <>
      <Field label={t.support.reason}>
        <Input value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} required />
      </Field>
      <Field label={t.support.duration}>
        <Select value={value.duration_hours} onChange={(e) => onChange({ ...value, duration_hours: Number(e.target.value) as 24 | 72 | 168 })}>
          {([24, 72, 168] as const).map((h) => <option key={h} value={h}>{t.support.hours(h)}</option>)}
        </Select>
      </Field>
      <div className="flex flex-col gap-2 text-sm sm:col-span-2">
        <span className="font-medium">{t.support.scope}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SUPPORT_SECTIONS.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" checked={value.sections.includes(s)} onChange={() => toggle(s)} />
              {SUPPORT_SECTION_LABELS[s]}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.can_edit} onChange={(e) => onChange({ ...value, can_edit: e.target.checked })} />
          {t.support.canEdit}
        </label>
      </div>
    </>
  );
}

export function GrantStatusBadge({ grant }: { grant: Pick<Grant, "status" | "expires_at"> }) {
  const state = grantState(grant);
  const tone = state === "active" || state === "completed" ? "primary" : state === "pending" ? "danger" : "neutral";
  return <Badge tone={tone}>{GRANT_STATUS_LABELS[state]}</Badge>;
}

export function grantScope(g: Pick<Grant, "sections" | "can_edit" | "duration_hours">) {
  return `${g.sections.map((s) => SUPPORT_SECTION_LABELS[s as SupportSection]).join("، ")} · ${t.support.hours(g.duration_hours)} · ${g.can_edit ? "عرض وتعديل" : "عرض فقط"}`;
}

export function formatDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export { GRANT_DIRECTION_LABELS };

const NOTE_LABEL: Partial<Record<SupportAction, string>> = {
  approve: t.support.acceptNote,
  reject: t.support.rejectNote,
  complete: t.support.doneNote,
};
const NOTE_REQUIRED: SupportAction[] = ["reject", "complete"];

function actionError(error: unknown) {
  const m = error instanceof Error ? error.message : "";
  if (m === "note_required") return t.support.noteRequired;
  if (m === "note_too_long") return t.support.noteTooLong;
  return errorText(error);
}

/**
 * Platform side: accept / reject (pending) and "done" (active) — each opens a note box with a
 * submit button; a note is required to reject or mark done. Association side: cancel a
 * pending request or end active access. Every action is recorded in the request's journey.
 */
export function GrantActions({
  grant,
  side,
  onChanged,
  detailsHref,
}: {
  grant: Pick<Grant, "id" | "status" | "expires_at" | "direction">;
  side: "platform" | "association";
  onChanged: () => void;
  detailsHref?: string;
}) {
  const [noteFor, setNoteFor] = useState<SupportAction | null>(null);
  const [note, setNote] = useState("");
  const act = useMutation({
    mutationFn: ({ action, text }: { action: SupportAction; text?: string }) => {
      if (NOTE_REQUIRED.includes(action) && !text?.trim()) throw new Error("note_required");
      return actOnSupportRequest(supabase(), grant.id, action, text);
    },
    onSuccess: () => {
      setNoteFor(null);
      setNote("");
      onChanged();
    },
  });
  const { canDecide, canCancel, canComplete, canEnd } = grantActions(grant, side);
  const open = (action: SupportAction) => {
    act.reset();
    setNote("");
    setNoteFor(noteFor === action ? null : action);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {detailsHref && (
          <Link href={detailsHref}><Button variant="secondary" className="h-8">{t.support.details}</Button></Link>
        )}
        {canDecide && (
          <>
            <Button className="h-8" variant={noteFor === "approve" ? "primary" : "secondary"} onClick={() => open("approve")}>{t.support.approve}</Button>
            <Button className={`h-8 ${noteFor === "reject" ? "" : "text-danger"}`} variant={noteFor === "reject" ? "primary" : "secondary"} onClick={() => open("reject")}>
              {t.support.reject}
            </Button>
          </>
        )}
        {canComplete && (
          <Button className="h-8" variant={noteFor === "complete" ? "primary" : "secondary"} onClick={() => open("complete")}>{t.support.done}</Button>
        )}
        {canCancel && (
          <Button variant="ghost" className="h-8 text-danger" disabled={act.isPending}
            onClick={() => confirm("إلغاء هذا الطلب؟") && act.mutate({ action: "cancel" })}>{t.support.cancel}</Button>
        )}
        {canEnd && (
          <Button variant="secondary" className="h-8 text-danger" disabled={act.isPending}
            onClick={() => confirm("إنهاء صلاحية الدعم الآن؟") && act.mutate({ action: "end" })}>{t.support.end}</Button>
        )}
      </div>
      {noteFor && (
        <form
          className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
          onSubmit={(e: FormEvent) => { e.preventDefault(); act.mutate({ action: noteFor, text: note }); }}
        >
          <label htmlFor={`note-${grant.id}`} className="text-sm font-medium">{NOTE_LABEL[noteFor]}</label>
          <Textarea id={`note-${grant.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000}
            required={NOTE_REQUIRED.includes(noteFor)} autoFocus className="min-h-20" />
          <div className="flex items-center gap-2">
            <Button type="submit" className="h-8" disabled={act.isPending}>{t.support.submit}</Button>
            <Button type="button" variant="ghost" className="h-8" onClick={() => setNoteFor(null)}>{t.common.cancel}</Button>
            <span className="text-xs text-muted">{note.length} / 2000</span>
          </div>
        </form>
      )}
      <ErrorText>{act.error ? actionError(act.error) : ""}</ErrorText>
    </div>
  );
}

/** Live countdown to `until` (hh:mm:ss, with days when longer). */
export function Countdown({ until, className = "" }: { until: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  if (now === null) return <span className={className}>…</span>;
  const left = Math.max(0, new Date(until).getTime() - now);
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span dir="ltr" className={`font-mono tabular-nums ${left < 3600_000 ? "text-danger" : ""} ${className}`} aria-label={t.support.timeLeft}>
      {d > 0 ? `${d}d ` : ""}{hh}:{mm}:{ss}
    </span>
  );
}

/** Every step of a request with who did it, when, and their note. */
export function GrantJourney({ grant }: { grant: Grant }) {
  const steps = grantJourney(grant);
  const expired = grantState(grant) === "expired";
  return (
    <ol className="relative flex flex-col gap-3 border-s-2 border-border ps-4">
      {steps.map((s) => (
        <li key={s.id} className="relative">
          <span className={`absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ${s.event === "rejected" || s.event === "cancelled" ? "bg-danger" : "bg-primary"}`} />
          <p className="text-sm font-medium">{GRANT_EVENT_LABELS[s.event as keyof typeof GRANT_EVENT_LABELS] ?? s.event}</p>
          <p className="text-xs text-muted">{s.actor?.full_name ?? "—"} · {formatDate(s.created_at)}</p>
          {s.note && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-background p-2 text-sm">{s.note}</p>}
        </li>
      ))}
      {expired && (
        <li className="relative">
          <span className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-border" />
          <p className="text-sm font-medium">{GRANT_STATUS_LABELS.expired}</p>
          <p className="text-xs text-muted">{formatDate(grant.expires_at)}</p>
        </li>
      )}
    </ol>
  );
}

/**
 * The president (or a board member with the support permission) asks the platform for help.
 * Shown behind a "طلب دعم فني" button; a superadmin accepts or rejects the request.
 */
export function RequestSupportButton({ associationId, onSent }: { associationId: string; onSent?: () => void }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const empty: GrantFormValue = { reason: "", sections: ["sections"], duration_hours: 24, can_edit: false };
  const [form, setForm] = useState(empty);
  const send = useMutation({
    mutationFn: () => {
      if (form.sections.length === 0) throw new Error("اختر قسماً واحداً على الأقل");
      return createSupportRequest(supabase(), { association_id: associationId, ...form });
    },
    onSuccess: () => {
      setForm(empty);
      setOpen(false);
      setSent(true);
      onSent?.();
    },
  });

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => { setOpen(true); setSent(false); }}>{t.support.requestHelp}</Button>
        {sent && (
          <p role="status" className="text-sm text-primary">
            {t.support.sent}{" "}
            <Link href={`/a/${associationId}/support`} className="underline">{t.support.track}</Link>
          </p>
        )}
      </div>
    );
  }
  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); send.mutate(); }}>
        <h2 className="font-semibold sm:col-span-2">{t.support.requestHelp}</h2>
        <p className="text-sm text-muted sm:col-span-2">
          بعد قبول فريق المنصة للطلب يحصل على صلاحية مؤقتة للأقسام المحددة فقط، ويمكنك إنهاؤها في أي وقت من صفحة الدعم الفني.
        </p>
        <GrantFields value={form} onChange={setForm} />
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={send.isPending}>إرسال</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
          <ErrorText>{errorText(send.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}
