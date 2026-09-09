"use strict";

// The one way this codebase fetches a URL that a caller supplied.
//
// Two sinks take a URL from an MCP/assistant argument and fetch it:
// create_inventory_item's photo and attach_bank_receipt's receipt. Both wrote
// the same shape:
//
//     const source = /^https:\/\//i.test(u) ? u : nvAssertPublicHttpsUrl(u);
//
// which reads like a guard and is the opposite of one. Anything already
// https — every hostile input worth sending — took the raw branch and never
// met the guard; anything else met a guard whose first line rejects it for not
// being https. The guard could only ever throw. At attach_bank_receipt the two
// branches did not even carry the same variable: it validated `linkUrl` and
// fetched `chatFileUrl`.
//
// So the fix is not a better guard, it is one door. Everything below is
// arranged so that the URL that is validated is, necessarily, the URL that is
// fetched, and the address that is checked is, necessarily, the address that is
// connected to. There is no branch in which a caller's string reaches the
// network without passing through assertFetchableUrl, and no path on which the
// name is resolved a second time.
//
// Three layers, in order:
//   1. assertFetchableUrl     — the URL as written. Scheme allowlist, no
//      credentials, no odd ports, no private literals, no internal names.
//   2. resolvePublicAddresses — what the name resolves to, every answer.
//      security/privateAddress.js, shared with the WooCommerce client.
//   3. the pinned request     — connects to a validated address and to nothing
//      else, and refuses any 3xx rather than following it.
const https = require("https");
const { isPrivateAddress, resolvePublicAddresses, PrivateAddressError } = require("./privateAddress");

/**
 * The schemes a caller-supplied URL may use.
 *
 * A Set rather than a prefix test, because a prefix test is what failed: the
 * old `/^https:\/\//i` was both the protocol filter and the bypass, and one
 * redirect hop defeated it (an https origin 302s to http and undici follows
 * the downgrade — proven locally, §4.3 of the assessment).
 *
 * The set has ONE entry, not two, and that is deliberate. The operator's
 * instruction was "allow only http/https", but what the code permits today is
 * https alone — plain http never survived the prefix test on either sink. So
 * adding "http:" here would not be implementing the instruction, it would be
 * widening these two sinks to a cleartext scheme they have never accepted, and
 * calling the downgrade a fix. If some future caller genuinely needs http, it
 * gets its own allowlist passed in at the call site, with its own argument for
 * why — it does not get it by default and it does not get it silently.
 */
const ALLOWED_SCHEMES = Object.freeze(new Set(["https:"]));

/**
 * Ports a caller may name. "" is the URL parser's way of saying "the default
 * for this scheme" (443 for https). An explicit :443 is the same address, so
 * it is allowed; anything else is refused rather than fetched, because a
 * caller naming a port is naming a service, and the services worth naming from
 * inside a container are the ones this exists to keep away from.
 */
const ALLOWED_PORTS = Object.freeze(new Set(["", "443"]));

/** Hostnames that are never a public document host, whatever DNS would say. */
const BLOCKED_HOSTS = Object.freeze(new Set(["localhost", "metadata.google.internal", "metadata.goog"]));
const BLOCKED_SUFFIXES = Object.freeze([".localhost", ".internal", ".local", ".svc", ".cluster.local"]);

// Literal IPv4 in the four-dotted form. WHATWG `new URL()` has already
// normalised 2130706433, 0x7f000001, 0177.0.0.1 and 127.1 into this shape by
// the time we see the hostname, so the shorthand encodings are covered.
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// Node's `timeout` option is the socket's INACTIVITY timer: every byte received
// resets it. On its own it bounds nothing — a server that sends one byte every
// twenty seconds never trips it and holds the connection, the function instance
// and a buffer growing to DEFAULT_MAX_BYTES for as long as it cares to. That
// server is not an SSRF: the destination passed every check, so it is a public
// host the attacker owns, which this design correctly concedes it cannot stop
// from serving whatever it likes. What it must not be allowed to do is serve it
// forever on a runtime billed by the second.
//
// So there are two clocks, and they measure different things:
//   TIMEOUT  — silence. No byte for this long: the server has stopped talking.
//   DEADLINE — the whole request, talking or not. Nothing here takes 45s
//              honestly (15MB at 45s is 333 KB/s, which any document host
//              clears), and both entry points run under a 60s platform limit
//              with a Storage write still to do after this returns.
const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_DEADLINE_MS = 45000;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;   // both sinks cap at 15MB; this is the transport's own bound

/** A refusal that carries a machine-readable reason, so call sites can map it. */
class UnsafeUrlError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "UnsafeUrlError";
    this.reason = reason;
  }
}

