"use client";

import {
  createAssociation,
  deleteAssociation,
  formatSaudiPhone,
  listAllAssociations,
  listAllGrants,
  listSuperadmins,
  manageSuperadmin,
  queryKeys,
  checkOtpHealth,
  isSuperadminMode,
  grantState,
  t,
  toLatinDigits,
  updateAssociation,
} from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GrantStatusBadge, grantScope } from "@/components/support";
import { Badge, Button, Card, DeleteButton, ErrorText, errorText, Field, Input, Loading, Select } from "@/components/ui";
import { useActing } from "@/lib/acting";
import { useMe } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Association = Awaited<ReturnType<typeof listAllAssociations>>[number];
type Grant = Awaited<ReturnType<typeof listAllGrants>>[number];

export default function AdminPage() {
  const { data: me, isLoading } = useMe();
  const platform = isSuperadminMode(me, useActing());
  const list = useQuery({
    queryKey: queryKeys.allAssociations,
    queryFn: () => listAllAssociations(supabase()),
    enabled: platform,
  });
  const grants = useQuery({
    queryKey: queryKeys.allGrants,
    queryFn: () => listAllGrants(supabase()),
    enabled: platform,
  });

  if (isLoading) return <Loading />;
  if (!me || !platform) return <p className="text-muted">هذه الصفحة متاحة بدور مدير المنصة فقط. اختر الدور من القائمة أسفل اسمك.</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{t.nav.platformAdmin}</h1>
      <OtpHealthCard />
      <CreateAssociationForm />
      <Superadmins myId={me.id} />
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.admin.associations}</h2>
        {list.isLoading && <Loading />}
        {list.data?.map((a) => (
          <AssociationCard key={a.id} association={a} grants={(grants.data ?? []).filter((g) => g.association_id === a.id)} />
        ))}
      </section>
    </div>
  );
}

function CreateAssociationForm() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const empty = { name: "", city: "", mullak_number: "", president_name: "", president_phone: "" };
  const [form, setForm] = useState(empty);
  const create = useMutation({
    mutationFn: () => createAssociation(supabase(), form),
    onSuccess: () => {
      setForm(empty);
      setOpen(false);
      qc.invalidateQueries({ queryKey: queryKeys.allAssociations });
    },
  });
  const field = (key: keyof typeof empty, label: string, ltr = false) => (
    <Field label={label}>
      <Input dir={ltr ? "ltr" : undefined} type={ltr ? "tel" : undefined} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: ltr ? toLatinDigits(e.target.value) : e.target.value })} required={key !== "mullak_number"} />
    </Field>
  );

  if (!open) return <div><Button onClick={() => setOpen(true)}>+ {t.admin.newAssociation}</Button></div>;
  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
        <h2 className="font-semibold sm:col-span-2">{t.admin.newAssociation}</h2>
        {field("name", t.admin.name)}
        {field("city", t.admin.city)}
        {field("mullak_number", t.admin.mullakNumber)}
        {field("president_name", t.admin.presidentName)}
        {field("president_phone", t.admin.presidentPhone, true)}
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={create.isPending}>{t.admin.create}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
        </div>
        <ErrorText>{errorText(create.error)}</ErrorText>
      </form>
    </Card>
  );
}

