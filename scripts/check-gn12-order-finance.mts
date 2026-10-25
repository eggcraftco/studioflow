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
import {
  commissionEstimateRate, commissionIsEstimated, ESTIMATED_PLATFORM_FEES_FOOTNOTE, estimatedFeeSummary,
  orderDetailFinance, orderFinanceBlock, orderSalesTotal, platformFeeLabel, platformFeeTotalLabel
} from "../lib/studioflow/finance";
import { studioT } from "../lib/studioflow/language";
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
// ETSY-E2E (24 Oct) added the "Estimated profit" row (no cost entered): three rows read the same block.
ok("card: Final Profit, Estimated profit and Profit before CT read the engine block", (content.match(/(?:\bmoney|orderValueMoney)\(orderFinance\.netProfit, hideNumbers\)/g) || []).length === 3);
ok("card: Platform Fee and VAT Amount rows show the engine's figures", /displayValue=\{(?:money|orderValueMoney)\(orderFinance\.platformFee, hideNumbers\)\}/.test(content) && /value=\{(?:money|orderValueMoney)\(orderFinance\.vatDue, hideNumbers\)\}/.test(content));
ok("PDF: the Financial Info rows and profit come from the engine", content.includes("const pdfFinance = orderDetailFinance(order, settings);") && content.includes("const profitAfterVat = pdfFinance.netProfit;"));
ok("hidden finance: PDF finance rows still sit behind showFinInternal", /if \(showFinInternal\) \{\s*\/\/ The engine's figures/.test(content));

// ---------------------------------------------------------------------------
// GN-12 release gate: an estimated platform fee is labelled as one.
const tr = (text: string) => studioT(text, "Türkçe");
ok("estimate: no shop commission → commissionEstimated, rate 3", card.commissionEstimated === true && card.commissionRatePercent === 3);
ok("estimate: card label reads \"Platform Fee (estimate, 3%)\"", platformFeeLabel(card, (x) => x, settings) === "Platform Fee (estimate, 3%)");
ok("estimate: Turkish label reads \"Platform Ücreti (tahmini, 3%)\"", platformFeeLabel(card, tr, settings) === "Platform Ücreti (tahmini, 3%)");
const reportedCard = orderDetailFinance(order({ platformFeeKnown: true, paymentFee: 40.05 }), settings);
ok("reported: a shop's own fee is not an estimate and keeps the plain label",
  reportedCard.commissionEstimated === false && reportedCard.commissionRatePercent === 0 && reportedCard.platformFee === 40.05
  && platformFeeLabel(reportedCard, (x) => x, settings) === "Platform Fee");
ok("estimate: another workspace rate is printed (2.5%)",
  platformFeeLabel(orderDetailFinance(order(), { ...(settings as object), feePercentage: 2.5 } as never), (x) => x) === "Platform Fee (estimate, 2.5%)");
ok("old stamp: no commissionEstimated → estimated = platformFeeKnown !== true",
  commissionIsEstimated({ platformFeeKnown: false }) && commissionIsEstimated({}) && !commissionIsEstimated({ platformFeeKnown: true }));
ok("old stamp: missing rate falls back to the workspace percentage", commissionEstimateRate({ platformFeeKnown: false }, settings) === 3);
// A version 5 stamp written before the two fields existed (it is the block the Dashboard is handed as-is).
const earlyV5 = orderFinanceBlock({
  id: "o2", paymentDate: null, paidAmount: 100, remainingAmount: 0, watchPurchasePrice: 0, paymentFee: 3, deliveryCost: 0, taxAmount: 0,
  customerName: "", designName: "", watchRef: "", customFields: {}, lineItems: [], taxRate: 0,
  finance: { engineVersion: 5, revenue: 100, netProfit: 97, platformFee: 3, platformFeeKnown: false } as never
}, settings);
ok("Dashboard: an early v5 stamp without the flag is still read as an estimate", earlyV5.netProfit === 97 && commissionIsEstimated(earlyV5));
const reportedBlock = { platformFee: 10, platformFeeKnown: true, commissionEstimated: false, commissionRatePercent: 0 };
const estimatedBlock = { platformFee: 6, platformFeeKnown: false, commissionEstimated: true, commissionRatePercent: 3 };
const zeroEstimate = { platformFee: 0, platformFeeKnown: false, commissionEstimated: true, commissionRatePercent: 0 };
ok("footnote: shown when any order in scope has an estimated fee above zero", estimatedFeeSummary([reportedBlock, estimatedBlock]).footnote === true);
ok("footnote: not shown when every fee is the shop's own", estimatedFeeSummary([reportedBlock, reportedBlock]).footnote === false);
ok("footnote: an estimate of zero (0% workspace) needs no footnote", estimatedFeeSummary([zeroEstimate, reportedBlock]).footnote === false);
ok("footnote: an early v5 stamp in scope counts", estimatedFeeSummary([reportedBlock, earlyV5], settings).footnote === true);
ok("total label: all one estimate → \"Platform Fee (estimate, 3%)\"; mixed → plain",
  platformFeeTotalLabel(estimatedFeeSummary([estimatedBlock, estimatedBlock]), (x) => x) === "Platform Fee (estimate, 3%)"
  && platformFeeTotalLabel(estimatedFeeSummary([estimatedBlock, reportedBlock]), (x) => x) === "Platform Fee");
ok("translations: \"estimate\" and the footnote are Turkish, and \"Estimate\" (quote) is unchanged",
  tr("estimate") === "tahmini" && tr(ESTIMATED_PLATFORM_FEES_FOOTNOTE) === "Tahmini platform ücretlerini içerir" && tr("Estimate") === "Teklif");
ok("translations: every language the table carries has both keys",
  ["Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]
    .every((lang) => studioT("estimate", lang) !== "estimate" && studioT(ESTIMATED_PLATFORM_FEES_FOOTNOTE, lang) !== ESTIMATED_PLATFORM_FEES_FOOTNOTE));
ok("mirror: revenue with the workspace settings agrees with the profit's block (VAT on top)",
  (() => {
    const onTop = { ...(settings as object), pricesIncludeVat: false } as never;
    const o = { id: "o3", paymentDate: null, paidAmount: 5200, remainingAmount: 0, watchPurchasePrice: 0, paymentFee: 0, deliveryCost: 0, taxAmount: 0,
      customerName: "", designName: "", watchRef: "", customFields: {}, lineItems: [{ lineTotal: 1335 }], taxRate: 0, finance: null } as never;
    return orderSalesTotal(o, onTop) === orderFinanceBlock(o, onTop).revenue && orderSalesTotal(o, onTop) === 1335;
  })());

const dashboardSrc = read("app/dashboard/page.tsx");
const homeSrc = read("components/home/HomeCardBodies.tsx");
ok("card: the Platform Fee row label comes from platformFeeLabel", content.includes("label={platformFeeLabel(orderFinance, t, moneySettings)}"));
ok("PDF: the Financial Info fee row label comes from platformFeeLabel", content.includes("title: platformFeeLabel(pdfFinance, undefined, settings)"));
// ETSY-E2E r3: the two profit tiles carry the fee footnote AND the no-cost footnote (profitFootnoteKeys).
ok("Dashboard: fee tile, profit tile, CT tiles carry the footnote",
  (dashboardSrc.match(/sub=\{rangeFeeSummary\.footnote \? t\(ESTIMATED_PLATFORM_FEES_FOOTNOTE\) : undefined\}/g) || []).length === 2
  && (dashboardSrc.match(/sub=\{profitFootnoteKeys\.length \? profitFootnoteKeys\.map\(key => t\(key\)\)\.join\(" · "\) : undefined\}/g) || []).length === 2
  && dashboardSrc.includes("rangeFeeSummary.footnote ? ESTIMATED_PLATFORM_FEES_FOOTNOTE"));
ok("Dashboard: breakdown fee row, breakdown/chart/year footnotes, Extra Spending and Tax set-aside are labelled",
  dashboardSrc.includes("label={platformFeeTotalLabel(rangeFeeSummary, t)}")
  // ETSY-SHIP-2 (25 Oct 2026): + the Etsy "postage cost not known" footnote in the breakdown → 5.
  && (dashboardSrc.match(/dashboard-estimate-footnote/g) || []).length === 5
  && dashboardSrc.includes("push(platformFeeLabel(block, t, settings)")
  && dashboardSrc.includes("ctIncludesEstimatedFees"));
ok("Dashboard: Revenue is the same block's revenue as the profit", dashboardSrc.includes("revenue: totals.revenue + block.revenue,"));
ok("Home: the money card carries the note and the fee row label", homeSrc.includes("estimatedFeeSummary(blocks, data.settings)")
  && (homeSrc.match(/\{footnote\}/g) || []).length === 2 && homeSrc.includes('platformFeeTotalLabel(feeSummary, t, "Platform fees")'));

// Gate follow-up: Order Value (paid + outstanding, net of refunds) is a different
// concept from revenue — the number stays, the definition is shown.
ok("Order list amount and customer order table say what the figure is (Order value: paid + outstanding)",
  read("components/OrderListCard.tsx").includes('title={studioT("Order value: paid + outstanding", displayLanguage)}')
  && read("app/customers/page.tsx").includes('title={t("Order value: paid + outstanding")}')
  && read("components/OrderListCard.tsx").includes("money(order.paidAmount + outstandingAmount"));
ok("the definition is translated (TR: Sipariş tutarı: ödenen + kalan; all 11 languages)",
  tr("Order value: paid + outstanding") === "Sipariş tutarı: ödenen + kalan"
  && ["Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]
    .every((lang) => studioT("Order value: paid + outstanding", lang) !== "Order value: paid + outstanding"));

if (failures.length) {
  console.log(`\n❌ GN-12 ORDER FINANCE: ${failures.length} of ${checks} failed`);
  process.exit(1);
}
console.log(`\n✅ GN-12 ORDER FINANCE GEÇTİ (${checks} kontrol)`);
