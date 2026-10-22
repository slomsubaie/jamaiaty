// Session time limit: after SESSION_HOURS the user is asked to extend (by EXTENSION_HOURS) or
// end the session. If nobody answers within RESPONSE_GRACE_MINUTES (e.g. the device was left
// unattended), the session ends and the user is logged out.

export const SESSION_HOURS = 24;
export const EXTENSION_HOURS = 24;
export const RESPONSE_GRACE_MINUTES = 10;

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const STORAGE_KEY = "jamaiah.session-deadline";

export type SessionState = "active" | "prompt" | "expired";

/** active: before the deadline · prompt: deadline passed, waiting for an answer · expired: no answer in time. */
export function sessionState(deadline: number, now = Date.now()): SessionState {
  if (now < deadline) return "active";
  if (now < deadline + RESPONSE_GRACE_MINUTES * MINUTE) return "prompt";
  return "expired";
}

/** Milliseconds left to answer the prompt (0 when expired). */
export function responseTimeLeft(deadline: number, now = Date.now()): number {
  return Math.max(0, deadline + RESPONSE_GRACE_MINUTES * MINUTE - now);
}

export function newDeadline(now = Date.now()): number {
  return now + SESSION_HOURS * HOUR;
}

export function extendedDeadline(now = Date.now()): number {
  return now + EXTENSION_HOURS * HOUR;
}

type KeyValueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Where the deadline is kept (localStorage, so it survives reloads and is shared by tabs). */
export function createSessionClock(storage: KeyValueStorage | null = defaultStorage()) {
  let memory: number | null = null;
  const read = (): number | null => {
    try {
      const v = Number(storage?.getItem(STORAGE_KEY));
      return Number.isFinite(v) && v > 0 ? v : memory;
    } catch {
      return memory;
    }
  };
  const write = (v: number | null) => {
    memory = v;
    try {
      if (v === null) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, String(v));
    } catch {
      // Storage unavailable: the deadline lasts for this page only.
    }
  };
  return {
    storageKey: STORAGE_KEY,
    /** The deadline, starting a fresh one if missing (e.g. sessions from before this feature). */
    deadline(): number {
      const d = read();
      if (d) return d;
      const fresh = newDeadline();
      write(fresh);
      return fresh;
    },
    /** Call right after a successful login. */
    start: () => write(newDeadline()),
    extend: () => write(extendedDeadline()),
    /** Call on logout. */
    clear: () => write(null),
  };
}

export type SessionClock = ReturnType<typeof createSessionClock>;