function AssociationCard({ association: a, grants }: { association: Association; grants: Grant[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: a.name,
    city: a.city,
    mullak_number: a.mullak_number ?? "",
    plan: a.plan as "base" | "premium",
    status: a.status as "active" | "suspended",
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.allAssociations });
    qc.invalidateQueries({ queryKey: queryKeys.allGrants });
  };
  const save = useMutation({
    mutationFn: () =>
      updateAssociation(supabase(), a.id, { ...form, name: form.name.trim(), city: form.city.trim(), mullak_number: form.mullak_number.trim() || null }),
    onSuccess: () => { setEditing(false); refresh(); },
  });
  const remove = useMutation({ mutationFn: () => deleteAssociation(supabase(), a.id), onSuccess: refresh });
  const active = grants.find((g) => grantState(g) === "active");

  return (
    <Card className="flex flex-col gap-3">
      {editing ? (
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Field label={t.admin.name}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label={t.admin.city}><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></Field>
          <Field label={t.admin.mullakNumber}><Input value={form.mullak_number} onChange={(e) => setForm({ ...form, mullak_number: e.target.value })} /></Field>
          <Field label="الباقة">
            <Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as "base" | "premium" })}>
              <option value="base">أساسية</option>
              <option value="premium">مميزة</option>
            </Select>
          </Field>
          <Field label="الحالة">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "suspended" })}>
              <option value="active">نشطة</option>
              <option value="suspended">موقوفة</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="me-auto">
            <p className="font-semibold">{a.name}</p>
            <p className="text-sm text-muted">
              {a.city}
              {a.mullak_number && ` · ملاك: ${a.mullak_number}`}
              {a.president && <> · الرئيس: {a.president.full_name} {a.president.phone && <span dir="ltr">{formatSaudiPhone(a.president.phone)}</span>}</>}
            </p>
          </div>
          <Badge tone={a.plan === "premium" ? "primary" : "neutral"}>{a.plan === "premium" ? "مميزة" : "أساسية"}</Badge>
          {a.status === "suspended" && <Badge tone="danger">موقوفة</Badge>}
          {active && (
            <Link href={`/a/${a.id}`}><Button className="h-8">{t.support.open}</Button></Link>
          )}
          <Button variant="ghost" className="h-8 px-2" onClick={() => setEditing(true)}>{t.common.edit}</Button>
          <DeleteButton
            message={`حذف جمعية "${a.name}" وكل بياناتها نهائياً؟ لا يمكن التراجع.`}
            disabled={remove.isPending}
            onConfirm={() => prompt(`للتأكيد اكتب اسم الجمعية: ${a.name}`) === a.name && remove.mutate()}
          />
        </div>
      )}
      <ErrorText>{errorText(save.error) || errorText(remove.error)}</ErrorText>
      {grants.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm">
          {grants.slice(0, 5).map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-2">
              <GrantStatusBadge grant={g} />
              <Link href={`/admin/support/${g.id}`} className="hover:underline">{g.reason}</Link>
              <span className="text-muted">{grantScope(g)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// Only a superadmin can grant or revoke superadmin; the last one can't be removed.
function Superadmins({ myId }: { myId: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.superadmins, queryFn: () => listSuperadmins(supabase()) });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.superadmins });
    qc.invalidateQueries({ queryKey: queryKeys.me });
  };
  const add = useMutation({
    mutationFn: () => manageSuperadmin(supabase(), { phone: form.phone, full_name: form.full_name, grant: true }),
    onSuccess: () => { setForm({ full_name: "", phone: "" }); setAdding(false); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (phone: string) => manageSuperadmin(supabase(), { phone, grant: false }),
    onSuccess: refresh,
  });
  const removeError = remove.error?.message === "last_superadmin" ? t.superadmins.lastOne : errorText(remove.error);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t.superadmins.title}</h2>
        {!adding && <Button variant="secondary" className="h-8" onClick={() => setAdding(true)}>+ {t.superadmins.add}</Button>}
      </div>
      {list.data?.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm last:border-0">
          <span className="font-medium">{p.full_name} {p.id === myId && <span className="text-muted">{t.superadmins.you}</span>}</span>
          {p.phone && <span dir="ltr" className="me-auto text-muted">{formatSaudiPhone(p.phone)}</span>}
          {p.phone && (
            <DeleteButton
              label={t.superadmins.remove}
              message={p.id === myId ? "ستفقد صلاحية إدارة المنصة بنفسك. متابعة؟" : `إزالة صلاحية مدير المنصة من ${p.full_name}؟`}
              disabled={remove.isPending}
              onConfirm={() => remove.mutate(p.phone!)}
            />
          )}
        </div>
      ))}
      <ErrorText>{removeError}</ErrorText>
      {adding && (
        <form className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }}>
          <Field label={t.members.fullName}>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="مطلوب للأرقام الجديدة" />
          </Field>
          <Field label={t.members.phone}>
            <Input dir="ltr" type="tel" placeholder="05XXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: toLatinDigits(e.target.value) })} required />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={add.isPending}>{t.common.add}</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>{t.common.cancel}</Button>
          </div>
          <div className="sm:col-span-3"><ErrorText>{errorText(add.error)}</ErrorText></div>
        </form>
      )}
    </Card>
  );
}

// Warns the superadmin when login codes can't be delivered (e.g. an expired WhatsApp token).
function OtpHealthCard() {
  const health = useQuery({
    queryKey: ["otp-health"],
    queryFn: async () => {
      const result = await checkOtpHealth(supabase());
      // Warn three days before a temporary token runs out.
      const soon = Boolean(result.ok && result.expires_at && new Date(result.expires_at).getTime() - Date.now() < 3 * 24 * 3600_000);
      return { ...result, soon };
    },
    refetchInterval: 10 * 60_000,
  });
  const h = health.data;
  const soon = h?.soon;
  const tone = !h ? "neutral" : !h.ok ? "danger" : soon ? "danger" : "primary";
  const text = !h
    ? health.isLoading ? "جارٍ الفحص…" : errorText(health.error)
    : !h.ok
      ? h.reason === "not_configured" ? t.otpHealth.notConfigured : t.otpHealth.broken
      : h.permanent
        ? `${t.otpHealth.ok} · ${t.otpHealth.permanent}`
        : t.otpHealth.expires(new Date(h.expires_at!).toLocaleString("ar-SA"));
  return (
    <Card className={`flex flex-wrap items-center gap-3 ${tone === "danger" ? "border-danger" : ""}`}>
      <span className="font-semibold">{t.otpHealth.title}</span>
      <Badge tone={tone}>{h?.ok && !soon ? t.otpHealth.ok : h ? "تنبيه" : "…"}</Badge>
      <span className="me-auto text-sm text-muted">{text}</span>
      <Button variant="ghost" className="h-8" disabled={health.isFetching} onClick={() => health.refetch()}>{t.otpHealth.check}</Button>
    </Card>
  );
}