/**
 * The network seam.
 *
 * Production never replaces either of these; the SSRF tests replace them so a
 * check can assert that a hostile input reached neither DNS nor a socket, which
 * is the property that matters — a request that is made and then discarded is
 * still a request. It lives here rather than as a parameter to safeRemoteFetch
 * so that the two production call sites cannot pass one by accident, and so a
 * test drives the real handler, the real validation, and the real ordering.
 */
const NETWORK = {
  resolve: null,        // null = the real system resolver, via privateAddress.js
  request: null         // null = pinnedHttpsRequest, below
};

/**
 * Validates a caller-supplied URL and returns the exact string to fetch.
 *
 * Fails closed on everything it does not positively recognise: an unparseable
 * URL, credentials embedded in it, a scheme outside the allowlist, a port
 * outside the allowlist, an IP literal in a private or reserved range, a
 * hostname on the blocked list, a single-label name.
 *
 * It returns a string rather than a boolean on purpose — the caller cannot
 * fetch "the original" and validate "the clean one", because it only ever has
 * the one value.
 */
function assertFetchableUrl(rawUrl, { allowedSchemes = ALLOWED_SCHEMES, allowedPorts = ALLOWED_PORTS } = {}) {
  const raw = String(rawUrl == null ? "" : rawUrl).trim();
  if (!raw) throw new UnsafeUrlError("empty", "No link was given.");

  let url;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError("unparseable", "That is not a valid URL."); }

  if (!allowedSchemes.has(url.protocol)) {
    throw new UnsafeUrlError("scheme", "The link must be an https link.");
  }
  // A URL may not carry a credential. https://metadata.google.internal@evil/
  // reads to a human as the metadata host and resolves to evil; refusing the
  // form removes the ambiguity rather than trying to out-parse it.
  if (url.username || url.password) {
    throw new UnsafeUrlError("credentials", "The link must not contain a username or password.");
  }
  if (!allowedPorts.has(url.port)) {
    throw new UnsafeUrlError("port", "The link must not name a port.");
  }

  // THE ROOT DOT IS PART OF THE NAME, AND NOT PART OF THE SPELLINGS BELOW.
  // `metadata.google.internal.` and `metadata.google.internal` are one name to
  // every resolver, but all three tests that follow are spelling tests and one
  // trailing dot defeated each of them: the dotted form is not the Set's
  // member, it ends in ".internal." rather than ".internal", and even a single
  // label stops being single because "internal." contains a dot. Measured
  // against this validator before the fix — `https://metadata.google.internal./`,
  // `https://localhost./admin`, `https://foo.local./` and `https://internal./`
  // were all ACCEPTED, while their undotted spellings were refused.
  //
  // It was not exploitable: resolvers honour the dot, so layer 2 resolved
  // 169.254.169.254 and refused before a socket. But that is the point — the
  // comment above BLOCKED_HOSTS claims these names never pass "whatever DNS
  // would say", and for the dotted spelling that was false. A layer that only
  // holds because the next one does is not defence in depth.
  //
  // So strip the dots once, here, and carry the stripped name forward rather
  // than checking one spelling and fetching another — which is the exact defect
  // shape this whole file exists to make unexpressible. Downstream this also
  // puts the undotted name in SNI, which is what certificates are issued for.
  // All trailing dots, not one: `new URL()` keeps "example.com.." verbatim.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) throw new UnsafeUrlError("host", "The link has no host.");
  if (host !== url.hostname) url.hostname = host;
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new UnsafeUrlError("blocked_host", "The link must point to a public https address.");
  }

  // An address written out in the URL is judged here, by the same table that
  // judges a DNS answer — there is nothing to resolve, so this is its whole
  // check.
  const literal = host.startsWith("[") ? host.slice(1, -1) : host;
  if (host.startsWith("[") || literal.includes(":") || IPV4.test(literal)) {
    if (isPrivateAddress(literal)) throw new UnsafeUrlError("private_ip", "The link must point to a public https address.");
  } else if (!host.includes(".")) {
    // A single label is a container- or network-internal name (a sidecar, a
    // Docker service alias, a short cluster name), never a document host on the
    // internet. Note the limit of judging by spelling: a two-label internal
    // name such as kubernetes.default passes here, because refusing it would
    // mean inventing a TLD allowlist. That is what layer 2 is for — the name is
    // resolved and the answer is judged.
    throw new UnsafeUrlError("not_a_domain", "The link must point to a public https address.");
  }

  return url.toString();
}

