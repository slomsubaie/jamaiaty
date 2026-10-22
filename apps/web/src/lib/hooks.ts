"use client";

import {
  encodeActing,
  getAccess,
  getMe,
  isSupportSession,
  listMyMemberships,
  logSupportView,
  queryKeys,
  roleOptions,
  type SupportSection,
} from "@jamaiah/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useActing } from "./acting";
import { supabase } from "./supabase/client";

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => getMe(supabase()) });
}

/** All roles the signed-in person holds (for the role menu), regardless of the selected one. */
export function useMyRoles() {
  const me = useMe();
  const memberships = useQuery({
    queryKey: queryKeys.myMemberships,
    queryFn: () => listMyMemberships(supabase(), me.data!.id),
    enabled: Boolean(me.data),
  });
  return {
    me: me.data,
    memberships: memberships.data,
    options: me.data && memberships.data ? roleOptions(me.data.is_superadmin, memberships.data) : undefined,
    isLoading: me.isLoading || memberships.isLoading,
  };
}

/**
 * What the user may do in one association under the selected role: membership, or (for a
 * superadmin) active support grants. Support-session page views are written to the audit log.
 */
export function useAccess(associationId: string, logAs?: { section: SupportSection; page: string }) {
  const me = useMe();
  const acting = useActing();
  const access = useQuery({
    queryKey: [...queryKeys.access(associationId), me.data?.id, acting ? encodeActing(acting) : "all"],
    queryFn: () => getAccess(supabase(), associationId, me.data!.id, acting),
    enabled: Boolean(me.data),
  });
  const support = access.data ? isSupportSession(access.data) : false;
  const section = logAs?.section;
  const page = logAs?.page;

  useEffect(() => {
    if (support && section && page) void logSupportView(supabase(), associationId, section, page);
  }, [support, section, page, associationId]);

  return { me: me.data, access: access.data, isLoading: me.isLoading || access.isLoading };
}
