"use client";

import { EXTENSION_HOURS, responseTimeLeft, SESSION_HOURS, sessionState, t, type SessionState } from "@jamaiah/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { logout, sessionClock } from "@/lib/session";

function mmss(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * When the session deadline is reached, asks whether to extend it or end it. With no answer
 * within the grace period the user is logged out. Re-checks on a timer, when the tab becomes
 * visible again, and when another tab extends or ends the session.
 */
export function SessionTimer() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>("active");
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const extendRef = useRef<HTMLButtonElement>(null);

  const end = useCallback(async () => {
    setBusy(true);
    await logout(queryClient);
  }, [queryClient]);

  const check = useCallback(() => {
    const deadline = sessionClock.deadline();
    const next = sessionState(deadline);
    setState(next);
    setLeft(responseTimeLeft(deadline));
    if (next === "expired") void end();
  }, [end]);

  useEffect(() => {
    const first = setTimeout(check, 0);
    // Reading the deadline is cheap, so check often; the prompt's countdown ticks every second.
    const timer = setInterval(check, state === "prompt" ? 1000 : 5_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    window.addEventListener("focus", check);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== sessionClock.storageKey) return;
      // Another tab ended the session.
      if (e.newValue === null) window.location.replace("/login");
      else check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
    };
  }, [check, state]);

  useEffect(() => {
    if (state === "prompt") extendRef.current?.focus();
  }, [state]);

  if (state !== "prompt") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-title"
        aria-describedby="session-body"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <h2 id="session-title" className="text-lg font-bold">{t.session.title}</h2>
        <p id="session-body" className="mt-2 text-sm text-muted">{t.session.body(SESSION_HOURS)}</p>
        <p className="mt-3 text-sm text-danger" aria-live="polite">{t.session.autoLogout(mmss(left))}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            ref={extendRef}
            className="flex-1"
            disabled={busy}
            onClick={() => {
              sessionClock.extend();
              check();
            }}
          >
            {t.session.extend(EXTENSION_HOURS)}
          </Button>
          <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => void end()}>
            {t.session.end}
          </Button>
        </div>
      </div>
    </div>
  );
}
