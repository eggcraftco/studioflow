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
//     FIRST — before the header is even read — so that a spoofed value cannot
//     skip it.
//   * The value is used for a counter and for nothing else. It is never logged.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TRUSTED-PROXY BOUNDARY: WHAT THE TREE ESTABLISHES, AND WHAT IT DOES NOT
//
// This was searched before the M1/L1 package was written, because a hop policy
// (take the Nth element from the right, after N trusted hops) is only correct if
// the deployment answer is known. HALF of it is known, and it is the half that
// does not decide the policy.
//
// ESTABLISHED — what sits in front of this app, on the host these two routes are
// served from. Three independent records, two of them measured against the live
// site, and they agree:
//
//   * `docs/ebay-callback-platform-logging.md:33-34` (measured 6 Sep 2026, three
//     synthetic requests to production): "the site is served by LiteSpeed at
//     Hostinger. DNS is on Cloudflare nameservers, but the A record resolves to
//     Hostinger and no `cf-ray` header comes back, so **Cloudflare is DNS-only
//     and proxies nothing today**".
//   * Commit `bd107bee` ("The web route answers on hostnames the attacker picks"),
//     recorded from six read-only probes: "the apex is grey-cloud, so
//     nivadesk.app hits the Hostinger origin with no edge in front while the
//     subdomains go through the Worker".
//   * `docs/DURUM.md:1367-1368`, the Worker rollout record: "`*` A 192.0.2.1
//     PROXIED … mcp + www + apex grey-cloud → Worker'a girmiyor" (the apex does
//     not enter the Worker).
//
// So: ONE front end, Hostinger's own LiteSpeed, for `nivadesk.app`. The
// Cloudflare-for-SaaS Worker that `docs/ebay-web-callback-deploy-plan.md:56` and
// `docs/ebay-connector-design.md:2008` name is real, but it serves
// `*.nivadesk.app` and customers' own domains — it is cited there for the
// SIBLING-ORIGIN COOKIE surface (`__Host-`), not as a hop in front of the apex.
// A reader could take those two sentences for a contradiction of the three above;
// they are not one, and this note exists so nobody has to re-derive that.
//
// NOT ESTABLISHED — what that one front end DOES with an inbound
// `x-forwarded-for`. Nothing in any of the three repositories records it: no
// header dump, no request log with the field in it, no support answer, no
// configuration we own. It is recorded as OPEN in four places
// (`docs/ebay-web-callback-deploy-plan.md:351-352`,
// `docs/ebay-final-gate-result.md:176`, `docs/ebay-backlog.md:21`,
// `docs/nivadesk-current-handoff.md:214`), and Hostinger's own answers on the
// neighbouring questions (platform-logging, the table at :113-119) are "not
// established" / "not disclosed" three times out of five.
//
// KNOWING THE HOP COUNT IS NOT ENOUGH, which is why "one front end" does not
// settle it. If LiteSpeed APPENDS, the rightmost element is the true peer and a
// one-trusted-hop policy is correct. If it PASSES THROUGH a client-supplied
// header untouched — which a shared front end that does not sanitise will do —
// then there is no hop to count and the rightmost element is attacker-chosen
// too, so a hop policy would convert a spoofable value into a TRUSTED one. That
// is the failure this package must not ship, so NO HOP POLICY IS IMPLEMENTED
// HERE. The leftmost element is kept, deliberately: under the overwrite case it
// is the true client, under the append case it is the client's own claim, and
// under both it buckets an honest client consistently — which is all a bucketing
// key has to do.
//
// WHAT WOULD SETTLE IT, precisely, so the next person does not have to re-derive
// the experiment either. Any ONE of:
//
//   1. Deploy plan §4.3 step 10's own check, which is the cheapest: send ONE
//      request to a route that counts, carrying `X-Forwarded-For: 198.51.100.9`
//      of your own, and read what the route bucketed. If the bucket key is
//      `198.51.100.9`, LiteSpeed passed the client's value through and the
//      header is worthless as identity. If it is your real egress address, it
//      overwrote. If it is `198.51.100.9, <your address>`, it appended and the
//      trusted hop count is 1. (This is a live request to production and is NOT
//      done here — it needs the operator, and it belongs in that step.)
//   2. A written answer from Hostinger naming LiteSpeed's proxy-header policy
//      for Node.js applications on Cloud Startup — the same channel that
//      answered the logging questions.
//   3. The production cutover to `connect.nivadesk.app`
//      (`docs/ebay-production-callback-worker-design.md`), which replaces the
//      question rather than answering it: a Cloudflare Worker we own can be made
//      to set one header we define, from `request.cf`, and the hop count becomes
//      ours to state.
//
// Until one of those exists, the derived value is an UNTRUSTED BUCKETING KEY and
// nothing else. It is never identity: it may cost a caller work, and it may
// never grant a caller anything, and no refusal keyed on it is final ahead of a
// proof the route actually holds. Both routes are built that way (M1 at
// `app/ebay/ticket/route.ts` step 3, L1 at `app/ebay/callback/route.ts` step 7),
// and `scripts/check-ebay-dispose-admission.mjs` pins it rather than trusting
// this paragraph.
//
// ─── 28 Sep 2026: WHICH ELEMENT, decided (docs/ebay-callback-edge.md §4) ─────
//
// The owner's ruling is to stop reading the LEFTMOST element. Item 3 above has
// since been built — production's return leg is the Worker on
// connect.nivadesk.app, which keys on the address Cloudflare gives it — so what
// stays on Hostinger is the sandbox callback and the sealing route, and for
// those the key is now THE ELEMENT THE TRUSTED PROXY APPENDED: counting
// `NIVADESK_TRUSTED_PROXY_HOPS` (default 1) from the RIGHT.
//
// The argument above against a hop policy was that it could turn a spoofable
// value into a TRUSTED one. It cannot here, because nothing here trusts the value:
// every rule in the paragraph above still holds word for word, and they are what
// make a wrong guess harmless. What the choice of element decides is only how
// often the key is the caller's own claim, and the rightmost element is never
// worse than the leftmost under any behaviour the front end could have:
//
//   * APPENDS (the common proxy behaviour): leftmost = the caller's claim,
//     rightmost = the address LiteSpeed saw. Rightmost is strictly better — the
//     per-address courtesy limit then binds an adversary too.
//   * OVERWRITES: one element, the true client. Identical.
//   * PASSES THROUGH, or sets nothing (Next.js then fills in the socket peer only
//     when the header is absent): the caller's claim, or one shared value, either
//     way. Identical — and that is exactly the case the rules above were built for.
//
// So the rightmost element weakly dominates, and the one thing it still needs is
// the hop count. One is the safe default: the apex is DNS-only (the three records
// above), Hostinger's assistant confirmed on 6 Sep that its CDN is not enabled
// for nivadesk.app, so LiteSpeed is the only hop. Hostinger's real header
// behaviour has NOT been measured — measuring it needs a request to production,
// which this change does not make — so deploy plan §4.3 step 10's one-request
// check is still the thing that settles it, and a larger count is a restart with
// a new environment value, not a rebuild.
//
// `CF-Connecting-IP`, `True-Client-IP` and `X-Real-IP` are NOT read here and must
// never be: the apex is not behind Cloudflare, so on these routes those headers
// are written by the caller. `scripts/check-ebay-proxy-hop.mjs` pins all of it.
// ─────────────────────────────────────────────────────────────────────────────
//
// And a per-address map must not be a lever of its own. Both routes used to do
// `map.clear()` on overflow, which let 4097 spoofed addresses reset a real
// address's bucket as a side effect — a counter that an attacker can zero is
// not a counter. `trim` evicts RICHEST FIRST instead, so a bucket that has been
// throttled to zero is the last thing forgotten.

