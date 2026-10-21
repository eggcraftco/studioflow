// GN-13 (22 Oct 2026) — the web copy of functions/orders/trackingCarriers.js: which carrier a
// tracking answer names, and where its page is. Same table, same rules (scripts/check-live-tracking.mjs
// runs the shared cases):
//   * a recognised carrier with an official page → that https page, the number URL-encoded;
//   * recognised but no page here (or detected by 17TRACK without a name) → 17TRACK's working page;
//   * no carrier → NO link (the card and the e-mail say "carrier not identified yet").
// The old fallback, https://www.17track.net/en/track-details?nums=…, answers 404 and is never opened.
//
// Pure: no Firebase import.

export type CarrierEntry = { key: string; label: string; courier: string | null; track17: number | null; hasPage: boolean };
export type TrackingLink = { url: string; carrierLabel: string; kind: "official" | "generic" | "none"; carrierKey: string };

const TRACKING_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,64}$/;

type Def = { label: string; courier: string | null; track17: number | null; url: ((n: string) => string) | null; aliases: string[] };

const CARRIERS: Record<string, Def> = {
  dhl_express: { label: "DHL Express", courier: "DHL", track17: 100001, url: n => `https://www.dhl.com/gb-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`, aliases: ["dhl express", "dhlexpress", "dhl express uk", "dhl express worldwide", "dhl worldwide express", "dhl express international", "express dhl", "mydhl", "dhl intl"] },
  dhl: { label: "DHL", courier: null, track17: null, url: n => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${n}&submit=1`, aliases: ["dhl", "dhl uk", "dhl global"] },
  dhl_parcel_uk: { label: "DHL Parcel UK", courier: null, track17: null, url: n => `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${n}&submit=1`, aliases: ["dhl parcel", "dhl parcel uk", "dhl ecommerce", "dhl ecommerce uk", "dhl ecommerce solutions", "dhl paket", "dhl parcel international"] },
  royal_mail: { label: "Royal Mail", courier: "Royal Mail", track17: 11031, url: n => `https://www.royalmail.com/track-your-item#/tracking-results/${n}`, aliases: ["royal mail", "royalmail", "royal mail group", "royal mail tracked", "royal mail tracked 24", "royal mail tracked 48", "royal mail special delivery", "royal mail international"] },
  parcelforce: { label: "Parcelforce", courier: null, track17: 11033, url: n => `https://www.parcelforce.com/track-trace?trackNumber=${n}`, aliases: ["parcelforce", "parcel force", "parcelforce worldwide", "parcelforce uk"] },
  ups: { label: "UPS", courier: "UPS", track17: 100002, url: n => `https://www.ups.com/track?tracknum=${n}`, aliases: ["ups", "ups uk", "united parcel service", "ups express", "ups standard"] },
  fedex: { label: "FedEx", courier: "FedEx", track17: 100003, url: n => `https://www.fedex.com/fedextrack/?trknbr=${n}`, aliases: ["fedex", "fed ex", "fedex express", "fedex uk", "fedex ground", "fedex international", "federal express"] },
  evri: { label: "Evri", courier: null, track17: null, url: n => `https://www.evri.com/track/parcel/${n}`, aliases: ["evri", "hermes", "hermes uk", "myhermes", "my hermes", "hermes parcelnet"] },
  dpd_uk: { label: "DPD", courier: null, track17: null, url: n => `https://track.dpd.co.uk/parcels/${n}`, aliases: ["dpd", "dpd uk", "dpd local", "dpdlocal", "dpd local uk"] },
  yodel: { label: "Yodel", courier: null, track17: null, url: null, aliases: ["yodel", "yodel uk", "yodel direct"] },
  usps: { label: "USPS", courier: null, track17: null, url: null, aliases: ["usps", "united states postal service", "us postal service"] },
  tnt: { label: "TNT", courier: null, track17: null, url: null, aliases: ["tnt", "tnt uk", "tnt express"] },
  gls: { label: "GLS", courier: null, track17: null, url: null, aliases: ["gls", "gls uk"] },
  amazon_shipping: { label: "Amazon Shipping", courier: null, track17: null, url: null, aliases: ["amazon shipping", "amazon logistics", "amzl"] }
};

const FOREIGN_MARKERS = new Set(["ireland", "ie", "germany", "de", "france", "fr", "netherlands", "nl", "usa", "us", "spain", "es", "italy", "poland", "pl", "belgium", "austria", "canada", "ca", "australia", "au", "china", "cn", "india", "turkey", "tr", "japan", "jp"]);
const NOT_A_CARRIER = new Set(["", "auto", "auto detect", "autodetect", "custom", "custom provider", "other", "none", "unknown", "n a", "na", "tracking", "courier", "carrier"]);

export function compactKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_INDEX = (() => {
  const index = new Map<string, string>();
  for (const [key, def] of Object.entries(CARRIERS)) {
    index.set(key.replace(/_/g, " "), key);
    index.set(compactKey(def.label), key);
    for (const alias of def.aliases) index.set(compactKey(alias), key);
  }
  return index;
})();

const CODE_INDEX = new Map<number, string>(Object.entries(CARRIERS).filter(([, d]) => d.track17).map(([k, d]) => [Number(d.track17), k]));

function entryFor(key: string): CarrierEntry | null {
  const def = CARRIERS[key];
  return def ? { key, label: def.label, courier: def.courier, track17: def.track17, hasPage: Boolean(def.url) } : null;
}

export function cleanNumber(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

export function isAutoDetect(value: unknown): boolean {
  return NOT_A_CARRIER.has(compactKey(value));
}

export function normalizeCarrier(value: unknown): CarrierEntry | null {
  const compact = compactKey(value);
  if (!compact || NOT_A_CARRIER.has(compact)) return null;
  const direct = ALIAS_INDEX.get(compact);
  if (direct) return entryFor(direct);
  const words = compact.split(" ");
  if (words.slice(1).some(word => FOREIGN_MARKERS.has(word))) return null;
  for (let n = words.length - 1; n >= 1; n -= 1) {
    const hit = ALIAS_INDEX.get(words.slice(0, n).join(" "));
    if (hit) return entryFor(hit);
  }
  return null;
}

export function carrierFromTrack17Code(code: unknown, name = ""): CarrierEntry | null {
  const number = Number(code);
  if (!Number.isFinite(number) || number <= 0) return null;
  const known = CODE_INDEX.get(number);
  if (known) return entryFor(known);
  const named = normalizeCarrier(name);
  if (named) return named;
  const label = String(name || "").trim();
  return { key: `track17:${number}`, label: label && !/^carrier #/i.test(label) ? label : "", courier: null, track17: number, hasPage: false };
}

export type CarrierCandidate = { carrier?: string; carrierCode?: string | number };

/** The first recognised carrier, most trusted first; a plain "DHL" is refined by a later, more specific DHL. */
export function resolveCarrier(candidates: CarrierCandidate[]): CarrierEntry | null {
  let found: CarrierEntry | null = null;
  for (const c of candidates) {
    const byName = normalizeCarrier(c.carrier);
    const byCode = c.carrierCode ? carrierFromTrack17Code(c.carrierCode, c.carrier) : null;
    const entry = (byName && byName.key === "dhl" && byCode && byCode.key.startsWith("dhl_") ? byCode : byName) || byCode;
    if (!entry) continue;
    if (!found) { found = entry; if (entry.key !== "dhl") return found; continue; }
    if (found.key === "dhl" && entry.key.startsWith("dhl_")) return entry;
  }
  return found;
}

export function trackingLink(entry: CarrierEntry | null, trackingNumber: unknown): TrackingLink {
  const number = cleanNumber(trackingNumber);
  if (!entry || !number || !TRACKING_NUMBER_PATTERN.test(number)) return { url: "", carrierLabel: entry?.label || "", kind: "none", carrierKey: entry?.key || "" };
  const def = CARRIERS[entry.key];
  const encoded = encodeURIComponent(number);
  if (def?.url) return { url: def.url(encoded), carrierLabel: entry.label, kind: "official", carrierKey: entry.key };
  return { url: `https://t.17track.net/en#nums=${encoded}`, carrierLabel: entry.label, kind: "generic", carrierKey: entry.key };
}

/** The 404 page the server used to store (and old app builds may still hold). */
export function isDeadTrackingUrl(value: unknown): boolean {
  return /^https?:\/\/(www\.)?17track\.net\/[a-z-]+\/track-details/i.test(String(value ?? ""));
}
