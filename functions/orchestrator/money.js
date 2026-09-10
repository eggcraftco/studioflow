"use strict";

/**
 * Currency, and the rule that stops two currencies being added together.
 *
 * Imported orders keep the provider's own amounts — "currency is recorded for
 * reference only", "amounts import as raw numbers, never converted". So a
 * workspace with GBP and USD orders holds raw numbers in both, and summing them
 * produces a headline that is not money in any currency. The dashboard does not
 * convert (`dashboardOrderCurrency` shows foreign orders in their own rows), so
 * neither does this.
 *
 * The contract every capability follows:
 *   - headline figures are workspace currency ONLY,
 *   - `currencies[]` carries every currency including the workspace one,
 *   - `excludedByCurrency` names what the headline left out,
 *   - `assumedCurrencyOrders` counts the orders that had no currency of their
 *     own and fell through to the workspace default — a default is not a
 *     reading, and a reader is entitled to know how many.
 */

const channel = require("./channel");

/** Display symbols the workspace setting uses, mapped to ISO. */
const SYMBOL_TO_ISO = Object.freeze({
  "£": "GBP", "$": "USD", "€": "EUR", "₺": "TRY", "TL": "TRY", "₹": "INR",
  "¥": "JPY", "CHF": "CHF", "kr": "SEK", "zł": "PLN", "R$": "BRL", "C$": "CAD",
  "A$": "AUD", "₽": "RUB", "₴": "UAH", "₪": "ILS", "د.إ": "AED"
});

const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
const clean = (value) => String(value === undefined || value === null ? "" : value).trim();

/** The workspace's own currency as an ISO code. Defaults to GBP, as the app does. */
function workspaceCurrency(settings = {}) {
  const raw = clean(settings.seciliParaBirimi || settings.currency || settings.paraBirimi || "£");
  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
  return SYMBOL_TO_ISO[raw] || "GBP";
}

/**
 * An order's currency, resolved the way the dashboard resolves it, plus the
 * engine's own field first and the workspace default last.
 *
 * Returns `{ currency, assumed }`. `assumed: true` means nothing on the order
 * said which currency it was.
 */
function currencyOf(order = {}, { workspace = "GBP" } = {}) {
  const commerce = (order.commerce && typeof order.commerce === "object") ? order.commerce : {};
  const fromEngine = clean(commerce.currency).toUpperCase();
  if (/^[A-Z]{3}$/.test(fromEngine)) return { currency: fromEngine, assumed: false };

  const custom = (order.customFields && typeof order.customFields === "object") ? order.customFields : {};
  const raw = clean(custom.Source);
  const known = channel.CHANNEL_SOURCES.find((row) => row.source.toLowerCase() === raw.toLowerCase());
  const source = known ? known.source : raw;
  const perSource = clean(source ? custom[`${source} Currency`] : "").toUpperCase();
  if (/^[A-Z]{3}$/.test(perSource)) return { currency: perSource, assumed: false };

  const generic = clean(custom.Currency).toUpperCase();
  if (/^[A-Z]{3}$/.test(generic)) return { currency: generic, assumed: false };

  const own = clean(order.currency || order.paraBirimi);
  if (/^[A-Za-z]{3}$/.test(own)) return { currency: own.toUpperCase(), assumed: false };
  if (own && SYMBOL_TO_ISO[own]) return { currency: SYMBOL_TO_ISO[own], assumed: false };

  return { currency: String(workspace || "GBP").toUpperCase(), assumed: true };
}

/** A per-currency accumulator. Keys are ISO codes; nothing is ever converted. */
function createBuckets(fields = ["gross", "refunds", "net"]) {
  const rows = new Map();
  const blank = () => {
    const row = { orders: 0 };
    for (const field of fields) row[field] = 0;
    return row;
  };
  return {
    add(currency, values = {}, { countOrder = true } = {}) {
      const code = String(currency || "").toUpperCase() || "GBP";
      if (!rows.has(code)) rows.set(code, blank());
      const row = rows.get(code);
      if (countOrder) row.orders += 1;
      for (const field of fields) {
        if (values[field] !== undefined) row[field] += Number(values[field]) || 0;
      }
      return row;
    },
    get(currency) {
      const code = String(currency || "").toUpperCase();
      return rows.has(code) ? { ...rows.get(code) } : null;
    },
    /** Every currency, workspace one included, rounded, ordered by size. */
    list() {
      return [...rows.entries()]
        .map(([currency, row]) => {
          const out = { currency, orders: row.orders };
          for (const field of fields) out[field] = round2(row[field]);
          return out;
        })
        .sort((lhs, rhs) => rhs.orders - lhs.orders || lhs.currency.localeCompare(rhs.currency));
    },
    currencies() {
      return [...rows.keys()].sort();
    },
    /** What the headline (workspace currency) leaves out. */
    excluded(workspace) {
      const code = String(workspace || "").toUpperCase();
      const others = [...rows.entries()].filter(([currency]) => currency !== code);
      return {
        orders: others.reduce((acc, [, row]) => acc + row.orders, 0),
        currencies: others.map(([currency]) => currency).sort()
      };
    }
  };
}

module.exports = { SYMBOL_TO_ISO, workspaceCurrency, currencyOf, createBuckets, round2 };
