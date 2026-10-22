// The role a person is currently acting in. People can hold several roles (superadmin,
// president, board member, owner); they pick one from the menu under their name and the app
// sends it to the database as the `x-acting-role` header, where it can only narrow privileges.
import { ROLE_LABELS } from "./strings.ts";
import { ROLE_RANK, type MemberRole } from "./roles.ts";

export const ACTING_HEADER = "x-acting-role";
const STORAGE_KEY = "jamaiah.acting-role";

export type ActingRole =
  | { kind: "superadmin" }
  | { kind: "member"; role: MemberRole; association_id: string };

export function encodeActing(a: ActingRole): string {
  return a.kind === "superadmin" ? "superadmin" : `${a.role}:${a.association_id}`;
}

export function decodeActing(value: string | null | undefined): ActingRole | null {
  if (!value) return null;
  if (value === "superadmin") return { kind: "superadmin" };
  const [role, association_id] = value.split(":");
  if ((role === "president" || role === "board_member" || role === "owner") && association_id) {
    return { kind: "member", role, association_id };
  }
  return null;
}

export function sameActing(a: ActingRole | null, b: ActingRole | null): boolean {
  return (a ? encodeActing(a) : null) === (b ? encodeActing(b) : null);
}

export interface RoleOption {
  acting: ActingRole;
  label: string;
  /** Association name for member roles. */
  detail?: string;
}

/** Every role the person holds, superadmin first, then by association and rank. */
export function roleOptions(
  isSuperadmin: boolean,
  memberships: { association_id: string; associations: { name: string } | null; roles: MemberRole[] }[],
): RoleOption[] {
  const options: RoleOption[] = [];
  if (isSuperadmin) options.push({ acting: { kind: "superadmin" }, label: "مدير المنصة" });
  for (const m of memberships) {
    for (const role of [...m.roles].sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b])) {
      options.push({
        acting: { kind: "member", role, association_id: m.association_id },
        label: ROLE_LABELS[role],
        detail: m.associations?.name,
      });
    }
  }
  return options;
}

/** Whether platform (superadmin) powers apply under the current acting role. */
export function isSuperadminMode(me: { is_superadmin: boolean } | null | undefined, acting: ActingRole | null): boolean {
  return Boolean(me?.is_superadmin) && (!acting || acting.kind === "superadmin");
}

type KeyValueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Tiny observable store for the acting role, persisted in localStorage when available. */
export function createActingStore(storage: KeyValueStorage | null = defaultStorage()) {
  let current: ActingRole | null = decodeActing(storage?.getItem(STORAGE_KEY));
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: ActingRole | null) {
      if (sameActing(current, next)) return;
      current = next;
      try {
        if (next) storage?.setItem(STORAGE_KEY, encodeActing(next));
        else storage?.removeItem(STORAGE_KEY);
      } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this session.
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ActingStore = ReturnType<typeof createActingStore>;

/** fetch wrapper for the Supabase client that adds the acting-role header to every request. */
export function actingFetch(store: ActingStore, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const acting = store.get();
    if (!acting) return base(input, init);
    const headers = new Headers(init?.headers);
    headers.set(ACTING_HEADER, encodeActing(acting));
    return base(input, { ...init, headers });
  };
}
