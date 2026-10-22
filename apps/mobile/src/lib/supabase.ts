import "expo-sqlite/localStorage/install";
import { createClient } from "@supabase/supabase-js";
import { actingFetch, createActingStore, createSessionClock, type Database } from "@jamaiah/shared";
import { AppState } from "react-native";

/** The role selected on the home screen; sent with every request to narrow privileges. */
export const actingStore = createActingStore();

/** Session deadline: 24h from login, extendable by 24h (see components/session-timer). */
export const sessionClock = createSessionClock();

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: actingFetch(actingStore) },
  },
);

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
