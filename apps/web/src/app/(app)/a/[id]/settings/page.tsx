"use client";

import { getAssociation, isPresident, queryKeys, t, updateAssociation } from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, errorText, Field, Input, Loading, PageTitle } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

// President: edit the association's details. (Plan and status are the superadmin's, in /admin.)
export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id);
  const assoc = useQuery({ queryKey: queryKeys.association(id), queryFn: () => getAssociation(supabase(), id) });

  if (isLoading || assoc.isLoading || !access || !assoc.data) return <Loading />;
  if (!isPresident(access)) return <p className="text-muted">{t.common.noPermission}</p>;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="إعدادات الجمعية" back={{ href: `/a/${id}`, label: assoc.data.name }} />
      <DetailsForm id={id} initial={assoc.data} />
    </div>
  );
}

function DetailsForm({ id, initial }: { id: string; initial: { name: string; city: string; mullak_number: string | null } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: initial.name, city: initial.city, mullak_number: initial.mullak_number ?? "" });
  const save = useMutation({
    mutationFn: () =>
      updateAssociation(supabase(), id, {
        name: form.name.trim(),
        city: form.city.trim(),
        mullak_number: form.mullak_number.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.association(id) });
      qc.invalidateQueries({ queryKey: queryKeys.myMemberships });
    },
  });

  return (
    <Card>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t.admin.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label={t.admin.city}>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        </Field>
        <Field label={t.admin.mullakNumber}>
          <Input value={form.mullak_number} onChange={(e) => setForm({ ...form, mullak_number: e.target.value })} />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-3">
          <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
          {save.isSuccess && <span className="text-sm text-primary">{t.profile.saved}</span>}
          <ErrorText>{errorText(save.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}
