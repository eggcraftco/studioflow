// The Etsy adapter: a receipt from the v3 API → the canonical envelope.
// Etsy's money is {amount, divisor, currency_code}, its times are seconds,
// its "note" is three things (personalisation, buyer note, gift message) that
// the live path folds into one — the same fold is kept here so a shadow
// comparison of `notes` is about data, not formatting.
const { buildEnvelope } = require("../envelope");
const { toDecimalString, sumDecimal } = require("../money");

const text = (value, max = 500) => (value === undefined || value === null ? "" : String(value).trim().slice(0, max));
const secondsToIso = (seconds) => { const n = Number(seconds); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null; };

function splitVariations(variations) {
  const personalization = []; const options = [];
  for (const row of Array.isArray(variations) ? variations : []) {
    if (!row || typeof row !== "object") continue;
    const name = text(row.formatted_name, 120); const value = text(row.formatted_value, 1000);
    if (!value) continue;
    if (row.question_id !== null && row.question_id !== undefined) personalization.push({ name, value }); else options.push({ name, value });
  }
  return { personalization, options };
}

function transactionLabel(transaction) {
  const title = text(transaction?.title, 200);
  const { options } = splitVariations(transaction?.variations);
  if (!options.length) return title;
  return text(`${title} (${options.map((o) => (o.name ? `${o.name}: ${o.value}` : o.value)).join(", ")})`, 300);
}

function moneyOf(value) { return value && typeof value === "object" ? value : null; }

/**
 * @param receipt  Etsy v3 receipt (with transactions, shipments, refunds)
 * @param ctx      { connectionId, shopId, shopName, shopCurrency, eventOrigin, rawSnapshotRef }
 */
