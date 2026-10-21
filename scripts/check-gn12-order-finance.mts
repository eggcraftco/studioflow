// GN-12 (22 Oct 2026) — the order card, the order PDF and the Dashboard give one profit for one order.
//
// The production order behind GN-12 (a WooCommerce deposit line of 1335 with the balance order merged in
// as a 3865 payment, no lines) showed +2,369.94 on this card and −1,495.06 on the Mac. The card ran a
// pre-engine formula of its own; the Mac read engine version 4, under which the lines won and the 3865
// vanished. Version 5 counts money recorded beyond the lines, and the card now reads the engine.
//
// Every order here is synthetic and only SHAPED like the production record.
//
//   npx tsx scripts/check-gn12-order-finance.mts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { orderDetailFinance, orderFinanceBlock } from "../lib/studioflow/finance";
import { FINANCE_ENGINE_VERSION } from "../lib/studioflow/financeEngine";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  console.log(condition ? "PASS " : "FAIL ", name);
  if (!condition) failures.push(name);
};

const settings = {
  feePercentage: 3, defaultTaxRate: 0, vatRegistered: true, pricesIncludeVat: true, vatMethod: "standard",
  taxCalculationType: "Revenue", taxMilestoneEnabled: false, taxMilestoneDate: 0, corporationTaxEnabled: true, corporationTaxRate: 19
} as never;

function order(overrides: Record<string, unknown> = {}) {
  return {
    paidAmount: 5200, remainingAmount: 0, refundedAmount: 0, watchPurchasePrice: 2000, paymentFee: 40.05, deliveryCost: 40.01,
    taxAmount: 0, taxRate: 0, taxType: "Revenue", taxRateStated: true,
    platformFeeKnown: false, taxAmountKnown: false, taxResponsibility: "", taxIncludedInPrice: null,
    lineItems: [{ id: "1899", name: "Deposit", quantity: 1, unitPrice: 1335, lineTotal: 1335 }],
    customFields: {
      orderExpenseItemsJSON: "[{\"id\":\"a\",\"title\":\"Tax\"},{\"id\":\"b\",\"title\":\"custom tax\"}]",
      "financialExpense::custom tax": "750"
    },
    paymentDate: new Date("2026-08-24T18:50:20Z"),
    ...overrides
  } as never;
}

ok("the web mirror is engine version 5", FINANCE_ENGINE_VERSION === 5);

const card = orderDetailFinance(order(), settings);
ok("card: revenue is what the customer paid (5200), not the deposit line", card.revenue === 5200 && card.linesTotal === 1335);
ok("card: revenue source says money beyond the lines", card.revenueSource === "money_above_lines");
ok("card: net profit 2253.99 (5200 − 2000 − 750 − 40.01 − 156 fee − 0 VAT)", card.netProfit === 2253.99);
ok("card: the platform fee is the engine's 3% of 5200, not the stored 40.05", card.platformFee === 156);

// The Dashboard's mirror for the same document (no stamp, as in the window between two releases).
const dashboard = orderFinanceBlock({
  id: "o1", paymentDate: new Date("2026-08-24T18:50:20Z"), paidAmount: 5200, remainingAmount: 0, watchPurchasePrice: 2000,
  paymentFee: 40.05, deliveryCost: 40.01, taxAmount: 0, customerName: "", designName: "", watchRef: "",
  customFields: { "financialExpense::custom tax": "750" }, finance: null,
  lineItems: [{ lineTotal: 1335 }], refundedAmount: 0, taxRate: 0, taxType: "Revenue"
}, settings);
ok("Dashboard and card agree on the same order", dashboard.netProfit === card.netProfit && dashboard.revenue === card.revenue);

