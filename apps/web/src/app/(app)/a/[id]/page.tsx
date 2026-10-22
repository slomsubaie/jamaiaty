"use client";

import {
  canApproveSupport,
  canView,
  GRANT_EVENT_LABELS,
  getAssociation,
  grantJourney,
  listGrants,
  isPresident,
  isSupportSession,
  supportExpiresAt,
  queryKeys,
  rolesLabel,
  t,
} from "@jamaiah/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDate, GrantStatusBadge, RequestSupportButton } from "@/components/support";
import { Card, Loading, SupportBanner } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

export default function AssociationHome() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id);
  const { data: assoc } = useQuery({ queryKey: queryKeys.association(id), queryFn: () => getAssociation(supabase(), id) });

  if (isLoading || !assoc || !access) return <Loading />;
  const support = isSupportSession(access);
  const isBoard = access.role === "president" || access.role === "board_member";

  const sections = [
    { href: `/a/${id}/archive`, label: t.association.archive, show: canView(access, "documents") },
    { href: `/a/${id}/vendors`, label: isBoard || support ? t.association.vendors : "دليل الشركات المتعاقدة", show: canView(access, "vendors") || access.role !== null },
    { href: `/a/${id}/finance`, label: isBoard || support ? t.association.finance : "ملخص الميزانية", show: canView(access, "finance") || access.role !== null },
    { href: `/a/${id}/sections`, label: t.sections.title, show: canView(access, "sections") },
    { href: `/a/${id}/units`, label: isBoard || support ? t.association.units : "وحداتي", show: canView(access, "units") },
    { href: `/a/${id}/members`, label: t.association.members, show: canView(access, "members") },
    { href: `/a/${id}/support`, label: t.support.title, show: canApproveSupport(access) },
    { href: `/a/${id}/settings`, label: "إعدادات الجمعية", show: isPresident(access) },
  ].filter((s) => s.show);

  return (
    <div className="flex flex-col gap-6">
      <SupportBanner show={support} expiresAt={supportExpiresAt(access)} />
      <div>
        <h1 className="text-xl font-bold">{assoc.name}</h1>
        <p className="text-sm text-muted">
          {assoc.city}
          {access.roles.length > 0 && ` · ${rolesLabel(access.roles)}`}
          {assoc.mullak_number && ` · ملاك: ${assoc.mullak_number}`}
        </p>
      </div>
      {canApproveSupport(access) && <SupportSummary associationId={id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition hover:border-primary">
              <p className="font-semibold">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * President / delegated board member: ask for support, and see the latest requests with the
 * platform's most recent reply (accepted, rejected with reason, done with what was done).
 */
function SupportSummary({ associationId }: { associationId: string }) {
  const qc = useQueryClient();
  const grants = useQuery({ queryKey: queryKeys.grants(associationId), queryFn: () => listGrants(supabase(), associationId) });
  const latest = (grants.data ?? []).slice(0, 3);
  return (
    <div className="flex flex-col gap-3">
      <RequestSupportButton associationId={associationId} onSent={() => qc.invalidateQueries({ queryKey: queryKeys.grants(associationId) })} />
      {latest.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t.support.latestReplies}</h2>
            <Link href={`/a/${associationId}/support`} className="text-sm text-primary hover:underline">{t.support.viewAll}</Link>
          </div>
          {latest.map((g) => {
            const steps = grantJourney(g);
            const last = steps[steps.length - 1];
            const reply = last && last.event !== "requested" ? last : null;
            return (
              <div key={g.id} className="flex flex-col gap-1 border-t border-border pt-3 text-sm first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <GrantStatusBadge grant={g} />
                  <span className="font-medium">{g.reason}</span>
                </div>
                {reply && (
                  <p className="text-muted">
                    {GRANT_EVENT_LABELS[reply.event as keyof typeof GRANT_EVENT_LABELS]} · {reply.actor?.full_name ?? "—"} · {formatDate(reply.created_at)}
                  </p>
                )}
                {reply?.note && <p className="whitespace-pre-wrap rounded-lg bg-background p-2">{reply.note}</p>}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
