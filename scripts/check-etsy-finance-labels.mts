/**
 * ETSY-E2E r3 (24 Oct 2026), finance acceptance (c): an order with no cost entered never reads as a final profit —
 * on the order card (with and without Corporation Tax), in the PDF, and in the Dashboard totals.
 *
 * Run: npm run test:etsy-finance-labels   (npx tsx scripts/check-etsy-finance-labels.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { costsMissingCount, COSTS_MISSING_FOOTNOTE } from "../lib/studioflow/finance";

let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const card = readFileSync(new URL("../app/orders/OrderDetailContent.tsx", import.meta.url), "utf8");
const dash = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

check("costsMissingCount counts orders with no direct cost and no other expense", () => {
  assert.equal(costsMissingCount([{ directCost: 0, otherExpenses: 0 }, { directCost: 5, otherExpenses: 0 }, { directCost: 0, otherExpenses: 2 }, null]), 1);
  assert.equal(costsMissingCount([]), 0);
});
check("card with Corporation Tax: no-cost order is not green and says so", () => {
  // ETSY-SHIP-2: the same rule, now also off when the Etsy shipping cost is not known.
  assert.ok(/tone=\{\(orderFinance\.directCost === 0 && orderFinance\.otherExpenses === 0\) \|\| etsyShippingUnknown \? undefined : "positive"\}/.test(card));
  assert.equal((card.match(/data-testid="finance-costs-missing"/g) || []).length, 2);
});
check("PDF: no-cost order prints \"Estimated profit\", not a green Final Profit", () => {
  assert.ok(card.includes('financeRows.push({ title: "Estimated profit", value: formatMoney(profitAfterVat) });'));
});
check("Dashboard: profit tiles and breakdown carry the no-cost footnote", () => {
  assert.ok(dash.includes("costsMissingCount(filteredCountingOrders.map(order => orderFinanceBlock(order, settings)))"));
  assert.ok(dash.includes('data-testid="dashboard-costs-missing"'));
  assert.ok(dash.includes('tone={rangeCostsMissing > 0 || rangeEtsyShippingUnknown > 0 ? "blue" : "green"}'));
});
check("the footnote is translated in every app language", () => {
  for (const lang of SUPPORTED_STUDIO_LANGUAGES) {
    if (lang === "English") continue;
    assert.notEqual(studioT(COSTS_MISSING_FOOTNOTE, lang), COSTS_MISSING_FOOTNOTE, lang);
    assert.notEqual(studioT("Estimated profit", lang), "Estimated profit", lang);
  }
});
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
