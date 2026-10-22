import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionClock, EXTENSION_HOURS, newDeadline, responseTimeLeft, RESPONSE_GRACE_MINUTES, SESSION_HOURS, sessionState } from "./session.ts";

const H = 3600_000;
const M = 60_000;

test("session is 24h, extension 24h", () => {
  assert.equal(SESSION_HOURS, 24);
  assert.equal(EXTENSION_HOURS, 24);
  assert.equal(newDeadline(0), 24 * H);
});

test("state: active → prompt at the deadline → expired after the grace period", () => {
  const d = 24 * H;
  assert.equal(sessionState(d, d - 1), "active");
  assert.equal(sessionState(d, d), "prompt");
  assert.equal(sessionState(d, d + (RESPONSE_GRACE_MINUTES - 1) * M), "prompt");
  assert.equal(sessionState(d, d + RESPONSE_GRACE_MINUTES * M), "expired");
  assert.equal(responseTimeLeft(d, d + 4 * M), (RESPONSE_GRACE_MINUTES - 4) * M);
});

test("clock: start, extend, clear, and fresh deadline when missing", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  const clock = createSessionClock(storage);
  const before = Date.now();
  clock.start();
  assert.ok(clock.deadline() >= before + 24 * H);
  clock.clear();
  assert.equal(map.size, 0);
  assert.ok(clock.deadline() >= before + 24 * H, "a missing deadline starts fresh");
  map.set(clock.storageKey, String(before - H));
  clock.extend();
  assert.ok(clock.deadline() >= before + 24 * H);
});
