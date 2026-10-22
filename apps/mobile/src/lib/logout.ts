import type { QueryClient } from "@tanstack/react-query";
import { actingStore, sessionClock, supabase } from "./supabase";

/** Signs out and clears everything tied to the session; the root layout then shows sign-in. */
export async function logout(queryClient: QueryClient) {
  await supabase.auth.signOut();
  actingStore.set(null);
  sessionClock.clear();
  queryClient.clear();
}
