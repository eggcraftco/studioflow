"use strict";

/**
 * Which shop an order came from — one resolver, shared by every channel.
 *
 * The dashboard already answers this question (`dashboardOrderChannel`,
 * studioflow-web/app/dashboard/page.tsx). If the assistant answered it a second
 * way, "Manual: 6" would mean one thing in ChatGPT and another on the screen the
 * owner is looking at, for the same date range. So the vocabulary here is the
 * dashboard's vocabulary and nothing else:
 *
 *   shopify | woocommerce | etsy | square | amazon | ebay | manual
 *
 * The generic inbound webhook's own labels — Website, Wix, Squarespace, Zapier,
 * Make — are NOT channels. The dashboard files all of them under `manual`, and
 * test/qa/dashboard-channels.test.js pins that. They survive here as a
 * sub-label, `manualSource`, so an answer can still say where a manual order
 * came from without inventing a seventh channel the dashboard has never heard
 * of.
 *
 * Identity (§7, §27) is carried, never merged: an eBay order stays eBay, an
 * Amazon order stays Amazon, and the provider's own id is reported next to
 * NivaDesk's rather than instead of it.
 */

/** The dashboard's table, in its order. `source` is the string a connector writes. */
const CHANNEL_SOURCES = Object.freeze([
  { key: "shopify", source: "Shopify" },
  { key: "woocommerce", source: "WooCommerce" },
  { key: "etsy", source: "Etsy" },
  { key: "square", source: "Square" },
  { key: "amazon", source: "Amazon" },
  { key: "ebay", source: "eBay" }
]);

const CHANNELS = Object.freeze([...CHANNEL_SOURCES.map((row) => row.key), "manual"]);

/** Sub-labels a manual order can carry. Not channels — see the header. */
const MANUAL_SOURCES = Object.freeze([
  "typed", "inbound", "website", "wix", "squarespace", "zapier", "make", "chatgpt", "app", "import"
]);

/**
 * How much of a channel this workspace actually has.
 *
 * `data_only` is the row that matters: Amazon orders reach `siparisler` through
 * ingestAmazonEnvelope, but the Amazon connection lives in a separate hardened
 * project this function cannot read. A static "not available, no figures" row
 * would hide real sales and make the channel breakdown disagree with its own
 * total — so the row carries its numbers and says the status is what is missing.
 */
const AVAILABILITY = Object.freeze([
  "connected",                // a connection document exists and its auth is ok
  "connected_needs_reconnect",// connection exists, auth needs attention
  "data_only",                // orders exist, no connection visible from this surface
  "supported_not_connected",  // runtime exists, no connection, no orders
  "adapter_only",             // adapter code only, no runtime, no orders (eBay today)
  "not_supported"             // no adapter at all (faire)
]);

/** Providers with a runtime that can hold a connection document. */
const RUNTIME_PROVIDERS = Object.freeze(["shopify", "woocommerce", "etsy", "square"]);
/** Providers with adapter code and no runtime yet. */
const ADAPTER_ONLY_PROVIDERS = Object.freeze(["ebay"]);
/** Providers whose connection state is not readable from this surface. */
const OPAQUE_PROVIDERS = Object.freeze(["amazon"]);

const clean = (value) => String(value === undefined || value === null ? "" : value).trim();

function channelForSource(rawSource) {
  const folded = clean(rawSource).toLowerCase();
  if (!folded) return null;
  const row = CHANNEL_SOURCES.find((entry) => entry.source.toLowerCase() === folded);
  return row ? row.key : null;
}

function manualSourceOf(order = {}) {
  const custom = (order.customFields && typeof order.customFields === "object") ? order.customFields : {};
  const label = clean(custom.Source).toLowerCase();
  if (label) {
    const known = MANUAL_SOURCES.find((entry) => entry === label);
    if (known) return known;
    // A generic webhook label with no connector behind it. Recorded as what it
    // said rather than dropped, but only from a closed shape.
    if (/^[a-z0-9 _.-]{1,24}$/.test(label)) return label.replace(/\s+/g, "_");
    return "inbound";
  }
  const createdFrom = clean(order.createdFrom).toLowerCase();
  if (createdFrom === "chatgpt") return "chatgpt";
  if (createdFrom === "app" || createdFrom === "ios" || createdFrom === "android" || createdFrom === "macos") return "app";
  const orderSource = clean(order.orderSource).toLowerCase();
  if (orderSource === "inbound") return "inbound";
  if (orderSource && /^[a-z0-9_-]{1,24}$/.test(orderSource)) return orderSource;
  return "typed";
}

