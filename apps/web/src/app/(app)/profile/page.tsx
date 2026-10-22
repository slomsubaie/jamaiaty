"use client";

import { formatSaudiPhone, queryKeys, t, updateMyName } from "@jamaiah/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, errorText, Field, Input, Loading } from "@/components/ui";
import { useMe } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) return <Loading />;
  return (
    <div className="flex max-w-lg flex-col gap-5">
      <h1 className="text-xl font-bold">{t.profile.title}</h1>
      <NameForm userId={me.id} initial={me.full_name} phone={me.phone} />
    </div>
  );
}

function NameForm({ userId, initial, phone }: { userId: string; initial: string; phone: string | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial);
  const save = useMutation({
    mutationFn: () => updateMyName(supabase(), userId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t.profile.fullName}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        <Field label={t.members.phone}>
          <Input dir="ltr" value={phone ? formatSaudiPhone(phone) : ""} disabled />
        </Field>
        <p className="text-xs text-muted">لتغيير رقم الجوال تواصل مع رئيس الجمعية.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>{t.common.save}</Button>
          {save.isSuccess && <span className="text-sm text-primary">{t.profile.saved}</span>}
          <ErrorText>{errorText(save.error)}</ErrorText>
        </div>
      </form>
    </Card>
  );
}
