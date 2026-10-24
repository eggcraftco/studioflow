/**
 * ETSY-E2E r2 (24 Oct 2026): an Etsy order paid in USD showed "£" on the order
 * screen and in the list, and its dollars were added to the £ totals on the
 * Dashboard, Home and the top bar. One shared rule (lib/studioflow/orderCurrency.ts):
 * the order's own ISO code, foreign only when the workspace symbol cannot mean it,
 * workspace totals add only the workspace's currency, the rest is listed apart.
 *
 * Run: npm run test:order-currency   (npx tsx scripts/check-order-currency.mts)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0; let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`ok   ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message}`); }
}
const oc = await import("../lib/studioflow/orderCurrency").catch(() => ({})) as Record<string, any>;
const need = (name: string) => { assert.equal(typeof oc[name], "function", `lib/studioflow/orderCurrency.ts: ${name} missing`); return oc[name]; };
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const GBP = { selectedCurrency: "£" };
const USD_WS = { selectedCurrency: "$" };
const etsyUsd = { customFields: { Source: "Etsy", "Etsy Currency": "usd" }, paidAmount: 12.5, remainingAmount: 0 };
const etsyGbp = { customFields: { Source: "Etsy", "Etsy Currency": "GBP" }, paidAmount: 30, remainingAmount: 0 };
const manual = { customFields: {}, paidAmount: 100, remainingAmount: 20 };

check("orderCurrencyCode reads <Source> Currency, Currency, then etsySource.currency", () => {
  const code = need("orderCurrencyCode");
  assert.equal(code(etsyUsd), "USD");
  assert.equal(code({ customFields: { Source: "etsy", "Etsy Currency": "EUR" } }), "EUR", "source spelling is case-folded");
  assert.equal(code({ customFields: { Source: "Website", Currency: "CAD" } }), "CAD");
  assert.equal(code({ customFields: { Source: "Etsy" }, etsySource: { currency: "AUD" } }), "AUD");
  assert.equal(code(manual), "");
  assert.equal(code({ customFields: { Currency: "dollars" } }), "", "not an ISO code");
});
check("isForeignToWorkspace: conservative symbol mapping", () => {
  const foreign = need("isForeignToWorkspace");
  assert.equal(foreign(etsyUsd, GBP), true);
  assert.equal(foreign(etsyGbp, GBP), false);
  assert.equal(foreign(manual, GBP), false, "unknown currency counts as the workspace's");
  assert.equal(foreign(etsyUsd, USD_WS), false, "$ means USD");
  assert.equal(foreign({ customFields: { Currency: "CAD" } }, USD_WS), true, "$ does not mean CAD");
  assert.equal(foreign({ customFields: { Currency: "CAD" } }, { selectedCurrency: "C$" }), false);
  assert.equal(foreign({ customFields: { Currency: "EUR" } }, { selectedCurrency: "€" }), false);
  assert.equal(foreign(etsyGbp, null), false, "missing settings = the default £");
});
check("formatOrderMoney: no change for same-currency orders, 'USD 12.50' for a USD order in a £ workspace", () => {
  const fmt = need("formatOrderMoney");
  assert.equal(fmt(30, etsyGbp, GBP), "£30.00");
  assert.equal(fmt(120, manual, GBP), "£120.00");
  assert.equal(fmt(12.5, etsyUsd, GBP), "USD 12.50");
  assert.equal(fmt(1234.5, etsyUsd, { selectedCurrency: "£", selectedDecimalSeparator: "," }), "USD 1.234,50");
  assert.equal(fmt(500, { customFields: { Currency: "JPY" } }, GBP), "JPY 500", "JPY has no decimals");
  assert.equal(need("orderMoneySymbol")(etsyUsd, GBP), "USD");
  assert.equal(need("orderIconSymbol")(etsyUsd, GBP), "$", "no £ icon on a USD order");
  assert.equal(need("orderIconSymbol")(etsyGbp, GBP), "£");
});
check("Sales row: an ISO code is not a symbol (was 'USD12.50')", () => {
  const fmt = need("formatAmountInCurrency");
  assert.equal(fmt(12.5, "USD", GBP), "USD 12.50");
  assert.equal(fmt(12.5, "GBP", GBP), "£12.50");
  assert.equal(fmt(12.5, "", GBP), "£12.50");
});
check("mixed GBP+USD fixture: workspace total adds only £ orders; USD listed apart, not converted", () => {
  const orders = [etsyGbp, etsyUsd, manual, { customFields: { Source: "Etsy", "Etsy Currency": "USD" }, paidAmount: 41.5, remainingAmount: 0 }, { customFields: { Currency: "EUR" }, paidAmount: 20, remainingAmount: 0 }];
  const { workspace, foreign } = need("splitOrdersByWorkspaceCurrency")(orders, GBP);
  const total = workspace.reduce((sum: number, o: any) => sum + o.paidAmount + o.remainingAmount, 0);
  assert.equal(total, 150, "£30 + £120; the 54 dollars and 20 euros are not added");
  assert.equal(foreign.length, 3);
  const rows = need("foreignCurrencyTotals")(orders, GBP, (o: any) => o.paidAmount + o.remainingAmount);
  assert.deepEqual(rows, [{ code: "USD", amount: 54, count: 2 }, { code: "EUR", amount: 20, count: 1 }]);
  assert.equal(need("foreignCurrenciesLine")(rows, GBP, "English"), "Other currencies (not converted, not in totals): USD 54.00 · EUR 20.00");
  assert.equal(need("foreignCurrenciesLine")(rows, GBP, "English", true), "Other currencies (not converted, not in totals): USD •••• · EUR ••••");
  assert.equal(need("foreignCurrenciesLine")([], GBP, "English"), "");
});
check("the 'Other currencies' line is translated in all 12 languages", () => {
  const key = "Other currencies (not converted, not in totals):";
  for (const language of SUPPORTED_STUDIO_LANGUAGES) {
    if (language === "English") continue;
    assert.notEqual(studioT(key, language), key, `${language} falls back to English`);
  }
});

// Wiring: the screens use the shared rule (no private copies, no silent sums).
check("order screen: header chip, Order Value, Financial card and line items use the order's currency", () => {
  const detail = read("app/orders/OrderDetailContent.tsx");
  assert.match(detail, /const orderCurrencyRef = \{ customFields: order\.customFields, etsySource \};/);
  assert.match(detail, /formatOrderMoney\(value, orderCurrencyRef, moneySettings\)/);
  assert.match(detail, /<CardIconGlyph icon="finance" symbol=\{orderIconSymbol\(orderCurrencyRef, moneySettings\)\} \/>\s*\{orderValueMoney\(order\.paidAmount \+ order\.remainingAmount/);
  assert.match(detail, /t\("Order Value"\)\}<\/span>\s*<strong>\{canSeeFinance \? orderValueMoney\(/);
  assert.match(detail, /formatMoney=\{value => orderValueMoney\(value\)\}/);
  assert.match(detail, /displayValue=\{orderValueMoney\(order\.paidAmount, hideNumbers\)\}/);
  assert.match(detail, /value=\{orderValueMoney\(orderFinance\.vatDue, hideNumbers\)\}/);
  assert.match(detail, /iconSymbol=\{cardId === "financial" \? orderIconSymbol\(orderCurrencyRef, moneySettings\)/);
});
check("order list rows use the order's currency", () => {
  const list = read("components/OrderListCard.tsx");
  assert.match(list, /formatOrderMoney\(value, order, settings\)/);
  assert.match(list, /money\(order\.paidAmount \+ outstandingAmount, hideNumbers, moneySettings, order\)/);
});
check("Sales page no longer passes an ISO code as the symbol", () => {
  const sales = read("app/sales/page.tsx");
  assert.doesNotMatch(sales, /selectedCurrency: row\.currency/);
  assert.match(sales, /formatAmountInCurrency\(row\.revenue, row\.currency/);
});
check("Dashboard: totals exclude foreign orders; the private resolver is gone; the line is shown", () => {
  const dash = read("app/dashboard/page.tsx");
  assert.doesNotMatch(dash, /DASHBOARD_SYMBOL_TO_ISO|function dashboardOrderCurrency/);
  assert.match(dash, /const countingFinanceOrders = useMemo\(\s*\(\) => channelOrders\.filter\(order => order\.countsTowardBalance !== false && !isForeignToWorkspace\(order, settings\)\)/);
  assert.match(dash, /const filteredCountingOrders = useMemo\(\s*\(\) => filteredFinanceOrders\.filter\(order => order\.countsTowardBalance !== false && !isForeignToWorkspace\(order, settings\)\)/);
  assert.match(dash, /data-foreign-currencies="range"/);
  assert.match(dash, /data-foreign-currencies="year"/);
  assert.match(dash, /foreignCurrenciesLine\(foreignCurrenciesThisYear/);
});
check("Home Money card: totals from workspace-currency orders only, foreign line shown", () => {
  const home = read("components/home/HomeCardBodies.tsx");
  assert.match(home, /const orders = splitOrdersByWorkspaceCurrency\(inPeriod, moneySettings\)\.workspace;/);
  assert.match(home, /foreignCurrenciesLine\(\s*foreignCurrencyTotals\(inPeriod/);
});
check("top bar margins exclude foreign orders and list them apart", () => {
  const shell = read("components/AppShell.tsx");
  const month = shell.slice(shell.indexOf("const monthMargin = useMemo("), shell.indexOf("const yearMargin = useMemo("));
  assert.match(month, /!isForeignToWorkspace\(order, settings\)/);
  assert.match(shell, /yearForeignMargins\.length \?/);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
