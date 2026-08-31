// Which fields of an integration order belong to the shop, and how a resync
// writes them without trampling the studio.
//
// This lives in its own module for one reason: the Etsy sync tests used to
// carry a hand-written COPY of integrationOrderUpdate, kept honest by a regex
// that scraped index.js. The copy drifted anyway, and a test written against
// the copy is what let a real bug through review. Both sides now import the
// same function, so there is nothing left to drift.
//
// A redelivery of the same order used to write the whole mapped object back with
// merge:true. Every field the mapper produces is unconditionally present, so a
// shop that resends an order — Woo retries, a Shopify update, a Zapier replay —
// silently reset the studio's own work: designStatus and status back to
// "Not Yet", the tracking number and courier blanked, the delivery time reset.
// The shop owns the money and the customer; the studio owns the workflow.
const INTEGRATION_SHOP_OWNED_FIELDS = new Set([
  "customerName",
  "designName",
  "designLink",
  "emailAddress",
  "whatsappNumber",
  "instagramUsername",
  "notes",
  "paidAmount",
  "remainingAmount",
  "orderValue",
  "lineItems",
  "payments",
  "deliveryCost",
  "taxAmount",
  "taxRate",
  "shippingName",
  "shippingStreetAddress",
  "shippingCity",
  "shippingPostalCode",
  "shippingCountry",
  "shippingPhone",
  "customFields",
  "companyId",
  "updatedAt",
  "source"
]);

// What to write into `notes` when a shop sends an order we already have, or
// null to leave the studio's own text alone.
//
// The shop owns `notes` because it carries the buyer's own words. It does not
// own the absence of them, and it does not own them twice.
//
//   * Silence is not an instruction. Most receipts have no note at all — no
//     personalisation, no buyer note, no gift message — and writing that empty
//     string over the studio's notes on every resync erases work the shop never
//     had a claim to.
//   * A note already delivered is not news. The buyer says "engrave AL inside
//     the band" once. The order then syncs again — shipped, repriced, a webhook
//     replayed — and the same sentence arrives with nothing new in it. Writing
//     it again cannot inform anyone, and it destroys whatever the bench wrote
//     underneath it in the meantime. This is the case that actually bites: it
//     needs no unusual data, only an order somebody worked on.
//   * A note that genuinely changed IS news, and the studio must see it. So it
//     is appended, not substituted. Nothing the studio typed is ever lost to
//     make room for it.
function mergeShopNote(incoming, stored) {
  const note = String(incoming || "").trim();
  if (!note) return null;
  const current = String(stored == null ? "" : stored).trim();
  if (!current) return note;
  if (current.includes(note)) return null;
  return `${current}\n\n${note}`;
}

// `existingOrder` is the order as it stands before this sync — the studio's
// side of it. Callers on the update path must pass it; without it there is no
// way to tell a buyer's new words from their old ones, and the safe reading of
// "I don't know" is to not overwrite.
function integrationOrderUpdate(mappedOrder, isNew, existingOrder = null) {
  if (isNew) return mappedOrder;
  const patch = {};
  for (const [key, value] of Object.entries(mappedOrder)) {
    if (!INTEGRATION_SHOP_OWNED_FIELDS.has(key)) continue;
    if (key === "notes") {
      const merged = mergeShopNote(value, existingOrder ? existingOrder.notes : "");
      if (merged === null) continue;
      patch.notes = merged;
      continue;
    }
    patch[key] = value;
  }
  return patch;
}

module.exports = { INTEGRATION_SHOP_OWNED_FIELDS, mergeShopNote, integrationOrderUpdate };
