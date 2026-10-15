// Review 10–11 Oct, N01–N04 (web): the rules behind the fixes, against the real
// modules (no copies — see memory "tests that assert the bug").
//
//   N01  the date in the Quick Create box is the date that is saved
//   N02  the Dashboard's rows add up to its Net Profit
//   N03  the toolbar's Margin help text says what the figure is
//   N04  "active" / overdue on Home and the Dashboard pill = the board's live work
//
// Run: npx tsx scripts/check-review-n01-n05.mts
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "check-only-not-a-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-check";

const { productionWorkIsLive, DEFAULT_PRODUCTION_STAGES } = await import("@/lib/studioflow/production");
const { orderFinanceBlock, orderGrossMargin } = await import("@/lib/studioflow/finance");
const { defaultQuickCreateDueDate, quickCreateDefaultDays, quickCreateDueHint } = await import("@/components/QuickCreateProjectDialog");
const { studioT } = await import("@/lib/studioflow/language");

let checks = 0;
const failures: string[] = [];
function expect(name: string, actual: unknown, wanted: unknown) {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
}

// ---------------------------------------------------------------- N01
const noon = new Date(2026, 9, 15, 12, 0);
expect("N01 default 30 days from 15 Oct", defaultQuickCreateDueDate(30, noon), "2026-11-14");
expect("N01 default 45 days from 15 Oct", defaultQuickCreateDueDate(45, noon), "2026-11-29");
expect("N01 late evening is still the person's own today", defaultQuickCreateDueDate(30, new Date(2026, 9, 15, 23, 59)), "2026-11-14");
expect("N01 missing setting falls back to the Settings default (30)", defaultQuickCreateDueDate(undefined, noon), "2026-11-14");
expect("N01 zero is not a turnaround", defaultQuickCreateDueDate(0, noon), "2026-11-14");
expect("N01 clamps to 730 days", defaultQuickCreateDueDate(5000, noon), defaultQuickCreateDueDate(730, noon));
expect("N01 days shown in the hint", quickCreateDefaultDays(undefined), 30);
const t = (text: string) => text;
const today = new Date();
const plus = (days: number) => defaultQuickCreateDueDate(days, today);
expect("N01 hint for the untouched default",
  quickCreateDueHint(plus(30), 30, t), "Starts at your default delivery time (30 days from today). Pick another date if you need to.");
expect("N01 hint for a cleared box (the default is what is sent)",
  quickCreateDueHint("", 30, t), "Starts at your default delivery time (30 days from today). Pick another date if you need to.");
expect("N01 hint for the Schedule board's fortnight", quickCreateDueHint(plus(14), 30, t), "Due 14 days from today.");
expect("N01 hint for tomorrow", quickCreateDueHint(plus(1), 30, t), "Tomorrow");

// ---------------------------------------------------------------- N02
// The emulator dataset (rig/seed-rv.cjs): stored fee/VAT that disagree with the
// engine, a refund, a shop's unclaimed tax and a margin-scheme sale.
const settings = {
  feePercentage: 3, defaultTaxRate: 20, taxCalculationType: "Revenue", vatRegistered: true,
  pricesIncludeVat: true, vatMethod: "standard", taxMilestoneEnabled: false, taxMilestoneDate: 0
} as never;
const base = { customerName: "", designName: "", watchRef: "", countsTowardBalance: true, finance: null, paymentDate: new Date(2026, 9, 5) };
const orders = [
  { id: "A", paidAmount: 1000, remainingAmount: 0, watchPurchasePrice: 200, paymentFee: 30, deliveryCost: 15, taxAmount: 166.67, customFields: { "financialExpense::Packaging": "25" } },
  { id: "B", paidAmount: 525, remainingAmount: 1225, watchPurchasePrice: 0, paymentFee: 15.75, deliveryCost: 0, taxAmount: 87.5, customFields: {} },
  { id: "C", paidAmount: 300, remainingAmount: 0, refundedAmount: 100, watchPurchasePrice: 120, paymentFee: 12, deliveryCost: 8, taxAmount: 66.67, customFields: {} },
  { id: "F", paidAmount: 240, remainingAmount: 0, watchPurchasePrice: 60, paymentFee: 7.2, platformFeeKnown: true, deliveryCost: 6, taxAmount: 40, taxAmountKnown: true, taxRate: 0, customFields: {} },
  { id: "G", paidAmount: 500, remainingAmount: 0, watchPurchasePrice: 300, paymentFee: 15, deliveryCost: 0, taxAmount: 83.33, taxType: "Profit", customFields: {} }
].map((order) => ({ ...base, ...order })) as never[];
const sum = (pick: (block: ReturnType<typeof orderFinanceBlock>, order: never) => number) =>
  Math.round(orders.reduce((total, order) => total + pick(orderFinanceBlock(order, settings), order), 0) * 100) / 100;
