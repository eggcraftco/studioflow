// When a customer's file is still "being checked", how long to wait before
// asking the server again — or that it is time to stop asking on our own.
//
// The scan verdict is written where only the server can read it; nothing tells
// the page when it lands, so the page has to ask. The scanner is a service that
// sleeps when idle: the first file after a quiet spell can take a minute just
// to wake it, and the scanner itself gives up after 300 s. So the page asks
// often at first (most files are clean within seconds), then less often, and
// keeps going until the scanner's own limit has passed, with a margin.
//
// Pure: the same schedule is written out in Swift (EGGcraft) and Kotlin
// (Android) and checked by scripts/check-inbox-scan-poll.mjs.

/** Ask every 4 s for the first minute… */
export const SCAN_POLL_FAST_MS = 4_000;
export const SCAN_POLL_FAST_UNTIL_MS = 60_000;
/** …then every 8 s for the second minute… */
export const SCAN_POLL_MEDIUM_MS = 8_000;
export const SCAN_POLL_MEDIUM_UNTIL_MS = 120_000;
/** …then every 15 s… */
export const SCAN_POLL_SLOW_MS = 15_000;
/** …until 330 s have passed: the scanner's 300 s limit plus a margin. */
export const SCAN_POLL_BUDGET_MS = 330_000;
/** A guard against a clock that does not move: never more asks than this. */
export const SCAN_POLL_MAX_TRIES = 200;

/**
 * The wait before the next ask, in milliseconds, or `null` when the page
 * should stop asking on its own and say "still being checked".
 *
 * @param elapsedMs time since the first ask of this round
 * @param tries     how many "still scanning" answers this round has had
 */
export function nextScanPollDelay(elapsedMs: number, tries: number): number | null {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  if (elapsed >= SCAN_POLL_BUDGET_MS) return null;
  if (tries >= SCAN_POLL_MAX_TRIES) return null;
  if (elapsed < SCAN_POLL_FAST_UNTIL_MS) return SCAN_POLL_FAST_MS;
  if (elapsed < SCAN_POLL_MEDIUM_UNTIL_MS) return SCAN_POLL_MEDIUM_MS;
  return SCAN_POLL_SLOW_MS;
}