/**
 * One request, to one address that has already been checked.
 *
 * HOW THE TOCTOU WINDOW IS CLOSED, stated plainly because it is the point of
 * this function: THE ADDRESS IS PINNED. The name is resolved once, every answer
 * is checked, and then node:https is handed a `lookup` that ignores the
 * hostname and returns the address that was checked. The socket therefore
 * connects to a validated address and to no other — there is no second
 * resolution for a rebinding attacker to answer differently.
 *
 * The pin is only true for every request if every request opens its own
 * connection, and by default it would not be. On Node 22 `http.globalAgent` has
 * `keepAlive: true`, and the agent's socket pool is keyed on host and port —
 * not on the `lookup` we pass. Measured here: three requests to one hostname
 * through the global agent call `lookup` ONCE, because requests two and three
 * reuse the socket that request one opened. That is not an SSRF hole (each
 * request still resolves and re-checks before any byte is sent, so a host that
 * has turned private is refused outright), but it would make the sentence above
 * false — the connection would be to an address validated for an EARLIER
 * request. `agent: false` gives each request its own agent and therefore its
 * own connection, so the pin is consulted every time and the address checked
 * for THIS request is the address this request connects to. These are one-off
 * document fetches, so there is no reuse worth keeping.
 *
 * The hostname is still what TLS sees: it goes out as SNI (`servername`) and
 * the certificate is verified against it. Pinning the address does not weaken
 * certificate checking, and must not be changed to.
 *
 * `node:https` rather than `fetch`: undici, which backs global fetch on Node
 * 22, performs its own dns.lookup inside the connector and offers no way to pin
 * it without an `undici.Agent` — and undici is not a dependency of this
 * package. Taking a new dependency to close this was the larger change; using
 * the built-in client, which has accepted a `lookup` option for years, was the
 * smaller one.
 *
 * WHAT RESIDUAL REMAINS, honestly:
 *   - A host with several public addresses is contacted at one of them. Every
 *     answer was checked, so whichever is used is a checked one — but the
 *     others are not tried if the first refuses the connection.
 *   - The check is on the address, not on what the machine there does. A public
 *     host that itself proxies to something internal is invisible to any DNS
 *     check, at this layer or any other. Refusing 3xx removes the redirect form
 *     of that; a server-side proxy is out of reach by construction.
 *   - We trust the system resolver. If it is answering with an attacker's
 *     records, pinning faithfully preserves the wrong answer. That is the same
 *     trust every other outbound client in this tree places in it.
 *   - The pin covers this connection, not the process: nothing here stops a
 *     future call site from calling https.request itself. The structural check
 *     `neither sink opens a connection any other way` in
 *     test/qa/ssrf-remote-fetch.test.js watches for that AT THE TWO SINKS — it
 *     reads each of those functions whole, signature to closing brace, and
 *     refuses fetch(), globalThis.fetch(), https.request()/net.connect()/
 *     tls.connect(), and any quoting of redirect: "follow". It does not, and
 *     cannot, police the twenty-odd other outbound clients in index.js, which
 *     legitimately call fetch against constant hosts. A THIRD sink taking a
 *     caller's URL would be outside its scope until it is given a row in that
 *     check's SINKS table.
 *   - Between the lookup returning and the SYN going out there is no gap we
 *     control, because there is no second name resolution in that gap at all —
 *     the address is a literal by then. What remains is the kernel's routing of
 *     that literal, which is not something an attacker reaches through DNS.
 *   - A validated destination can still misbehave once connected. Two bounds
 *     answer that, and neither is the socket timeout: maxBytes for how much it
 *     may send, deadlineMs for how long it may take. See the note on the two
 *     clocks above DEFAULT_TIMEOUT_MS.
 */
