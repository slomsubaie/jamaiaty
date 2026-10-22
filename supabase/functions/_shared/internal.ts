// Functions the database calls through pg_net (never the apps). They prove the call is ours with
// a shared secret: Vault `internal_functions_secret` = function secret INTERNAL_FUNCTIONS_SECRET.

declare global {
  const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
}

export function isInternal(req: Request): boolean {
  const expected = Deno.env.get("INTERNAL_FUNCTIONS_SECRET") ?? "";
  const given = req.headers.get("x-internal-secret") ?? "";
  if (!expected || given.length !== expected.length) return false;
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Calls another internal function (each call gets its own time limit). */
export async function callInternal(fn: string, body: unknown): Promise<void> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": Deno.env.get("INTERNAL_FUNCTIONS_SECRET") ?? "" },
    body: JSON.stringify(body),
  });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`${fn} answered ${res.status}`);
}
