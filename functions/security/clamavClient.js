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
//
// The scanner is asked to scan an object BY REFERENCE — bucket, name,
// generation — and fetches the bytes from Cloud Storage itself. Nothing about
// the file passes through this process or through a Cloud Run request body,
// so the file's size is bounded by the scanner's cap and clamd's limits, not
// by this function's memory or the platform's 32 MiB request limit.

// Where a Google-managed runtime hands out an identity token for itself.
const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_ATTEMPTS = 4;
const DEFAULT_BASE_DELAY_MS = 2000;

/**
 * An identity token for the scanner, from the runtime's own metadata server.
 *
 * The scanner is deployed private — it reads any object it is pointed at and
 * must never be an open endpoint — so every call carries a token whose
 * audience is the scanner's URL. The calling service account holds
 * `run.invoker` on that one service and nothing else.
 *
 * Cached until shortly before it expires, because minting one per upload is a
 * round trip to the metadata server for no benefit.
 */
function createIdentityTokenSource({ audience, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  let cached = { token: "", expiresAtMs: 0 };
  return async function identityToken() {
    if (cached.token && cached.expiresAtMs > now() + 60000) return cached.token;
    const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`;
    const response = await fetchImpl(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!response.ok) throw new Error(`identity_token_http_${response.status}`);
    const token = (await response.text()).trim();
    if (!token) throw new Error("identity_token_empty");
    // Google's identity tokens last an hour; hold it for slightly less.
    cached = { token, expiresAtMs: now() + 50 * 60 * 1000 };
    return token;
  };
}

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
  // The generation the trigger named is not there any more — overwritten or
  // deleted since the event. Not a pass and not a failure: there is nothing
  // left to have an opinion about.
  if (status === "gone") return { verdict: "gone", detail: "" };
  // Anything else — including an empty body, a 200 with no status, or a word
  // this version does not know — is not a pass.
  return { verdict: "unsupported", detail: String(body.status || "no status field").slice(0, 200) };
}

/** The scanner's URL, with the by-reference route on the end. */
function scanRoute(endpoint) {
  return `${String(endpoint).replace(/\/+$/, "")}/scan`;
}

/**
 * Builds the `scanner(ref)` the trigger expects.
 *
 * `ref` is { bucket, name, generation, sizeBytes, contentType }. Returns a
 * verdict string. It never throws: the trigger treats a throw and an "error"
 * identically, and returning the verdict keeps the reason readable.
 */
function createClamavScanner({
  endpoint,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  logger = console,
  // Overridable so the suite can drive this without a metadata server.
  identityToken = null
} = {}) {
  if (!endpoint) return null;   // no endpoint means no scanner, and the trigger stays off
  const tokenFor = identityToken || createIdentityTokenSource({ audience: endpoint, fetchImpl });
  const route = scanRoute(endpoint);

  return async function scanner(ref = {}) {
    let lastReason = "never_attempted";

    // No token, no call. Calling unauthenticated would fail with a 403 anyway,
    // but failing here says why — and a 403 is not transient, so it would
    // otherwise burn the attempt budget on a misconfiguration.
    let bearer = "";
    try {
      bearer = await tokenFor();
    } catch (error) {
      logger.warn?.(`malwareScan: could not obtain an identity token (${String(error?.message || error).slice(0, 120)})`);
      return "error";
    }

    // Only what the scanner needs to find the object. Not the content type,
    // not a display name — the scanner never reads them, and a customer's
    // filename has no business in a second service's request logs.
    const payload = JSON.stringify({
      bucket: String(ref.bucket || ""),
      name: String(ref.name || ""),
      generation: String(ref.generation || "")
    });

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response = null;
      let networkError = null;
      try {
        response = await fetchImpl(route, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: payload,
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

module.exports = {
  createClamavScanner, verdictFromResponse, isTransient, backoffMs, scanRoute,
  createIdentityTokenSource, METADATA_IDENTITY_URL
};
