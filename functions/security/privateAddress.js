"use strict";

// Is this address one we are willing to open a connection to?
//
// One implementation, three callers. It started as two: commerce/woo/client.js
// resolved a merchant's store host on every request and refused private
// answers, and commerce/woo/url.js carried its own copy of the IPv4 ranges. The
// receipt and inventory fetches resolved nothing at all, so a public hostname
// pointing at 169.254.169.254 walked straight through them. Rather than write a
// third copy of the ranges, both of those now call this and so does the
// caller-supplied-URL fetch in remoteFetch.js.
//
// The rule this exists to state, taken from the Woo client's own comment: it is
// EVERY answer that must be public, not the first. A host that returns one
// routable address and one loopback address is not safe, and which of them a
// connection picks is not ours to say.
//
// WHAT THIS TABLE DELIBERATELY DOES NOT COVER, so nobody reads its silence as an
// oversight. Some globally-registered, publicly-routable addresses are platform
// magic on the provider that owns them: Azure's wireserver/IMDS relay at
// 168.63.129.16, and Google's Private Google Access VIPs at 199.36.153.4/30 and
// 199.36.153.8/30. All of them are judged PUBLIC here and always have been.
//
// On this deployment none is a reach into anything: 168.63.129.16 is inert off
// Azure, and the PGA VIPs front authenticated Google Cloud APIs — this fetch
// sends no credential — and are routable only from inside a VPC, which this
// project has none of. The design already concedes that a public host the
// attacker owns can be connected to; these are the same concession with a
// well-known address.
//
// It is named here because it is an OPERATOR'S DECISION, not a defect: "block
// by IP range" will always trail whatever magic address a provider mints next,
// so the durable control against that class is an egress network policy on the
// runtime, not a longer literal table in this file. Adding rows here would buy
// portability to a platform this code does not run on. If these functions ever
// run on Azure, or ever gain a VPC connector, that decision has to be revisited
// and this comment is the reason it is a decision rather than an omission.
const dns = require("dns");

/** IPv4 ranges that are not a public destination, by first two octets. */
function isPrivateIPv4(address) {
  const parts = String(address).split(".");
  if (parts.length !== 4) return true;                              // not an IPv4 we understand: refuse
  const [a, b, c] = parts.map(Number);
  if (![a, b, c].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return true;
  return a === 0                                                    // "this network"
    || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)   // RFC1918
    || a === 127                                                    // loopback
    || (a === 100 && b >= 64 && b <= 127)                           // 100.64/10 carrier NAT
    || (a === 169 && b === 254)                                     // link-local, incl. the metadata service
    || (a === 192 && b === 0 && c === 0)                            // 192.0.0/24, incl. 192.0.0.192
    || (a === 192 && b === 0 && c === 2)                            // documentation
    || (a === 198 && (b === 18 || b === 19))                        // benchmarking
    || (a === 198 && b === 51 && c === 100)                         // documentation
    || (a === 203 && b === 0 && c === 113)                          // documentation
    || (a === 192 && b === 88 && c === 99)                          // 6to4 relay anycast
    || a >= 224;                                                    // multicast (224-239) and reserved (240-255)
}

/**
 * Expands an IPv6 address to its sixteen bytes, or null if it is not one.
 *
 * Written out rather than prefix-matched on the string, because the string
 * forms of one address are many — ::1, 0:0:0:0:0:0:0:1, ::0.0.0.1 and
 * 0000::0001 are all loopback, and a prefix test that catches "::1" catches
 * none of the others.
 */
