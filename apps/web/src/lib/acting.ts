"use client";

import { createActingStore, type ActingRole } from "@jamaiah/shared";
import { useSyncExternalStore } from "react";

/** The role selected from the menu under the user's name (persisted in this browser). */
export const actingStore = createActingStore(typeof window === "undefined" ? null : undefined);

export function useActing(): ActingRole | null {
  return useSyncExternalStore(actingStore.subscribe, actingStore.get, () => null);
}