const v4Stamp = orderFinanceBlock({
  id: "o1", paymentDate: null, paidAmount: 5200, remainingAmount: 0, watchPurchasePrice: 2000, paymentFee: 40.05,
  deliveryCost: 40.01, taxAmount: 0, customerName: "", designName: "", watchRef: "", customFields: { "financialExpense::custom tax": "750" },
  finance: { engineVersion: 4, netProfit: -1495.06, revenue: 1335 } as never,
  lineItems: [{ lineTotal: 1335 }], taxRate: 0
}, settings);
ok("stale cache: a version 4 stamp (−1495.06) is not shown", v4Stamp.netProfit === 2253.99);

ok("partial payment: lines above the money still decide", orderDetailFinance(order({ paidAmount: 500 }), settings).revenue === 1335);
ok("refund: 200 refunded comes off once", orderDetailFinance(order({ paidAmount: 5000, refundedAmount: 200 }), settings).netProfit === 2053.99);
ok("cancel: everything refunded earns minus the fee", orderDetailFinance(order({ paidAmount: 0, refundedAmount: 1335, watchPurchasePrice: 0, deliveryCost: 0, customFields: {} }), settings).netProfit === -40.05);
ok("other currency: whole units are not scaled", orderDetailFinance(order({ paidAmount: 520000, lineItems: [{ lineTotal: 133500 }], watchPurchasePrice: 0, deliveryCost: 0, customFields: {} }), { ...(settings as object), feePercentage: 0 } as never).netProfit === 520000);
ok("missing cost: no base cost is a zero cost", orderDetailFinance(order({ watchPurchasePrice: 0 }), settings).netProfit === 4253.99);
ok("absent VAT rate reads as the workspace default, a stated 0 stays 0",
  orderDetailFinance(order({ taxRateStated: false }), { ...(settings as object), defaultTaxRate: 20 } as never).vatDue === 866.67
  && orderDetailFinance(order({ taxRateStated: true }), { ...(settings as object), defaultTaxRate: 20 } as never).vatDue === 0);
ok("update: shipping 45 → 40.01 moves the profit by 4.99",
  Math.round((orderDetailFinance(order(), settings).netProfit - orderDetailFinance(order({ deliveryCost: 45 }), settings).netProfit) * 100) / 100 === 4.99);
ok("reopen: status is not an engine input", orderDetailFinance(order({ status: "In Progress" }), settings).netProfit === card.netProfit);

// The card, the PDF and the optimistic edit carry no profit formula of their own any more.
const content = read("app/orders/OrderDetailContent.tsx");
const firestore = read("lib/studioflow/firestore.ts");
ok("card: no pre-engine profit formula left in the order screen", !/paidAmount \+ remainingAmount \+ customRemainingTotal - watchPurchasePrice/.test(content));
ok("mapper: OrderDetail no longer carries a pre-computed netProfit", !/netProfit: paidAmount \+ remainingAmount/.test(firestore) && !/^\s*netProfit: number;\s*$/m.test(firestore.slice(firestore.indexOf("export type OrderDetail = {"), firestore.indexOf("export type OrderDetail = {") + 4000)));
ok("card: Final Profit and Profit before CT read the engine block", (content.match(/money\(orderFinance\.netProfit, hideNumbers\)/g) || []).length === 2);
ok("card: Platform Fee and VAT Amount rows show the engine's figures", content.includes("displayValue={money(orderFinance.platformFee, hideNumbers)}") && content.includes("value={money(orderFinance.vatDue, hideNumbers)}"));
ok("PDF: the Financial Info rows and profit come from the engine", content.includes("const pdfFinance = orderDetailFinance(order, settings);") && content.includes("const profitAfterVat = pdfFinance.netProfit;"));
ok("hidden finance: PDF finance rows still sit behind showFinInternal", /if \(showFinInternal\) \{\s*\/\/ The engine's figures/.test(content));

if (failures.length) {
  console.log(`\n❌ GN-12 ORDER FINANCE: ${failures.length} of ${checks} failed`);
  process.exit(1);
}
console.log(`\n✅ GN-12 ORDER FINANCE GEÇTİ (${checks} kontrol)`);