function ipv6Bytes(input) {
  let text = String(input || "").trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);                        // fe80::1%eth0
  if (!text.includes(":")) return null;

  // A trailing dotted quad (::ffff:127.0.0.1) is two more groups.
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const quad = dotted[1].split(".").map(Number);
    if (!quad.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
    const hi = ((quad[0] << 8) | quad[1]).toString(16);
    const lo = ((quad[2] << 8) | quad[3]).toString(16);
    text = `${text.slice(0, dotted.index)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array(fill).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null;
    const value = parseInt(groups[i], 16);
    bytes[i * 2] = value >> 8;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function isPrivateIPv6(address) {
  const b = ipv6Bytes(address);
  if (!b) return true;                                              // unparseable: refuse
  const leadingZeros = (n) => b.slice(0, n).every((byte) => byte === 0);
  const embeddedV4 = (offset) => `${b[offset]}.${b[offset + 1]}.${b[offset + 2]}.${b[offset + 3]}`;

  // The IPv4 forms first, so a mapped public address stays public rather than
  // being swept up by the "not global unicast" rule below.
  if (leadingZeros(10) && b[10] === 0xff && b[11] === 0xff) return isPrivateIPv4(embeddedV4(12));   // ::ffff:a.b.c.d
  if (leadingZeros(12)) {
    // ::  and ::1 and the deprecated ::a.b.c.d
    if (b[12] === 0 && b[13] === 0 && b[14] === 0 && b[15] <= 1) return true;
    return isPrivateIPv4(embeddedV4(12));
  }
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return isPrivateIPv4(embeddedV4(12)); // 64:ff9b::/96 NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateIPv4(embeddedV4(2));                          // 2002::/16 6to4

  // Everything that is not global unicast (2000::/3) is special-purpose or
  // reserved: loopback, unspecified, unique-local fc00::/7, link-local
  // fe80::/10, the deprecated site-local fec0::/10, multicast ff00::/8, the
  // 100::/64 discard prefix. One test instead of seven.
  if ((b[0] & 0xe0) !== 0x20) return true;

  // Inside global unicast, the ranges that are still not a destination.
  if (b[0] === 0x20 && b[1] === 0x01) {
    if (b[2] === 0x0d && b[3] === 0xb8) return true;                // 2001:db8::/32 documentation
    if (b[2] === 0x00 && b[3] === 0x00) return true;                // 2001::/32 Teredo
    if (b[2] === 0x00 && (b[3] & 0xf0) === 0x10) return true;       // 2001:10::/28 ORCHID
    if (b[2] === 0x00 && (b[3] & 0xf0) === 0x20) return true;       // 2001:20::/28 ORCHIDv2
  }
  if (b[0] === 0x3f && b[1] === 0xfe) return true;                  // 3ffe::/16 6bone, returned
  // 3fff::/20 documentation, RFC 9637 (2024). The prefix is TWENTY bits, not
  // sixteen: the top four bits of the third byte belong to it, so
  // 3fff:0fff:… is the last documentation address and 3fff:1000:: is ordinary
  // allocatable space. Written this way rather than as `b[1] === 0xff` alone,
  // which would take a whole /16 of live global unicast with it.
  //
  // Here for completeness rather than because it was exploitable: documentation
  // space is routed nowhere and reaches no internal or metadata endpoint on
  // this runtime. But the lines above enumerate documentation ranges by name,
  // this one was simply younger than the table, and it was the one destination
  // in the whole hostile set that got as far as the socket seam.
  if (b[0] === 0x3f && b[1] === 0xff && (b[2] & 0xf0) === 0x00) return true;
  return false;
}

/** True when this address is not somewhere we will open a connection to. */
function isPrivateAddress(address) {
  const text = String(address || "").trim();
  if (!text) return true;
  return text.includes(":") ? isPrivateIPv6(text) : isPrivateIPv4(text);
}

/** A refusal that says which of the three things went wrong. */
class PrivateAddressError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "PrivateAddressError";
    this.reason = reason;                                           // empty_host | dns_failed | private_address
  }
}

/**
 * Resolves a hostname and refuses it unless EVERY answer is public.
 *
 * Returns the answers, because the caller needs them: validating an address and
 * then letting the connection resolve the name again is a check with a hole in
 * the middle — the second answer need not be the first. The addresses come back
 * so the connection can be pinned to one of them. See remoteFetch.js.
 *
 * Resolution is per call and never cached: a cache would reintroduce exactly
 * the staleness this exists to close (a store domain repointed at 10.x after
 * connect was the original Woo defect, WOO-003).
 *
 * dns.lookup is used rather than dns.resolve because lookup is what the
 * connection itself would use — it honours /etc/hosts and the system resolver,
 * so this checks the answer the socket would actually have got.
 */
async function resolvePublicAddresses(host, { resolve = (name) => dns.promises.lookup(name, { all: true }) } = {}) {
  const name = String(host || "").trim().toLowerCase();
  if (!name) throw new PrivateAddressError("empty_host", "No host to resolve.");
  let addresses;
  try {
    addresses = await resolve(name);
  } catch (error) {
    throw new PrivateAddressError("dns_failed", String(error?.message || error).slice(0, 80));
  }
  if (!Array.isArray(addresses) || !addresses.length) {
    throw new PrivateAddressError("dns_failed", "no address");
  }
  // Every answer, not the first.
  if (addresses.some((row) => isPrivateAddress(row && row.address))) {
    throw new PrivateAddressError("private_address", "That host resolves to a private address.");
  }
  return addresses.map((row) => ({ address: String(row.address), family: Number(row.family) || (String(row.address).includes(":") ? 6 : 4) }));
}

module.exports = {
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
  ipv6Bytes,
  PrivateAddressError,
  resolvePublicAddresses
};
