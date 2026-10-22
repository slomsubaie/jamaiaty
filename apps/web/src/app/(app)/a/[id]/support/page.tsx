"use client";

import { canApproveSupport, grantState, listGrants, queryKeys, t } from "@jamaiah/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import {
  formatDate,
  GRANT_DIRECTION_LABELS,
  Countdown,
  GrantActions,
  GrantJourney,
  grantScope,
  GrantStatusBadge,
  RequestSupportButton,
} from "@/components/support";
import { Card, Loading, PageTitle } from "@/components/ui";
import { useAccess } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

// President (or a board member with approve_support_access): ask the platform for help, and
// accept or reject the platform's requests to access the association. Nothing is accessible
// to the platform team without the association's agreement, and every view is logged.
export default function SupportPage() {
  const { id } = useParams<{ id: string }>();
  const { access, isLoading } = useAccess(id);
  const qc = useQueryClient();
  const grants = useQuery({ queryKey: queryKeys.grants(id), queryFn: () => listGrants(supabase(), id) });
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.grants(id) });

  if (isLoading || grants.isLoading || !access) return <Loading />;
  if (!canApproveSupport(access)) return <p className="text-muted">{t.common.noPermission}</p>;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t.support.title} back={{ href: `/a/${id}`, label: "الجمعية" }} />
      <p className="text-sm text-muted">
        لا يستطيع فريق المنصة الاطلاع على بيانات الجمعية إلا إذا طلبت الدعم وقبل الفريق طلبك، ولمدة محددة فقط، وتُسجَّل كل صفحة يفتحها في سجل الجمعية.
      </p>
      <RequestSupportButton associationId={id} onSent={refresh} />
      <div className="flex flex-col gap-3">
        {grants.data?.length === 0 && <p className="text-sm text-muted">{t.support.none}</p>}
        {grants.data?.map((g) => (
          <Card key={g.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <GrantStatusBadge grant={g} />
              <span className="text-xs text-muted">{GRANT_DIRECTION_LABELS[g.direction as keyof typeof GRANT_DIRECTION_LABELS]}</span>
              <span className="me-auto font-semibold">{g.reason}</span>
              {grantState(g) === "active" && g.expires_at && <Countdown until={g.expires_at} />}
            </div>
            <p className="text-sm text-muted">
              {grantScope(g)} · {t.support.requestedBy}: {g.requester?.full_name ?? "—"} · {formatDate(g.created_at)}
              {g.status === "approved" && g.expires_at && ` · ${t.support.expires} ${formatDate(g.expires_at)}`}
            </p>
            <details className="text-sm" open={grantState(g) !== "pending"}>
              <summary className="cursor-pointer text-muted">{t.support.journey}</summary>
              <div className="mt-3"><GrantJourney grant={g} /></div>
            </details>
            <GrantActions grant={g} side="association" onChanged={refresh} />
          </Card>
        ))}
      </div>
    </div>
  );
}
