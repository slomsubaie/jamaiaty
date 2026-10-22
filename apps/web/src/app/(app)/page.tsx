"use client";

import { grantState, isSuperadminMode, listAllGrants, listMyMemberships, queryKeys, rolesLabel, t } from "@jamaiah/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Countdown, GrantActions } from "@/components/support";
import { Button, Card, Loading } from "@/components/ui";
import { useActing } from "@/lib/acting";
import { useMe } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/client";

export default function HomePage() {
  const { data: me, isLoading } = useMe();
  const acting = useActing();

  if (isLoading || !me) return <Loading />;
  return isSuperadminMode(me, acting) ? <PlatformHome /> : <AssociationsList userId={me.id} />;
}

/** Superadmin overview: platform tools and incoming support requests from associations. */
function PlatformHome() {
  const qc = useQueryClient();
  const grants = useQuery({ queryKey: queryKeys.allGrants, queryFn: () => listAllGrants(supabase()), refetchInterval: 60_000 });
  const waiting = (grants.data ?? []).filter((g) => grantState(g) === "pending" && g.direction === "association_request").length;
  const ongoing = (grants.data ?? [])
    .filter((g) => grantState(g) === "active")
    .sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">مدير المنصة</h1>
      <p className="text-sm text-muted">أنت الآن بدور مدير المنصة. لاستخدام صلاحياتك في جمعية، اختر دورك فيها من القائمة أسفل اسمك.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/support">
          <Card className={`h-full transition hover:border-primary ${waiting > 0 ? "border-danger" : ""}`}>
            <p className="font-semibold">{t.support.requests}</p>
            <p className={`mt-1 text-sm ${waiting > 0 ? "text-danger" : "text-muted"}`}>
              {grants.isLoading ? "…" : waiting > 0 ? t.support.waiting(waiting) : "لا توجد طلبات بانتظار الرد"}
            </p>
          </Card>
        </Link>
        <Link href="/admin">
          <Card className="h-full transition hover:border-primary"><p className="font-semibold">{t.nav.platformAdmin}</p></Card>
        </Link>
        <Link href="/admin/feedback">
          <Card className="h-full transition hover:border-primary"><p className="font-semibold">{t.feedback.admin.title}</p></Card>
        </Link>
      </div>

      <section aria-labelledby="ongoing-title" className="flex flex-col gap-3">
        <h2 id="ongoing-title" className="font-semibold">{t.support.ongoing}</h2>
        {!grants.isLoading && ongoing.length === 0 && <p className="text-sm text-muted">{t.support.noOngoing}</p>}
        {ongoing.map((g) => (
          <Card key={g.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{g.associations?.name}</span>
              <span className="me-auto text-sm text-muted">{g.reason}</span>
              <span className="text-xs text-muted">{t.support.timeLeft}</span>
              {g.expires_at && <Countdown until={g.expires_at} className="text-lg font-semibold" />}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Link href={`/a/${g.association_id}`}><Button className="h-8">{t.support.open}</Button></Link>
              <div className="flex-1">
                <GrantActions grant={g} side="platform" detailsHref={`/admin/support/${g.id}`}
                  onChanged={() => qc.invalidateQueries({ queryKey: queryKeys.allGrants })} />
              </div>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

function AssociationsList({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.myMemberships,
    queryFn: () => listMyMemberships(supabase(), userId),
  });
  if (isLoading) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t.nav.myAssociations}</h1>
      {data?.length === 0 && <p className="text-muted">{t.association.noMemberships}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {data?.map((m) => (
          <Link key={m.association_id} href={`/a/${m.association_id}`}>
            <Card className="transition hover:border-primary">
              <p className="font-semibold">{m.associations?.name}</p>
              <p className="mt-1 text-sm text-muted">
                {m.associations?.city} · {rolesLabel(m.roles)}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