function normalizeEtsyReceipt(receipt, ctx = {}) {
  const receiptId = text(receipt?.receipt_id, 40);
  const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
  const status = text(receipt?.status, 40).toLowerCase();
  const isCancelled = status === "canceled" || status === "cancelled";
  const refundsRaw = Array.isArray(receipt?.refunds) ? receipt.refunds : [];
  const isRefunded = status.includes("refund") || refundsRaw.length > 0;
  const isPaid = receipt?.is_paid === true;
  const grand = moneyOf(receipt?.grandtotal); const subtotal = moneyOf(receipt?.subtotal);
  const currency = text(grand?.currency_code || subtotal?.currency_code || ctx.shopCurrency, 8).toUpperCase() || null;
  const shopCurrency = text(ctx.shopCurrency, 8).toUpperCase();
  const reasons = [];
  if (shopCurrency && currency && currency !== shopCurrency) reasons.push("currency_mismatch");
  if (!transactions.length) reasons.push("no_line_items");
  if (!text(receipt?.buyer_user_id, 40)) reasons.push("no_buyer_id");
  if (!receiptId) reasons.push("missing_external_id");

  const personalizationLines = []; const lineItems = [];
  for (const transaction of transactions) {
    const { personalization } = splitVariations(transaction?.variations);
    for (const entry of personalization) personalizationLines.push(entry.name ? `${entry.name}: ${entry.value}` : entry.value);
    const quantity = Math.max(1, Math.round(Number(transaction?.quantity) || 1));
    const unit = toDecimalString(transaction?.price);
    lineItems.push({
      external_line_id: text(transaction?.transaction_id, 40) || null,
      sku: text(transaction?.sku, 80) || null,
      title: transactionLabel(transaction) || "Product",
      quantity,
      unit_price: unit,
      line_total: unit === null ? null : Number(unit) * quantity,
      product_external_id: text(transaction?.listing_id, 40) || null,
      properties: personalization
    });
  }
  const buyerNote = text(receipt?.message_from_buyer, 2000);
  const giftMessage = receipt?.is_gift ? text(receipt?.gift_message, 1000) : "";
  const noteParts = [];
  if (personalizationLines.length) noteParts.push(`Personalisation — ${personalizationLines.join(" | ")}`);
  if (buyerNote) noteParts.push(`Buyer note — ${buyerNote}`);
  if (giftMessage) noteParts.push(`Gift message — ${giftMessage}`);

  const shipDates = transactions.map((t) => Number(t?.expected_ship_date)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const address = {
    name: text(receipt?.name, 200),
    street: [text(receipt?.first_line, 200), text(receipt?.second_line, 200)].filter(Boolean).join(", "),
    city: text(receipt?.city, 120), state: text(receipt?.state, 120), postalCode: text(receipt?.zip, 40), country: text(receipt?.country_iso, 8), phone: ""
  };
  const createdAt = secondsToIso(receipt?.create_timestamp ?? receipt?.created_timestamp);
  const updatedAt = secondsToIso(receipt?.update_timestamp ?? receipt?.updated_timestamp) || createdAt;

  return buildEnvelope({
    identity: {
      provider: "etsy", connection_id: text(ctx.connectionId, 200), marketplace_id: text(ctx.shopId, 40) || null,
      entity_type: "order", external_id: receiptId, external_updated_at: updatedAt, event_origin: ctx.eventOrigin || "provider"
    },
    order: {
      order_source: "etsy", sales_channel: "etsy", currency,
      subtotal: subtotal, discount_total: moneyOf(receipt?.discount_amt), tax_total: sumDecimal([moneyOf(receipt?.total_tax_cost), moneyOf(receipt?.total_vat_cost)]),
      // Deliberately not answered here. Etsy collects and remits the tax itself
      // in some jurisdictions and leaves the seller responsible in others, and
      // the receipt does not say which — total_tax_cost and total_vat_cost are
      // amounts, not an assignment of liability. Calling every Etsy sale
      // marketplace-collected would quietly wipe VAT the studio really owes;
      // calling it merchant would invent VAT it does not. So the amount is
      // recorded, kept out of the VAT total, and the order asks.
      tax_responsibility: "unknown", tax_included_in_price: true,
      shipping_total: moneyOf(receipt?.total_shipping_cost), grand_total: grand,
      platform_status: isCancelled ? "cancelled" : (status || null),
      payment_status: isRefunded ? "refunded" : (isPaid ? "paid" : "unpaid"),
      fulfillment_status: receipt?.is_shipped === true ? "fulfilled" : "unfulfilled",
      cancelled_at: isCancelled ? updatedAt : null,
      placed_at: createdAt,
      buyer_note: noteParts.join("\n") || null,
      is_test: false,
      line_items: lineItems
    },
    customer: {
      external_customer_id: text(receipt?.buyer_user_id, 40) || null,
      name: address.name || null,
      email: text(receipt?.buyer_email, 200).toLowerCase() || null,
      phone: null,
      billing_address: address,
      shipping_address: address
    },
    payments: [],
    refunds: refundsRaw.map((r) => ({ external_id: null, amount: moneyOf(r?.amount), currency, reason: text(r?.note, 300) || null, at: secondsToIso(r?.created_timestamp) })),
    shipments: (Array.isArray(receipt?.shipments) ? receipt.shipments : []).map((s) => ({
      external_id: text(s?.receipt_shipping_id, 40) || null, carrier: text(s?.carrier_name, 120) || null, tracking_number: text(s?.tracking_code, 120) || null,
      tracking_url: null, status: "shipped", at: secondsToIso(s?.shipment_notification_timestamp)
    })),
    source: {
      provider_display_name: "Etsy",
      connection_display_name: text(ctx.shopName, 200),
      external_admin_url: null,
      provider_metadata: {
        version: 1, order_number: receiptId, payment_method: text(receipt?.payment_method, 80), receipt_type: Number(receipt?.receipt_type) || 0,
        created_at_raw: createdAt || "", expected_ship_at: shipDates.length ? secondsToIso(shipDates[0]) : null,
        personalization: personalizationLines, gift_message: giftMessage || null,
        design_name: personalizationLines.length
          ? text(`${lineItems[0]?.title || "Etsy order"} — ${personalizationLines[0]}`, 300)
          : text(lineItems.map((item) => item.title).filter(Boolean).join(", ") || `Etsy receipt ${receiptId}`, 300),
        legacy_line_items: { include_sku: true },
        custom_fields: {
          Source: "Etsy",
          "Etsy Receipt ID": receiptId,
          "Etsy Shop": text(ctx.shopName, 200),
          "Etsy Status": status,
          "Etsy Payment Method": text(receipt?.payment_method, 80),
          "Etsy Currency": currency || "",
          "Etsy Total": grand ? String(Number(toDecimalString(grand) || 0)) : "0",
          "Etsy Created At": createdAt || "",
          "Etsy Products": lineItems.map((item) => item.title).filter(Boolean).join(", ").slice(0, 500),
          communicationAddress: [address.name, address.street, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")
        }
      }
    },
    review: { reasons },
    raw_snapshot_ref: ctx.rawSnapshotRef || null
  });
}

/** Days from placement to the earliest expected ship date — the live path's deliveryTime; null when Etsy gave none. */
function deliveryTimeDaysFor(envelope) {
  const placed = envelope?.order?.placed_at ? Date.parse(envelope.order.placed_at) : NaN;
  const ship = envelope?.source?.provider_metadata?.expected_ship_at ? Date.parse(envelope.source.provider_metadata.expected_ship_at) : NaN;
  if (!Number.isFinite(placed) || !Number.isFinite(ship)) return null;
  const days = Math.round((ship - placed) / 86400000);
  return days >= 1 && days <= 730 ? days : null;
}

module.exports = { normalizeEtsyReceipt, deliveryTimeDaysFor, splitVariations, transactionLabel };
