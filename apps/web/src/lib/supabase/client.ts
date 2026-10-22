import { createBrowserClient } from "@supabase/ssr";
import { actingFetch, type Database } from "@jamaiah/shared";
import { actingStore } from "../acting";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser client; the session lives in cookies so the proxy can see it too. Every request
 *  carries the selected role, which the database uses to narrow privileges. */
export function supabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { fetch: actingFetch(actingStore) } },
  );
  return client;
}
