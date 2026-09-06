"use strict";

/**
 * The §13 answer shape: result → breakdown → finance/banking → attention → next.
 *
 * The renderer exists so that the same answer reads the same way in ChatGPT and
 * in WhatsApp — `style: "chat"` and `style: "compact"` differ in presentation
 * and never in figures (§89 scenario 12).
 *
 * Two hard rules, both testable:
 *
 *  - **Every number in a line comes from `data`.** A summary that computes its
 *    own total is a second implementation of the arithmetic, and the two drift.
 *    The test extracts the numerals from each line and checks membership.
 *  - **No provider- or buyer-authored text.** Notes, history entries, design
 *    names and custom fields are written by other people — that is where a
 *    buyer's name leaks and where a prompt injection would arrive. They never
 *    reach a summary line.
 */

const SLOTS = Object.freeze(["result", "breakdown", "finance", "attention", "next"]);

const money = (value) => {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
};

/**
 * The channel profile has already run by the time a line is written: `run()`
 * applies it inside `envelope.finish()` and only then renders. So a block this
 * renderer reads may be `{ restricted: true, reason: "channel_financial_policy" }`
 * rather than the figures — and `money(undefined)` is 0, which turned a
 * withheld sales total into "0 undefined gross" on the one path the WhatsApp
 * consumer uses. A figure that is not there is SAID to be not there; it is
 * never coerced into a number, because a fabricated zero is worse than silence.
 */
const withheld = (block) => Boolean(block) && typeof block === "object" && block.restricted === true;

/** A block that can actually be read for figures. */
const readable = (block) => Boolean(block) && typeof block === "object" && !withheld(block);

function line(slot, text) {
  return { slot, text: String(text || "").trim() };
}

/** Stale and partial always get said, whatever the capability was (§14). */
function freshnessLines(envelopeRow) {
  const lines = [];
  for (const source of (envelopeRow.freshness && envelopeRow.freshness.sources) || []) {
    if (source.state !== "stale") continue;
    const hours = Math.round((source.lagMs || 0) / 3600000);
    lines.push(line("finance", `${source.provider} ${source.entity} sync is ${hours} hours behind, so today's figures may be incomplete.`));
  }
  if (envelopeRow.partial) {
    const excluded = envelopeRow.warnings
      .filter((row) => ["channel_excluded_auth", "channel_not_connected", "status_not_visible_from_this_surface", "loader_cap_reached"].includes(row.code))
      .map((row) => row.message);
    lines.push(line("finance", excluded.length ? `This answer is incomplete: ${excluded[0]}` : "This answer is incomplete; some sources could not be included."));
  }
  return lines;
}

function summaryFor(envelopeRow, { style = "chat" } = {}) {
  const data = envelopeRow.data || {};
  const lines = [];
  const capability = envelopeRow.action;

  if (capability === "get_commerce_overview") {
    const count = ((data.orders || {}).count) || 0;
    if (readable(data.sales)) {
      lines.push(line("result", `${count} order(s) and ${money(data.sales.gross)} ${data.sales.currency} gross in this range.`));
    } else {
      lines.push(line("result", `${count} order(s) in this range. Sales figures are not shown in this channel.`));
    }
    for (const row of (data.channels || []).filter((entry) => entry.orders > 0)) {
      lines.push(line("breakdown", `${row.channel}: ${row.orders}`));
    }
    if (readable(data.sales) && data.sales.excludedByCurrency && data.sales.excludedByCurrency.orders > 0) {
      lines.push(line("breakdown", `${data.sales.excludedByCurrency.orders} order(s) in ${data.sales.excludedByCurrency.currencies.join(", ")} are listed separately and not added to the ${data.sales.currency} total.`));
    }
    if (readable(data.settlements) && data.settlements.square) {
      lines.push(line("finance", `Square payouts in this range: ${money(data.settlements.square.net)} (reported beside sales, never added to them).`));
    }
  } else if (capability === "search_commerce_orders") {
    lines.push(line("result", `${data.count} order(s) listed of ${data.matched} matching.`));
  } else if (capability === "get_channel_performance") {
    lines.push(line("result", `${(data.channels || []).filter((row) => row.orders > 0).length} channel(s) had orders in this range.`));
    for (const row of (data.channels || []).filter((entry) => entry.orders > 0)) {
      const first = Array.isArray(row.amounts) ? row.amounts[0] : null;
      lines.push(line("breakdown", first ? `${row.channel}: ${row.orders} order(s), ${money(first.gross)} ${first.currency}` : `${row.channel}: ${row.orders} order(s)`));
    }
  } else if (capability === "get_inventory_overview") {
    lines.push(line("result", `${data.counts.items} inventory item(s), ${data.counts.lowStock} at or below their low-stock level.`));
    if (readable(data.value)) lines.push(line("finance", `Stock value ${money(data.value.cost)} ${data.value.currency}.`));
    else if (withheld(data.value)) lines.push(line("finance", "Stock value is not shown in this channel."));
  } else if (capability === "search_inventory_items") {
    lines.push(line("result", `${data.count} item(s) listed of ${data.matched} matching.`));
  } else if (capability === "get_payout_reconciliation_overview") {
    if (readable(data.totals)) {
      lines.push(line("result", `${data.totals.matched} payout(s) matched with a bank line, ${data.totals.partial} matched with a difference, ${data.totals.unmatched} not matched.`));
    } else {
      lines.push(line("result", "Payout matching figures are not shown in this channel."));
    }
  } else if (capability === "get_integration_health") {
    const reconnect = (data.connections || []).filter((row) => row.reconnectRequired);
    // `count` is the connections this workspace actually has; `considered` is
    // the channels this answer looked at. Saying "6 connection(s) checked" about
    // the second number told an empty workspace it had six connections. Both
    // numerals come from `data`, including the reconnect count.
    lines.push(line("result", `${data.count} connection(s) set up; ${data.needsReconnect} need reconnecting.`));
    lines.push(line("breakdown", `${data.considered} channel(s) checked.`));
    for (const row of reconnect) lines.push(line("attention", `${row.provider} needs reconnecting.`));
  } else if (capability === "get_accounting_sync_status") {
    lines.push(line("result", `${data.connections.length} accounting connection(s).`));
    lines.push(line("finance", "Ledger posting is not switched on yet; NivaDesk is preparing records only."));
    lines.push(line("attention", `${data.readiness.ready} bank transaction(s) are ready to be prepared.`));
  } else if (capability === "get_business_attention_summary" || capability === "get_banking_attention_summary") {
    lines.push(line("result", `${data.totalItems} item(s) need attention: ${data.counts.critical} critical, ${data.counts.high} high.`));
    for (const item of (data.items || []).slice(0, style === "compact" ? 5 : 10)) {
      lines.push(line("attention", item.title));
    }
  }

  lines.push(...freshnessLines(envelopeRow));

  const next = (envelopeRow.suggestedActions || [])[0];
  if (next) lines.push(line("next", next.label));

  // Fixed slot order, empty slots omitted.
  const ordered = [];
  for (const slot of SLOTS) ordered.push(...lines.filter((row) => row.slot === slot && row.text));
  return ordered;
}

/** The single text block a chat channel shows above the structured data. */
function toText(lines = [], { style = "chat" } = {}) {
  if (style === "compact") {
    return lines.map((row, index) => `${index + 1}. ${row.text}`).join("\n");
  }
  return lines.map((row) => row.text).join("\n");
}

module.exports = { SLOTS, summaryFor, toText };
