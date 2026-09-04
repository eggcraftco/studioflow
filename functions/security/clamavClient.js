"use strict";

// Talking to the scanner, and what to believe when it does not answer.
//
// ClamAV runs as its own Cloud Run service, scaled to zero. That is deliberate:
// the trigger has already taken the file's download token away before it calls
// here, so the file is unreachable for however long this takes. Latency cannot
// hurt correctness, only patience — which buys a scanner that costs pennies
// instead of one kept warm all month for uploads that arrive a few times a day.
//
// The price is cold starts. ClamAV loads a signature database on boot and that
// takes the better part of a minute, so the first request after an idle period
// will fail or hang. Hence the retries: a connection refused during a cold
// start is not a verdict, it is the scanner still getting up.
//
// What is NOT retried is a scanner that answers. If it says "infected", that is
// the answer. The only thing worth trying again is silence.

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 2000;

/** Errors worth another go: the scanner is not there yet, or not there now. */
function isTransient(status, error) {
  if (error) return true;                       // network refused, aborted, DNS
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;               // including 503 while booting
  return false;
}

/** Exponential, with jitter so a burst of uploads does not retry in lockstep. */
function backoffMs(attempt, base = DEFAULT_BASE_DELAY_MS, random = Math.random) {
  const exponential = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(exponential, 30000) + Math.floor(random() * 500);
}

/** Whatever the service said, reduced to a verdict the decision layer knows. */
function verdictFromResponse(body = {}) {
  const status = String(body.status || "").toLowerCase().trim();
  if (status === "clean" || status === "ok") return { verdict: "clean", detail: "" };
  if (status === "infected" || status === "found") {
    return { verdict: "infected", detail: String(body.signature || "").slice(0, 200) };
  }
  if (status === "too_large") return { verdict: "too_large", detail: "" };
  // Anything else — including an empty body, a 200 with no status, or a word
  // this version does not know — is not a pass.
  return { verdict: "unsupported", detail: String(body.status || "no status field").slice(0, 200) };
}

/**
 * Builds the `scanBuffer(bytes, meta)` the trigger expects.
 *
 * Returns a verdict string. It never throws: the trigger treats a throw and an
 * "error" identically, and returning the verdict keeps the reason readable.
 */
function createClamavScanner({
  endpoint,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  logger = console
} = {}) {
  if (!endpoint) return null;   // no endpoint means no scanner, and the trigger stays off

  return async function scanBuffer(bytes, meta = {}) {
    let lastReason = "never_attempted";

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response = null;
      let networkError = null;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(String(meta.name || "").slice(0, 300)),
            "X-Content-Type": String(meta.contentType || "").slice(0, 120)
          },
          body: bytes,
          signal: controller.signal
        });
      } catch (error) {
        networkError = error;
      } finally {
        clearTimeout(timer);
      }

      const status = response ? response.status : 0;
      if (response && response.ok) {
        let body = {};
        try { body = await response.json(); } catch { body = {}; }
        const { verdict, detail } = verdictFromResponse(body);
        if (detail) logger.log?.(`malwareScan: ${verdict} (${detail})`);
        return verdict;
      }

      lastReason = networkError
        ? String(networkError?.name === "AbortError" ? "timeout" : networkError?.message || networkError).slice(0, 120)
        : `http_${status}`;

      if (!isTransient(status, networkError) || attempt === attempts) break;
      await sleep(backoffMs(attempt, baseDelayMs, random));
    }

    // Out of attempts, or a failure that retrying cannot fix. Either way the
    // trigger keeps the token held — this is not a pass.
    logger.warn?.(`malwareScan: scanner unavailable after ${attempts} attempts (${lastReason})`);
    return lastReason === "timeout" ? "timeout" : "error";
  };
}

module.exports = { createClamavScanner, verdictFromResponse, isTransient, backoffMs };
