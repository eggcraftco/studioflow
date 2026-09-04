"use strict";

// The one door out: sanitized envelopes to the main project.
//
// Validated before sending — the Amazon side never emits what the main side
// would refuse — carried with our own OIDC identity token, and retried only on
// silence. A 4xx from the main project is an argument about the contract, not
// something to try again.

const { validateSafeEnvelope } = require("./envelope");

function createBridge({
  egress,
  bridgeUrl,
  identityToken,
  attempts = 3,
  timeoutMs = 20000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console
}) {
  if (!bridgeUrl) throw new Error("bridge: bridgeUrl is required");

  return async function send(envelope) {
    const { ok, violations } = validateSafeEnvelope(envelope);
    if (!ok) {
      // Paths only in the log; the values are what we are refusing to send.
      logger.error(`bridge: refusing to send an unsafe envelope (${violations.slice(0, 3).join("; ")})`);
      return { ok: false, status: 0, reason: "unsafe_envelope" };
    }
    const bearer = await identityToken();
    let lastReason = "never_attempted";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response = null;
      try {
        response = await egress.fetch(bridgeUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
          signal: controller.signal
        });
      } catch (error) {
        lastReason = String((error && error.name) === "AbortError" ? "timeout" : (error && error.message) || error).slice(0, 80);
      } finally {
        clearTimeout(timer);
      }
      if (response) {
        if (response.ok) return { ok: true, status: response.status, reason: "" };
        lastReason = `http_${response.status}`;
        if (response.status < 500 && response.status !== 429) break;   // the contract, not the weather
      }
      if (attempt < attempts) await sleep(500 * attempt);
    }
    logger.warn(`bridge: envelope not delivered (${lastReason})`);
    return { ok: false, status: 0, reason: lastReason };
  };
}

module.exports = { createBridge };
