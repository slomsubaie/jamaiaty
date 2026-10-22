"use client";

import { sameActing } from "@jamaiah/shared";
import { useEffect, type ReactNode } from "react";
import { Loading } from "@/components/ui";
import { actingStore, useActing } from "@/lib/acting";
import { useMyRoles } from "@/lib/hooks";

/**
 * Makes sure a valid role is selected before any page loads data: the saved choice if the
 * person still holds it, otherwise their first role (superadmin first, then by association).
 */
export function RoleGate({ children }: { children: ReactNode }) {
  const { options } = useMyRoles();
  const acting = useActing();
  const valid = Boolean(options && (options.length === 0 ? !acting : acting && options.some((o) => sameActing(o.acting, acting))));

  useEffect(() => {
    if (options && !valid) actingStore.set(options[0]?.acting ?? null);
  }, [options, valid]);

  if (!options || !valid) return <Loading />;
  return <>{children}</>;
}
