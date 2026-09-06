"use strict";

// How a reconciliation pass carves time (design §7.1, §7.6).
//
// eBay's getOrders has no documented sort, so the Etsy trick — "advance the
// watermark to the last modification time seen" — is unavailable: a truncated
// page set says nothing about WHICH orders were read. What is safe is a window
// read to its end. So a window that does not fit the page budget is BISECTED:
// the earlier half is read (and recorded, moving the watermark to its end),
// then the later half with a fresh page budget, recursing at most a few times.
// The watermark therefore only ever stands at the end of a sub-window that was
// read completely — never at `now`.
//
// Pure: the driver takes a `readWindow` callback and does no I/O of its own.
const { cursorWindow, DEFAULT_OVERLAP_MS, DEFAULT_MAX_WINDOW_MS } = require("../cursors");

const MAX_BISECTIONS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const NIGHTLY_LOOKBACK_MS = 7 * DAY_MS;
const NIGHTLY_OVERLAP_MS = DAY_MS;

/** A window split at its midpoint; the later half re-reads the overlap so nothing falls between. */
function splitWindow({ fromMs, toMs }, overlapMs = DEFAULT_OVERLAP_MS) {
  const mid = Math.floor((Number(fromMs) + Number(toMs)) / 2);
  return [
    { fromMs: Number(fromMs), toMs: mid },
    { fromMs: Math.max(Number(fromMs), mid - overlapMs), toMs: Number(toMs) }
  ];
}

/** A long window cut into `sliceMs` pieces, oldest first, each overlapping the previous by `overlapMs`. */
function sliceWindow({ fromMs, toMs }, sliceMs = DAY_MS, overlapMs = DEFAULT_OVERLAP_MS) {
  const out = [];
  let cursor = Number(fromMs);
  const end = Number(toMs);
  if (!(end > cursor)) return [{ fromMs: cursor, toMs: end }];
  while (cursor < end) {
    const to = Math.min(end, cursor + sliceMs);
    out.push({ fromMs: out.length ? Math.max(Number(fromMs), cursor - overlapMs) : cursor, toMs: to });
    cursor = to;
  }
  return out;
}

/**
 * Walk one window with bisection.
 *
 * @param readWindow  async ({fromMs,toMs}) → { complete: boolean, truncated?: boolean, ...counts }
 *                    `complete` false with `truncated` true means "did not fit"; false without it
 *                    means "something failed" (recorded incomplete, not bisected).
 * @returns {{ completed: [], truncatedAt: null|{}, subWindows: number, bisections: number, results: [] }}
 *   `completed` are the sub-windows read to their end, in time order and contiguous
 *   from `fromMs`; the watermark may move to the end of the last of them.
 */
async function walkWindow({ fromMs, toMs }, readWindow, { overlapMs = DEFAULT_OVERLAP_MS, maxBisections = MAX_BISECTIONS, deadlineMs = Infinity, now = () => Date.now() } = {}) {
  const completed = []; const results = [];
  let bisections = 0; let subWindows = 0; let truncatedAt = null; let exhausted = false;
  const stack = [{ fromMs: Number(fromMs), toMs: Number(toMs), depth: 0 }];
  while (stack.length && !truncatedAt) {
    if (now() > deadlineMs) { exhausted = true; truncatedAt = stack[0]; break; }
    const window = stack.shift();
    subWindows += 1;
    const result = await readWindow({ fromMs: window.fromMs, toMs: window.toMs });
    results.push({ ...window, ...result });
    if (result && result.complete) { completed.push({ fromMs: window.fromMs, toMs: window.toMs }); continue; }
    if (result && result.truncated && window.depth < maxBisections && window.toMs - window.fromMs > 2 * overlapMs) {
      bisections += 1;
      const [earlier, later] = splitWindow(window, overlapMs);
      stack.unshift({ ...earlier, depth: window.depth + 1 }, { ...later, depth: window.depth + 1 });
      continue;
    }
    truncatedAt = { fromMs: window.fromMs, toMs: window.toMs, reason: result && result.truncated ? "budget" : "failed" };
  }
  return { completed, truncatedAt, subWindows, bisections, results, exhausted };
}

/** The nightly lookback: a week, or from a day before the last full pass, whichever is later. */
function nightlyWindow(nowMs, lastFullReconciliationAtMs = 0) {
  const now = Number(nowMs);
  const last = Number(lastFullReconciliationAtMs) || 0;
  const fromMs = last > 0 ? Math.max(now - NIGHTLY_LOOKBACK_MS, last - NIGHTLY_OVERLAP_MS) : now - NIGHTLY_LOOKBACK_MS;
  return { fromMs, toMs: now, reason: last > 0 ? "nightly" : "nightly_first" };
}

/**
 * The window the 15-minute pass should read: the common cursor's incremental
 * window — unless the connection owes a catch-up (`catchUpDueFromMs` > 0:
 * reconnect, flag turned on, long stand-down), in which case the window starts
 * there regardless of the 24 h cap, in day-long slices oldest first.
 */
function catchUpWindow(cursor, connection, nowMs, { force = false, lookbackMs = DEFAULT_MAX_WINDOW_MS, overlapMs = DEFAULT_OVERLAP_MS } = {}) {
  const now = Number(nowMs);
  const due = Number(connection?.catchUpDueFromMs || 0);
  if (due > 0 && due < now) {
    const fromMs = Math.max(0, due - overlapMs);
    return { fromMs, toMs: now, reason: "catch_up", catchUp: true, slices: sliceWindow({ fromMs, toMs: now }, DAY_MS, overlapMs) };
  }
  const window = cursorWindow(cursor, now, { force, lookbackMs, overlapMs });
  return { ...window, catchUp: false, slices: [{ fromMs: window.fromMs, toMs: window.toMs }] };
}

module.exports = { MAX_BISECTIONS, DAY_MS, NIGHTLY_LOOKBACK_MS, NIGHTLY_OVERLAP_MS, splitWindow, sliceWindow, walkWindow, nightlyWindow, catchUpWindow };
