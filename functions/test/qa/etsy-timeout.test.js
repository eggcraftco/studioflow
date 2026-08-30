// The request timeout must cover the response BODY, not just the headers.
//
// fetch() resolves as soon as the headers arrive; the body is still streaming.
// Clearing the abort timer at that moment leaves every `await response.text()`
// unbounded, and a server that sends headers and then stalls hangs the call
// for as long as the platform allows — measured at twelve minutes against a
// two-second timeout before this was fixed. One stalled Etsy response would
// then stall a whole reconciliation sweep and every receipt queued behind it.
//
// This test uses a real socket rather than a stubbed fetch, because the bug
// lived precisely in the gap between "fetch resolved" and "body consumed", and
// a stub cannot reproduce that gap.

const assert = require("assert");
const http = require("http");
const { etsyFetch } = require("../../etsy");

let failed = 0;
function report(ok, what, detail) {
  if (ok) { console.log("  ok  " + what); return; }
  failed += 1;
  console.log("  FAIL " + what + (detail ? "\n        " + detail : ""));
}

(async () => {
  console.log("Etsy request timeout");

  // A server that sends a 200 and one partial chunk, then never finishes.
  const stalling = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json", "Transfer-Encoding": "chunked" });
    res.write('{"resu');
    // deliberately never res.end()
  });
  await new Promise((resolve) => stalling.listen(0, "127.0.0.1", resolve));
  const port = stalling.address().port;

  const started = Date.now();
  let threw = null;
  try {
    await etsyFetch(`http://127.0.0.1:${port}/stall`, { keystring: "k", timeoutMs: 700 });
  } catch (error) {
    threw = error;
  }
  const elapsed = Date.now() - started;

  report(threw !== null, "a stalled response body eventually fails instead of hanging",
    threw === null ? `resolved after ${elapsed}ms — the body read was unbounded` : "");
  // Four attempts, each bounded by the timeout plus backoff. The point is that
  // it finishes at all, and in seconds rather than minutes.
  report(elapsed < 30000, `it gives up in bounded time (took ${elapsed}ms)`,
    elapsed >= 30000 ? `took ${elapsed}ms` : "");
  report(threw && threw.name === "EtsyApiError" && threw.code === "network",
    "the abort surfaces as a retryable network error",
    threw ? `got ${threw.name}/${threw.code}` : "nothing thrown");

  stalling.close();

  // And the normal path must still work — a fix that times out healthy
  // requests would be worse than the bug.
  const healthy = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ results: [{ shop_id: 222 }] }));
  });
  await new Promise((resolve) => healthy.listen(0, "127.0.0.1", resolve));
  const okPort = healthy.address().port;
  const body = await etsyFetch(`http://127.0.0.1:${okPort}/fine`, { keystring: "k", timeoutMs: 2000 });
  report(body && body.results && body.results[0].shop_id === 222, "a healthy response still reads its whole body");
  healthy.close();

  if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
  console.log("\nPASS");
})();
