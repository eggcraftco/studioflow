"use strict";

// Every outbound request in this codebase goes through here, and nowhere else.
//
// The VPC firewall allows TCP/443 to anywhere, because Amazon's endpoints
// resolve to addresses that change and pinning them would break the connector
// without adding anything over a hostname check. So the destination control is
// this file: a request to a host that is not on the list is refused before a
// connection is opened, whatever bug or dependency asked for it. The list is
// short and explicit — the regional SP-API hosts, Login with Amazon, the one
// bridge endpoint in the main project, and the metadata server that hands out
// identity tokens.
//
// Every request is logged with its host, method, status and duration — never
// its path (order ids live there) and never a header (tokens live there). That
// line, together with VPC Flow Logs and Cloud NAT logging, is the
// "destination/connection logging" the design promises; this is the layer that
// knows the hostname.
//
// Pure apart from the fetch and logger handed in.

const AMAZON_HOSTS = Object.freeze([
  "sellingpartnerapi-eu.amazon.com",
  "sellingpartnerapi-na.amazon.com",
  "sellingpartnerapi-fe.amazon.com",
  "api.amazon.com"
]);

const GOOGLE_INTERNAL_HOSTS = Object.freeze(["metadata.google.internal", "169.254.169.254"]);

class EgressRefused extends Error {
  constructor(host) {
    super(`egress_refused: ${host}`);
    this.name = "EgressRefused";
    this.host = host;
    this.errorClass = "permission";
  }
}

/** Hostnames from a list of URLs or hostnames; lower-cased, no ports, no blanks. */
function hostnamesOf(entries = []) {
  const out = new Set();
  for (const entry of entries) {
    const text = String(entry || "").trim();
    if (!text) continue;
    try {
      out.add(new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase());
    } catch {
      // Not a URL and not a hostname: ignored, never allowed.
    }
  }
  return out;
}

/**
 * Builds the guarded fetch.
 *
 * `extraHosts` is where the bridge endpoint's host is added from configuration
 * (the main project's ingest URL). Nothing is ever added at request time.
 */
function createEgress({
  fetchImpl = globalThis.fetch,
  extraHosts = [],
  logger = console,
  now = () => Date.now()
} = {}) {
  const allowed = new Set([...AMAZON_HOSTS, ...GOOGLE_INTERNAL_HOSTS, ...hostnamesOf(extraHosts)]);

  function hostOf(url) {
    try { return new URL(String(url)).hostname.toLowerCase(); } catch { return ""; }
  }

  function isAllowed(url) {
    const host = hostOf(url);
    return Boolean(host) && allowed.has(host);
  }

  async function guardedFetch(url, init = {}) {
    const host = hostOf(url);
    const method = String((init && init.method) || "GET").toUpperCase();
    if (!host || !allowed.has(host)) {
      logger.error?.(`egress refused host=${host || "(unparseable)"} method=${method}`);
      throw new EgressRefused(host || "(unparseable)");
    }
    // The scheme is not negotiable either: the firewall only lets 443 out, and
    // a plaintext request to an allowed host would fail there — noisily, and
    // after the fact. Refuse it here, before.
    if (!/^https:/i.test(String(url))) {
      logger.error?.(`egress refused host=${host} method=${method} reason=not_https`);
      throw new EgressRefused(host);
    }
    const startedAt = now();
    try {
      const response = await fetchImpl(url, init);
      logger.log?.(`egress host=${host} method=${method} status=${response && response.status} ms=${now() - startedAt}`);
      return response;
    } catch (error) {
      logger.warn?.(`egress host=${host} method=${method} status=network_error ms=${now() - startedAt} ` +
        `reason=${String((error && error.name) || "error").slice(0, 40)}`);
      throw error;
    }
  }

  return { fetch: guardedFetch, isAllowed, allowedHosts: () => [...allowed].sort() };
}

module.exports = { createEgress, EgressRefused, AMAZON_HOSTS, GOOGLE_INTERNAL_HOSTS, hostnamesOf };
