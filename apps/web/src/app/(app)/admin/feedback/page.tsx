"use client";

import { isSuperadminMode, listFeedback, queryKeys, setFeedbackStatus, t, type FeedbackStatus } from "@jamaiah/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDate } from "@/components/support";
import { Badge, Card, ErrorText, errorText, Loading, PageTitle, Select } from "@/components/ui";
import { useActing } from "@/lib/acting";
import { useMe } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

type Row = Awaited<ReturnType<typeof listFeedback>>[number];
const STATUSES: FeedbackStatus[] = ["new", "in_review", "resolved"];

// Superadmin: complaints & suggestions sent from the public form.
export default function FeedbackAdminPage() {
  const { data: me, isLoading } = useMe();
  const platform = isSuperadminMode(me, useActing());
  const list = useQuery({ queryKey: queryKeys.feedback, queryFn: () => listFeedback(supabase()), enabled: platform });
  const [filter, setFilter] = useState<"all" | FeedbackStatus>("all");

  if (isLoading || (platform && list.isLoading)) return <Loading />;
  if (!platform) return <p className="text-muted">هذه الصفحة متاحة بدور مدير المنصة فقط. اختر الدور من القائمة أسفل اسمك.</p>;
  const rows = (list.data ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t.feedback.admin.title}>
        <div className="w-44">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="الحالة">
            <option value="all">الكل</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t.feedback.admin.statuses[s]}</option>)}
          </Select>
        </div>
      </PageTitle>
      {rows.length === 0 && <p className="text-sm text-muted">{t.feedback.admin.none}</p>}
      {rows.map((r) => <FeedbackCard key={r.id} row={r} />)}
    </div>
  );
}

function FeedbackCard({ row: r }: { row: Row }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (status: FeedbackStatus) => setFeedbackStatus(supabase(), r.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.feedback }),
  });
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="ltr" className="font-mono text-sm font-semibold">{r.reference}</span>
        <Badge tone={r.kind === "complaint" ? "danger" : "primary"}>{t.feedback.kinds[r.kind as keyof typeof t.feedback.kinds]}</Badge>
        {r.topic && <Badge>{t.feedback.topics[r.topic as keyof typeof t.feedback.topics]}</Badge>}
        <span className="me-auto text-xs text-muted">{formatDate(r.created_at)}</span>
        <Select className="h-8 w-auto py-0 text-xs" value={r.status} disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.value as FeedbackStatus)} aria-label="الحالة">
          {STATUSES.map((s) => <option key={s} value={s}>{t.feedback.admin.statuses[s]}</option>)}
        </Select>
      </div>
      {/* React escapes all text here, so submitted HTML/script is shown as plain text. */}
      <p className="whitespace-pre-wrap break-words text-sm">{r.message}</p>
      <p className="text-xs text-muted">
        {r.full_name} · <span dir="ltr">{r.email}</span>
        {r.phone && <> · <span dir="ltr">{r.phone}</span></>}
        {r.association_name && <> · {r.association_name}</>}
      </p>
      <ErrorText>{errorText(save.error)}</ErrorText>
    </Card>
  );
}