function pinnedHttpsRequest(url, {
  accept = "*/*",
  address,
  family,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  deadlineMs = DEFAULT_DEADLINE_MS,
  maxBytes = DEFAULT_MAX_BYTES
} = {}) {
  return new Promise((resolve, reject) => {
    // One settlement, and the deadline timer is cleared on whichever comes
    // first. Without the guard the deadline would reject a promise the body
    // handler had already resolved, and a ref'd timer would hold the process
    // open for 45s after every successful fetch.
    let deadline = null;
    let settled = false;
    const settle = (finish) => (value) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      finish(value);
    };
    const succeed = settle(resolve);
    const fail = settle(reject);

    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      servername: url.hostname,                 // SNI and certificate identity stay the NAME
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { Accept: accept, "Accept-Encoding": "identity" },
      timeout: timeoutMs,
      // One connection per request, so THE PIN below is consulted every time
      // rather than once per pooled socket. See the note above: this is what
      // makes "connects to a validated address and no other" true of every
      // request instead of only the first to each host.
      agent: false,
      // THE PIN. The hostname argument is deliberately ignored: it has already
      // been resolved and every answer checked, and resolving it again here is
      // precisely the window this closes.
      lookup: (_hostname, options, callback) => {
        if (options && options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      }
    }, (response) => {
      const status = response.statusCode || 0;
      const headers = {
        get: (name) => {
          const value = response.headers[String(name).toLowerCase()];
          if (value === undefined) return null;
          return Array.isArray(value) ? value.join(", ") : value;
        }
      };

      // A redirect's body is never read and the Location is never followed.
      if (status >= 300 && status < 400) {
        response.destroy();
        succeed({ ok: false, status, headers, arrayBuffer: async () => { throw new UnsafeUrlError("redirected", "A redirect has no body to read."); } });
        return;
      }

      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy();
          fail(new UnsafeUrlError("too_large", "That document is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        succeed({
          ok: status >= 200 && status < 300,
          status,
          headers,
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
        });
      });
      response.on("error", fail);
    });

    // Silence, and then the whole request. The second is not a duplicate of the
    // first: a drip-feed resets `timeout` on every byte and would otherwise run
    // until the platform killed the invocation.
    request.on("timeout", () => request.destroy(new Error("the server did not answer in time")));
    request.on("error", fail);
    // `!settled` because a caller may have already been answered by now (a test
    // transport that calls back synchronously); an uncleared timer would hold
    // the event loop open for the full deadline with nothing left to time.
    if (deadlineMs > 0 && !settled) {
      deadline = setTimeout(() => {
        // Settle first, then destroy: destroying raises an "error" of its own,
        // and the caller must be told the reason rather than the symptom.
        fail(new UnsafeUrlError("too_slow", "That server took too long to send the document."));
        request.destroy();
      }, deadlineMs);
    }
    request.end();
  });
}

/**
 * Fetches a caller-supplied URL, or refuses to.
 *
 * Redirects are DISABLED, not capped: node:https does not follow them, and any
 * 3xx becomes a refusal here. This is the point of the whole change. Following
 * a redirect hands the choice of final address to the remote server, after
 * every check on the caller's URL has already passed — so a guard that follows
 * redirects is not a guard, it is a suggestion.
 *
 * IF REDIRECTS ARE EVER RE-ENABLED, this is the only supported way, and none of
 * it is optional: loop HERE, with a hop cap, and for each Location run the full
 * ladder again — assertFetchableUrl on the absolute URL resolved against the
 * hop it came from, then resolvePublicAddresses on that host, then a pinned
 * request to one of THOSE addresses. Every hop revalidated by this same
 * function, with no shortcut for "same host" and no reuse of the previous pin.
 * Handling a Location anywhere else, or setting a client to follow, skips
 * layers 1 and 2 for every hop after the first and reopens what this closed.
 */
async function safeRemoteFetch(rawUrl, {
  accept = "*/*",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  deadlineMs = DEFAULT_DEADLINE_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  allowedSchemes = ALLOWED_SCHEMES,
  allowedPorts = ALLOWED_PORTS
} = {}) {
  // Layer 1: the URL as written. What gets fetched is the value validation
  // returned, not the value the caller passed in — same string, no branch.
  const target = assertFetchableUrl(rawUrl, { allowedSchemes, allowedPorts });
  const url = new URL(target);

  // Layer 2: what the name resolves to, every answer. An IP literal was already
  // judged by the same table in layer 1, and has nothing to resolve.
  const bare = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  const isLiteral = bare.includes(":") || IPV4.test(bare);
  let pinned = { address: bare, family: bare.includes(":") ? 6 : 4 };
  if (!isLiteral) {
    let addresses;
    try {
      addresses = await resolvePublicAddresses(url.hostname, NETWORK.resolve ? { resolve: NETWORK.resolve } : {});
    } catch (error) {
      if (!(error instanceof PrivateAddressError)) throw error;
      throw error.reason === "dns_failed"
        ? new UnsafeUrlError("dns_failed", "That link's host could not be resolved.")
        : new UnsafeUrlError("private_address", "The link must point to a public https address.");
    }
    pinned = addresses[0];
  }

  // Layer 3: connect to that address, and to nothing else.
  const send = NETWORK.request || pinnedHttpsRequest;
  const response = await send(url, { accept, address: pinned.address, family: pinned.family, timeoutMs, deadlineMs, maxBytes });

  if (response && response.status >= 300 && response.status < 400) {
    throw new UnsafeUrlError("redirected", "That link redirects elsewhere; pass the direct link to the file.");
  }
  return response;
}

module.exports = {
  ALLOWED_SCHEMES,
  ALLOWED_PORTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_DEADLINE_MS,
  UnsafeUrlError,
  assertFetchableUrl,
  safeRemoteFetch,
  pinnedHttpsRequest,
  NETWORK
};