const revenue = sum((b) => b.revenue);
const rows = sum((b) => b.directCost) + sum((b) => b.otherExpenses) + sum((b) => b.platformFee) + sum((b) => b.deliveryCost) + sum((b) => b.vatDue) + sum((b) => b.refunded);
const profit = sum((b) => b.netProfit);
expect("N02 revenue (hand-computed)", revenue, 3890);
expect("N02 platform fee row (engine)", sum((b) => b.platformFee), 116.7);
expect("N02 VAT row (engine VAT due)", sum((b) => b.vatDue), 558.34);
expect("N02 refunds row", sum((b) => b.refunded), 100);
expect("N02 Net Profit (hand-computed)", profit, 2380.96);
expect("N02 Revenue − the rows = Net Profit", Math.round((revenue - rows) * 100) / 100, profit);
// Control: the stored fields the cards used to add up do NOT reconcile — the
// check can see the bug it was written for.
const stored = (field: string) => Math.round(orders.reduce((total, order) => total + Number((order as Record<string, unknown>)[field] ?? 0), 0) * 100) / 100;
const oldRows = sum((b) => b.directCost) + sum((b) => b.otherExpenses) + stored("paymentFee") + stored("deliveryCost") + stored("taxAmount");
expect("N02 control: the old stored-field rows miss by £250.92", Math.round((revenue - oldRows - profit) * 100) / 100, 250.92);

// ---------------------------------------------------------------- N03
expect("N03 margin = revenue − base cost", orders.map((order) => orderGrossMargin(order)), [800, 1750, 280, 180, 200]);
const helpKey = "Gross margin: sales minus base cost, for orders paid this month and this year. Platform fees, shipping, VAT, extra spending and refunds are not deducted, and cancelled or refunded orders are left out — the Dashboard shows Net Profit.";
for (const language of ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]) {
  expect(`N03 margin help translated (${language})`, studioT(helpKey, language) !== helpKey, true);
}

// ---------------------------------------------------------------- N04
const stages = DEFAULT_PRODUCTION_STAGES.map((stage) => ({ ...stage }));
const steps = [{ id: "s-design", title: "Design" }, { id: "s-painting", title: "Painting" }] as never[];
const live = (order: Record<string, unknown>) => productionWorkIsLive(order as never, stages, steps);
expect("N04 dispatched in 2024, never marked delivered → not live (Done lane)", live({ designStatus: "Done", status: "Done", isDispatched: true }), false);
expect("N04 dispatched with a step still open → not live (board files it under Done)", live({ designStatus: "Done", status: "In Progress", isDispatched: true }), false);
expect("N04 moved to Done by hand → not live", live({ productionStageOverride: "done" }), false);
expect("N04 delivered → not live", live({ designStatus: "Done", status: "Done", isDelivered: true }), false);
expect("N04 in production → live", live({ designStatus: "Done", status: "In Progress" }), true);
expect("N04 made, not sent (Ready to Ship) → live", live({ designStatus: "Done", status: "Done" }), true);
expect("N04 not started → live", live({}), true);
expect("N04 blocked beats dispatched → live", live({ isDispatched: true, productionBlocker: { reason: "supplier_delay" } }), true);

if (failures.length) {
  console.error(`check-review-n01-n05: ${failures.length} of ${checks} checks FAIL`);
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log(`check-review-n01-n05: all ${checks} checks pass — Quick Create saves the date it shows, the Dashboard rows add up to Net Profit (and the old stored-field rows provably did not), the margin help names what it adds, and Home/Dashboard "active" is the board's live work.`);