import { isIP } from "node:net";

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
 * A BUCKETING KEY derived from `x-forwarded-for`. Not an address, and not an
 * identity — the name says so because the old name (`clientAddress`) invited
 * both readings, and the callback route had already taken the second one in a
 * comment ("the address comes from the proxy header the deployment sets").
 *
 * It is the element the trusted proxy APPENDED — `hops` from the right, one by
 * default — which is the address LiteSpeed saw on a front end that appends, and
 * the true client on one that overwrites (see the 28 Sep block at the top of this
 * file for why that is never worse than the leftmost). WHICH behaviour this
 * deployment has is still not measured, so the value is trusted for nothing.
 * Anything that is not an IP literal is no key at all (""), and so is a header
 * shorter than the hop count: a chain shorter than the proxies we expect is not
 * a chain we can read.
 *
 * The rules that hold whatever the front end does, and that the routes are built
 * to and the tests pin:
 *
 *   * it may COST a caller work, and it may never GRANT a caller anything (a
 *     caller can always omit the header, so supplying one is never an advantage);
 *   * no refusal keyed on it is FINAL ahead of a proof the route actually holds;
 *   * it reaches no log line and no answer.
 *
 * Empty when the header is absent — and an absent header must never mean
 * "admit", which is what the callback route used to do.
 */
export function untrustedBucketKey(header: string | null, hops: number = trustedProxyHops()): string {
  const chain = String(header || "").split(",").map((element) => element.trim());
  if (chain.length === 1 && chain[0] === "") return "";
  const count = Number.isInteger(hops) && hops >= 1 && hops <= MAX_TRUSTED_PROXY_HOPS ? hops : DEFAULT_TRUSTED_PROXY_HOPS;
  if (chain.length < count) return "";
  const appended = chain[chain.length - count];
  return isIpLiteral(appended) ? appended : "";
}

/** How many proxies in front of this app append to `x-forwarded-for`. Read per
 *  call, so a correction after the deploy plan's one-request check is a restart
 *  with a new value rather than a rebuild. Anything but 1…3 is the default. */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;
export const MAX_TRUSTED_PROXY_HOPS = 3;
export function trustedProxyHops(): number {
  const raw = String(process.env.NIVADESK_TRUSTED_PROXY_HOPS || "").trim();
  const value = /^[1-9]$/.test(raw) ? Number(raw) : DEFAULT_TRUSTED_PROXY_HOPS;
  return value <= MAX_TRUSTED_PROXY_HOPS ? value : DEFAULT_TRUSTED_PROXY_HOPS;
}

/** A bare IPv4 or IPv6 literal — Node's own parser, so `1.2.3.4:80`, a zone id
 *  or a hostname is no key — and nothing longer than an address can be. */
export function isIpLiteral(value: string): boolean {
  const text = String(value || "");
  return text.length > 0 && text.length <= 45 && !text.includes("%") && isIP(text) !== 0;
}