/**
 * Precedence: the engine's own stamp, then Etsy's legacy block, then the
 * `Source` custom field the dashboard reads, then manual.
 */
function channelOf(order = {}) {
  const commerce = (order.commerce && typeof order.commerce === "object") ? order.commerce : {};
  const etsySource = (order.etsySource && typeof order.etsySource === "object") ? order.etsySource : {};

  const engineProvider = clean(commerce.provider).toLowerCase();
  if (engineProvider && engineProvider !== "inbound" && CHANNELS.includes(engineProvider)) {
    return {
      channel: engineProvider,
      manualSource: null,
      provider: engineProvider,
      connectionId: clean(commerce.connectionId) || null,
      externalId: clean(commerce.externalOrderId || commerce.orderNumber) || null,
      externalUpdatedAt: clean(commerce.externalUpdatedAt) || null,
      identitySource: "engine"
    };
  }

  if (etsySource.receiptId || clean(etsySource.shopId)) {
    return {
      channel: "etsy",
      manualSource: null,
      provider: "etsy",
      connectionId: clean(etsySource.connectionId || etsySource.shopId) || null,
      externalId: clean(etsySource.receiptId) || null,
      externalUpdatedAt: clean(etsySource.lastSyncAt) || null,
      identitySource: "legacy"
    };
  }

  const custom = (order.customFields && typeof order.customFields === "object") ? order.customFields : {};
  const fromField = channelForSource(custom.Source);
  if (fromField) {
    return {
      channel: fromField,
      manualSource: null,
      provider: fromField,
      connectionId: clean(commerce.connectionId) || null,
      externalId: clean(custom[`${fromField} Order`] || custom["External Order"] || commerce.externalOrderId) || null,
      externalUpdatedAt: clean(commerce.externalUpdatedAt) || null,
      identitySource: "legacy"
    };
  }

  return {
    channel: "manual",
    manualSource: manualSourceOf(order),
    provider: null,
    connectionId: null,
    externalId: null,
    externalUpdatedAt: null,
    identitySource: "manual"
  };
}

/**
 * The availability word for one channel, from the data — never from a static
 * "we support this" list. `connections` is whatever the loader could see.
 */
function channelAvailability(channel, { hasOrders = false, connection = null } = {}) {
  const key = clean(channel).toLowerCase();
  if (key === "manual") return hasOrders ? "connected" : "supported_not_connected";

  if (connection) {
    const status = clean(connection.status || connection.authStatus).toLowerCase();
    const needsReconnect = ["reconnect_required", "needs_reconnect", "needsreauth", "uninstalled", "disconnected", "error"].includes(status);
    return needsReconnect ? "connected_needs_reconnect" : "connected";
  }
  if (hasOrders) return "data_only";
  if (OPAQUE_PROVIDERS.includes(key)) return "data_only";
  if (RUNTIME_PROVIDERS.includes(key)) return "supported_not_connected";
  if (ADAPTER_ONLY_PROVIDERS.includes(key)) return "adapter_only";
  return "not_supported";
}

/** True where a row of this availability is expected to carry figures. */
function availabilityCarriesNumbers(availability) {
  return ["connected", "connected_needs_reconnect", "data_only"].includes(clean(availability));
}

module.exports = {
  CHANNELS,
  CHANNEL_SOURCES,
  MANUAL_SOURCES,
  AVAILABILITY,
  RUNTIME_PROVIDERS,
  ADAPTER_ONLY_PROVIDERS,
  OPAQUE_PROVIDERS,
  channelOf,
  channelForSource,
  channelAvailability,
  availabilityCarriesNumbers
};
