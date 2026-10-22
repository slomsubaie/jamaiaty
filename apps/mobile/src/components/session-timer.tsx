import { EXTENSION_HOURS, responseTimeLeft, SESSION_HOURS, sessionState, t, type SessionState } from "@jamaiah/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { AppState, Modal, View } from "react-native";
import { logout } from "@/lib/logout";
import { sessionClock } from "@/lib/supabase";
import { Button, Text, useColors } from "./ui";

function mmss(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Asks to extend or end the session when its time is up; logs out if nobody answers in time. */
export function SessionTimer() {
  const c = useColors();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>("active");
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);

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
    const timer = setInterval(check, state === "prompt" ? 1000 : 5_000);
    // Timers pause in the background, so re-check when the app comes back.
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      sub.remove();
    };
  }, [check, state]);

  return (
    <Modal visible={state === "prompt"} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24, direction: "rtl" }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 20, gap: 12 }} accessibilityRole="alert">
          <Text bold size={18}>{t.session.title}</Text>
          <Text muted>{t.session.body(SESSION_HOURS)}</Text>
          <Text style={{ color: c.danger }}>{t.session.autoLogout(mmss(left))}</Text>
          <Button
            title={t.session.extend(EXTENSION_HOURS)}
            disabled={busy}
            onPress={() => {
              sessionClock.extend();
              check();
            }}
          />
          <Button variant="ghost" title={t.session.end} disabled={busy} onPress={() => void end()} />
        </View>
      </View>
    </Modal>
  );
}
