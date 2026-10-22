"use client";

import { grantState, isSuperadminMode, listAllGrants, queryKeys, t, type GrantState } from "@jamaiah/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Countdown, formatDate, GRANT_DIRECTION_LABELS, GrantActions, grantScope, GrantStatusBadge } from "@/components/support";
import { Card, Loading, PageTitle, Select } from "@/components/ui";
import { useActing } from "@/lib/acting";
import { useMe } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

const FILTERS: { value: "all" | GrantState; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "pending", label: "بانتظار الرد" },
  { value: "active", label: "مفعّل" },
  { value: "expired", label: "منتهي" },
  { value: "rejected", label: "مرفوض" },
  { value: "revoked", label: "ملغى" },
];

// Superadmin: every support request on the platform. Requests from associations are accepted
// or rejected here; the platform's own requests wait for the association's answer.
export default function SupportRequestsPage() {
  const { data: me, isLoading } = useMe();
  const platform = isSuperadminMode(me, useActing());
  const qc = useQueryClient();
  const grants = useQuery({ queryKey: queryKeys.allGrants, queryFn: () => listAllGrants(supabase()), enabled: platform });
  const [filter, setFilter] = useState<"all" | GrantState>("all");
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.allGrants });

  if (isLoading || (platform && grants.isLoading)) return <Loading />;
  if (!platform) return <p className="text-muted">هذه الصفحة متاحة بدور مدير المنصة فقط. اختر الدور من القائمة أسفل اسمك.</p>;

  // Waiting-for-me first, then newest.
  const rows = (grants.data ?? [])
    .filter((g) => filter === "all" || grantState(g) === filter)
    .sort((a, b) => Number(grantState(b) === "pending" && b.direction === "association_request") - Number(grantState(a) === "pending" && a.direction === "association_request"));
  const waiting = (grants.data ?? []).filter((g) => grantState(g) === "pending" && g.direction === "association_request").length;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t.support.requests}>
        <div className="w-44">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label={t.support.status}>
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
      </PageTitle>
      {waiting > 0 && <p className="text-sm text-danger">{waiting} طلب بانتظار ردك</p>}
      {rows.length === 0 && <p className="text-sm text-muted">{t.support.none}</p>}
      <div className="flex flex-col gap-3">
        {rows.map((g) => (
          <Card key={g.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <GrantStatusBadge grant={g} />
              <span className="font-semibold">{g.associations?.name}</span>
              <span className="me-auto text-xs text-muted">{GRANT_DIRECTION_LABELS[g.direction as keyof typeof GRANT_DIRECTION_LABELS]}</span>
              {grantState(g) === "active" && g.expires_at && <Countdown until={g.expires_at} />}
            </div>
            <p className="text-sm">{g.reason}</p>
            <p className="text-sm text-muted">
              {grantScope(g)} · {t.support.requestedBy}: {g.requester?.full_name ?? "—"} · {formatDate(g.created_at)}
            </p>
            <GrantActions grant={g} side="platform" onChanged={refresh} detailsHref={`/admin/support/${g.id}`} />
          </Card>
        ))}
      </div>
    </div>
  );
}
