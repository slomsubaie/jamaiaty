"use client";

import { createSessionClock } from "@jamaiah/shared";
import type { QueryClient } from "@tanstack/react-query";
import { actingStore } from "./acting";
import { supabase } from "./supabase/client";

/** Session deadline (24h from login, extendable), shared across this browser's tabs. */
export const sessionClock = createSessionClock(typeof window === "undefined" ? null : undefined);

/** Signs out and clears everything tied to the session. */
export async function logout(queryClient: QueryClient) {
  await supabase().auth.signOut();
  actingStore.set(null);
  sessionClock.clear();
  queryClient.clear();
  // Full navigation so the proxy sees the cleared session cookie.
  window.location.replace("/login");
}
