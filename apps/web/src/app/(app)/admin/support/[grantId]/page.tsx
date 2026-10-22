"use client";

import { formatSaudiPhone, getGrant, grantState, isSuperadminMode, queryKeys, t } from "@jamaiah/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Countdown, formatDate, GRANT_DIRECTION_LABELS, GrantActions, GrantJourney, grantScope, GrantStatusBadge } from "@/components/support";
import { Button, Card, Loading, PageTitle } from "@/components/ui";
import { useActing } from "@/lib/acting";
import { useMe } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[12rem_1fr]">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function SupportRequestDetails() {
  const { grantId } = useParams<{ grantId: string }>();
  const { data: me, isLoading } = useMe();
  const platform = isSuperadminMode(me, useActing());
  const qc = useQueryClient();
  const grant = useQuery({ queryKey: ["grant", grantId], queryFn: () => getGrant(supabase(), grantId), enabled: platform });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["grant", grantId] });
    qc.invalidateQueries({ queryKey: queryKeys.allGrants });
  };

  if (isLoading || (platform && grant.isLoading)) return <Loading />;
  if (!platform) return <p className="text-muted">هذه الصفحة متاحة بدور مدير المنصة فقط. اختر الدور من القائمة أسفل اسمك.</p>;
  const g = grant.data;
  if (!g) return <p className="text-muted">{t.support.notFound}</p>;
  const active = grantState(g) === "active";

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={g.reason} back={{ href: "/admin/support", label: t.support.requests }} />
      <Card>
        <Row label={t.support.status}><GrantStatusBadge grant={g} /></Row>
        <Row label={t.support.direction}>{GRANT_DIRECTION_LABELS[g.direction as keyof typeof GRANT_DIRECTION_LABELS]}</Row>
        <Row label={t.support.association}>{g.associations?.name} · {g.associations?.city}</Row>
        <Row label={t.support.reason}>{g.reason}</Row>
        <Row label={t.support.scope}>{grantScope(g)}</Row>
        <Row label={t.support.requestedBy}>
          {g.requester?.full_name ?? "—"}{" "}
          {g.requester?.phone && <span dir="ltr" className="text-muted">{formatSaudiPhone(g.requester.phone)}</span>}
        </Row>
        <Row label={t.support.createdAt}>{formatDate(g.created_at)}</Row>
        {g.decided_at && <Row label={t.support.decidedBy}>{g.decider?.full_name ?? "—"} · {formatDate(g.decided_at)}</Row>}
        {active && g.expires_at && <Row label={t.support.timeLeft}><Countdown until={g.expires_at} className="text-lg font-semibold" /></Row>}
        {g.status === "approved" && <Row label={t.support.expires}>{formatDate(g.expires_at)}</Row>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{t.support.journey}</h2>
        <GrantJourney grant={g} />
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        {active && (
          <Link href={`/a/${g.association_id}`}><Button className="h-8">{t.support.open}</Button></Link>
        )}
        <div className="flex-1"><GrantActions grant={g} side="platform" onChanged={refresh} /></div>
      </div>
    </div>
  );
}
