"use strict";

// QuickBooks Online webhooks, as documented on 2 Sep 2026:
//   header  intuit-signature = base64( HMAC-SHA256( verifier_token, raw body ) )
//   body    a CloudEvents ARRAY —
//           [{ specversion:"1.0", id, source, type:"qbo.<entity>.<event>.v1", datacontenttype,
//              time, intuitentityid, intuitaccountid (= realmId), data? }]
//           ("data" carries e.g. deletedid on a merge, and is absent on plain updates)
// The older shape { eventNotifications:[{ realmId, dataChangeEvent:{ entities:[{ name,id,operation,lastUpdated }] } }] }
// is still accepted: the parser is not locked to one payload (§14.1), and any
// shape it cannot read is kept in the inbox as "unparsed" rather than dropped.

const crypto = require("crypto");

// Entities the app subscribes to in the developer console (Development and
// Production are configured separately there). Keep in step with the console.
const SUBSCRIBED_ENTITIES = Object.freeze([
  "Account", "TaxCode", "TaxRate", "Customer", "Vendor", "Item", "Invoice", "Payment", "SalesReceipt", "CreditMemo",
  "RefundReceipt", "Bill", "BillPayment", "Purchase", "VendorCredit", "JournalEntry", "Estimate", "Deposit", "Transfer",
  "Preferences", "CompanyInfo"
]);

const ENTITY_NAMES = new Map(SUBSCRIBED_ENTITIES.concat(["PurchaseOrder", "TimeActivity", "Class", "Department", "Term", "PaymentMethod", "Employee"]).map((name) => [name.toLowerCase(), name]));

const OPERATIONS = Object.freeze({ created: "Create", updated: "Update", deleted: "Delete", merged: "Merge", voided: "Void", emailed: "Emailed" });

function verifySignature({ rawBody, header, verifier }) {
  const key = String(verifier || "");
  const given = String(header || "").trim();
  if (!key || !given) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const expected = crypto.createHmac("sha256", key).update(body).digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function canonicalEntity(name) {
  const lower = String(name || "").trim().toLowerCase();
  if (!lower) return "";
  if (ENTITY_NAMES.has(lower)) return ENTITY_NAMES.get(lower);
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function canonicalOperation(op) {
  const lower = String(op || "").trim().toLowerCase();
  if (OPERATIONS[lower]) return OPERATIONS[lower];
  const known = Object.values(OPERATIONS).find((value) => value.toLowerCase() === lower);
  return known || (lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : "");
}

function derivedEventId(parts) {
  return `derived_${crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32)}`;
}

function cloudEvent(item) {
  const type = String(item.type || "");
  const segments = type.split(".");
  // qbo.<entity>.<event>.v1
  const entity = canonicalEntity(segments.length >= 3 ? segments[1] : "");
  const operation = canonicalOperation(segments.length >= 3 ? segments[2] : "");
  const realmId = String(item.intuitaccountid || item.realmId || "");
  const externalId = String(item.intuitentityid || item.entityId || "");
  if (!realmId || !entity || !externalId) return null;
  return {
    eventId: String(item.id || "") || derivedEventId([realmId, entity, externalId, operation, String(item.time || "")]),
    realmId,
    entity,
    externalId,
    operation,
    occurredAt: String(item.time || ""),
    data: item.data && typeof item.data === "object" ? item.data : {},
    format: "cloudevents"
  };
}

function legacyEvents(body) {
  const notifications = Array.isArray(body?.eventNotifications) ? body.eventNotifications : [];
  const events = [];
  for (const notification of notifications) {
    const realmId = String(notification?.realmId || "");
    const entities = Array.isArray(notification?.dataChangeEvent?.entities) ? notification.dataChangeEvent.entities : [];
    for (const raw of entities) {
      const entity = canonicalEntity(raw?.name);
      const externalId = String(raw?.id || "");
      const operation = canonicalOperation(raw?.operation);
      if (!realmId || !entity || !externalId) continue;
      const occurredAt = String(raw?.lastUpdated || "");
      events.push({
        eventId: derivedEventId([realmId, entity, externalId, operation, occurredAt]),
        realmId, entity, externalId, operation, occurredAt,
        data: raw?.deletedId ? { deletedid: String(raw.deletedId) } : {},
        format: "legacy"
      });
    }
  }
  return events;
}

// → { format: "cloudevents" | "legacy" | "unknown", events: [...] }
function parseNotifications(body) {
  let parsed = body;
  if (typeof body === "string") {
    try { parsed = JSON.parse(body); } catch { return { format: "unknown", events: [] }; }
  }
  if (Buffer.isBuffer(parsed)) {
    try { parsed = JSON.parse(parsed.toString("utf8")); } catch { return { format: "unknown", events: [] }; }
  }
  if (Array.isArray(parsed)) {
    const events = parsed.map(cloudEvent).filter(Boolean);
    return { format: events.length || parsed.length === 0 ? "cloudevents" : "unknown", events };
  }
  if (parsed && typeof parsed === "object") {
    if (parsed.specversion || parsed.intuitaccountid) {
      const one = cloudEvent(parsed);
      return { format: one ? "cloudevents" : "unknown", events: one ? [one] : [] };
    }
    if (Array.isArray(parsed.eventNotifications)) return { format: "legacy", events: legacyEvents(parsed) };
    // A CloudEvents batch wrapped in an envelope key we have not seen yet.
    const nested = Object.values(parsed).find((value) => Array.isArray(value) && value.some((item) => item && item.specversion));
    if (nested) {
      const events = nested.map(cloudEvent).filter(Boolean);
      return { format: events.length ? "cloudevents" : "unknown", events };
    }
  }
  return { format: "unknown", events: [] };
}

module.exports = { SUBSCRIBED_ENTITIES, verifySignature, parseNotifications, canonicalEntity, canonicalOperation };
