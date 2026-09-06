// Admission for the two anonymous eBay routes (design §5.5).
//
// SERVER ONLY, and shared by `app/ebay/ticket/route.ts` and
// `app/ebay/callback/route.ts` for one reason: they had their own copies, and
// the copies disagreed about the same untrusted header. The ticket route said
// "a spoofed value evades it, so the PER-PROCESS bucket is the real bound"; the
// callback route said "the counter a seller charges is their own" and "the
// address comes from the proxy header the deployment sets" — and had no
// per-process bucket at all, on the path that costs a Cloud Function invocation
// per request. Only one of those can be true, and it is the first.
//
// WHAT `x-forwarded-for` IS WORTH HERE, stated once so neither route can
// restate it differently:
//
//   * Nothing on this stack has yet established that Hostinger's front end
//     OVERWRITES the header rather than appending to it (deploy plan §4.3 step
//     10). Until that is established, the leftmost element is whatever the
//     client sent.
//   * So a per-address bucket is a COURTESY limit. It binds an honest client and
//     a lazy flood; it does not bind an adversary, who supplies a fresh address
//     per request, or omits the header entirely.
//   * The PER-PROCESS bucket is therefore the real bound, and it is charged
//     FIRST — before the address is even read — so that a spoofed address cannot
//     skip it.
//   * The address is used for a counter and for nothing else. It is never logged.
//
// And a per-address map must not be a lever of its own. Both routes used to do
// `map.clear()` on overflow, which let 4097 spoofed addresses reset a real
// address's bucket as a side effect — a counter that an attacker can zero is
// not a counter. `trim` evicts RICHEST FIRST instead, so a bucket that has been
// throttled to zero is the last thing forgotten.

export type Bucket = { tokens: number; atMs: number };

export const BUCKET_WINDOW_MS = 60 * 1000;
export const MAX_TRACKED_ADDRESSES = 4096;

/** A token bucket refilled continuously. Returns false when it is empty. */
export function takeToken(bucket: Bucket, capacity: number, nowMs: number): boolean {
  if (bucket.atMs === 0) bucket.atMs = nowMs;
  bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, ((nowMs - bucket.atMs) / BUCKET_WINDOW_MS) * capacity));
  bucket.atMs = nowMs;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/**
 * The keyed bucket for `key`, with the map bounded.
 *
 * EVICTION ORDER IS THE POINT. A map that is emptied when it overflows is not a
 * counter: an attacker sending 4097 spoofed addresses clears the bucket of the
 * one address that was actually being limited, which is the cheapest possible way
 * to undo the limit. So eviction runs RICHEST FIRST — the buckets with the most
 * tokens left, which are the holders owed nothing and the ones whose absence
 * changes no answer — and a bucket that has been throttled down to zero is the
 * very last thing to go.
 */
export function bucketFor(map: Map<string, Bucket>, key: string, capacity: number, nowMs: number): Bucket {
  if (map.size > MAX_TRACKED_ADDRESSES) trim(map, capacity, nowMs);
  const bucket = map.get(key) || { tokens: capacity, atMs: nowMs };
  map.set(key, bucket);
  return bucket;
}

function refilled(bucket: Bucket, capacity: number, nowMs: number): number {
  return Math.min(capacity, bucket.tokens + Math.max(0, ((nowMs - bucket.atMs) / BUCKET_WINDOW_MS) * capacity));
}

function trim(map: Map<string, Bucket>, capacity: number, nowMs: number) {
  const target = Math.floor(MAX_TRACKED_ADDRESSES / 2);
  const richestFirst = [...map.entries()].sort((a, b) => refilled(b[1], capacity, nowMs) - refilled(a[1], capacity, nowMs));
  for (const [key] of richestFirst) {
    if (map.size <= target) return;
    map.delete(key);
  }
}

/**
 * The leftmost `x-forwarded-for` element, which is the client-supplied one on a
 * front end that appends. Empty when the header is absent — and an absent header
 * must never mean "admit", which is what the callback route used to do.
 */
export function clientAddress(header: string | null): string {
  return String(header || "").split(",")[0].trim();
}
