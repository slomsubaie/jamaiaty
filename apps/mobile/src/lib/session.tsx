import type { Session } from "@supabase/supabase-js";
import { createContext, use, useEffect, useState, type PropsWithChildren } from "react";
import { supabase } from "./supabase";

const SessionContext = createContext<{ session: Session | null; isLoading: boolean }>({
  session: null,
  isLoading: true,
});

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext value={{ session, isLoading }}>{children}</SessionContext>;
}

export function useSession() {
  return use(SessionContext);
}
