"use strict";

// Xero webhooks, as documented on 3 Sep 2026 (XR §14):
//   header   x-xero-signature = base64( HMAC-SHA256( webhook key, raw body ) )
//   body     { events:[{ resourceUrl, resourceId, eventDateUtc, eventType:"CREATE|UPDATE",
//              eventCategory:"CONTACT|INVOICE|CREDITNOTE|OVERPAYMENT|PREPAYMENT|SUBSCRIPTION",
//              tenantId, tenantType }], firstEventSequence, lastEventSequence, entropy }
//   intent to receive: Xero posts correctly and incorrectly signed empty payloads;
//   the endpoint must answer 200 to the correct ones and 401 to the wrong ones,
//   within 5 seconds, without cookies. Failed deliveries are retried for 24 hours,
//   then the subscription is disabled and its events are kept for 31 days.
// Nothing else has a webhook (payments, bank transactions, items, accounts):
// those stay on If-Modified-Since reconciliation, never assumed (XR §14.1).

const crypto = require("crypto");

const CATEGORY_ENTITIES = Object.freeze({
  CONTACT: "Contact", INVOICE: "Invoice", CREDITNOTE: "CreditNote", OVERPAYMENT: "Overpayment", PREPAYMENT: "Prepayment", SUBSCRIPTION: "Subscription"
});
const SUBSCRIBED_ENTITIES = Object.freeze(["Contact", "Invoice", "CreditNote", "Overpayment", "Prepayment"]);
const OPERATIONS = Object.freeze({ CREATE: "Create", UPDATE: "Update" });

function verifySignature({ rawBody, header, key }) {
  const secret = String(key || "");
  const given = String(header || "").trim();
  if (!secret || !given) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function derivedEventId(parts) {
  return `derived_${crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32)}`;
}

function parseNotifications(rawBody) {
  let json = null;
  try { json = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "")); } catch { json = null; }
  if (!json || typeof json !== "object" || !Array.isArray(json.events)) return { format: "unknown", events: [], intentToReceive: false };
  const events = [];
  for (const item of json.events) {
    if (!item || typeof item !== "object") continue;
    const category = String(item.eventCategory || "").toUpperCase();
    const entity = CATEGORY_ENTITIES[category] || (category ? category.charAt(0) + category.slice(1).toLowerCase() : "");
    const type = String(item.eventType || "").toUpperCase();
    const tenantId = String(item.tenantId || "");
    const externalId = String(item.resourceId || "");
    const occurredAt = String(item.eventDateUtc || "");
    if (!tenantId || !externalId || !entity) continue;
    events.push({
      eventId: derivedEventId([tenantId, entity, externalId, type, occurredAt]),
      realmId: tenantId,
      tenantType: String(item.tenantType || ""),
      entity,
      externalId,
      operation: OPERATIONS[type] || (type ? type.charAt(0) + type.slice(1).toLowerCase() : ""),
      occurredAt,
      resourceUrl: String(item.resourceUrl || ""),
      format: "xero_v1",
      data: {}
    });
  }
  return {
    format: "xero_v1",
    events,
    intentToReceive: events.length === 0,
    firstEventSequence: Number(json.firstEventSequence) || 0,
    lastEventSequence: Number(json.lastEventSequence) || 0
  };
}

module.exports = { CATEGORY_ENTITIES, SUBSCRIBED_ENTITIES, OPERATIONS, verifySignature, parseNotifications, derivedEventId };
