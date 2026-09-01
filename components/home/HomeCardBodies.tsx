"use client";

import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { resolveProductionStage } from "@/lib/studioflow/production";
import { HomeActionIcon, HomeActivityIcon, HomeTileIcon, type HomeActionIconName, type HomeActivityIconName, type HomeTileIconName } from "@/components/home/HomeActionIcons";
import { homePeriodRange, type HomeCardPeriod, type HomeCardSize } from "@/lib/studioflow/homeCards";
import {
  adjustedDashboardNetProfit,
  baseCostTotal,
  customExpenseTotal,
  orderSalesTotal,
} from "@/lib/studioflow/finance";
import type { HomeData } from "@/lib/studioflow/useHomeData";
import type { ScheduleOrderItem } from "@/lib/studioflow/firestore";
import type { InventoryItem } from "@/lib/studioflow/inventory";
import type { StudioMoneySettings } from "@/lib/studioflow/money";
import { formatStudioMoney, moneySymbol } from "@/lib/studioflow/money";

/**
 * The eleven card bodies.
 *
 * Every one of them follows the same rule from §5: show the single most
 * important thing in its own area and hand off. The size variants are not the
 * same card scaled — §9 and §10 are explicit that a small card is one summary,
 * a medium card is the distribution, and a large card is the flow. Rendering a
 * shrunken desktop card on a small tile is the thing the spec forbids.
 */

export type CardBodyProps = {
  size: HomeCardSize;
  /** The range the card's totals cover; only the money cards read it. */
  period: HomeCardPeriod;
  data: HomeData;
  t: (text: string) => string;
  moneySettings: StudioMoneySettings;
  hideNumbers: boolean;
  onQuickAction?: (action: QuickActionId) => void;
  /** Which slice of the activity feed to show. Only the 2x2 activity card
   *  offers the pills; every other size and card ignores it. */
  activityFilter?: ActivityFilterId;
};

/** The filter pills on the wide-open activity card, as the reference sheet
 *  draws them. Client-side over rows already loaded and already permission
 *  filtered — a pill narrows what you look at, never what you may see. */
export const ACTIVITY_FILTERS: Array<{ id: ActivityFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "orders", label: "Orders" },
  { id: "production", label: "Production" },
  { id: "payments", label: "Payments" },
  { id: "files", label: "Files" }
];

export type ActivityFilterId = "all" | "orders" | "production" | "payments" | "files";

const ACTIVITY_FILTER_MATCH: Record<Exclude<ActivityFilterId, "all">, RegExp> = {
  orders: /order|estimate|delivery|dispatch|shipped/,
  production: /production|status|stage|schedule|reminder/,
  payments: /payment|refund|invoice_paid|bank_/,
  files: /file|upload|document|note/
};

export function activityMatchesFilter(type: string, filter: ActivityFilterId): boolean {
  if (filter === "all") return true;
  return ACTIVITY_FILTER_MATCH[filter].test(String(type || "").toLowerCase());
}

export type QuickActionId =
  | "order" | "customer" | "note" | "file" | "inventory" | "reviewSpending" | "receipt" | "aiReply";

/** Respects the price-privacy toggle: hidden means hidden everywhere. */
function cash(value: number, hide: boolean, settings: StudioMoneySettings) {
  if (hide) return "••••";
  return formatStudioMoney(value, settings);
}

/* ------------------------------------------------------------------ Money */

export function MoneyCardBody({ size, period, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  // The header says which window these totals cover, so they have to actually
  // cover it — same rule the Dashboard applies, against the payment date.
  const { start, end } = homePeriodRange(period);
  const orders = data.financeOrders.filter((order) =>
    order.countsTowardBalance !== false &&
    order.paymentDate !== null && order.paymentDate >= start && order.paymentDate <= end);
  if (orders.length === 0) return null;

  const money = (value: number) => cash(value, hideNumbers, moneySettings);
  const revenue = orders.reduce((sum, o) => sum + orderSalesTotal(o), 0);
  const received = orders.reduce((sum, o) => sum + o.paidAmount, 0);
  const outstanding = orders.reduce((sum, o) => sum + o.remainingAmount, 0);
  // The Dashboard's rule, not a second one: base cost only when the workspace
  // counts it, plus its own extra expense lines, then fee, shipping and VAT.
  // Home was leaving the extra spending out and reporting a higher profit than
  // the Dashboard for the same orders.
  const costs = orders.reduce((sum, o) => sum + baseCostTotal(o, data.settings) + customExpenseTotal(o, data.settings), 0);
  const fees = orders.reduce((sum, o) => sum + o.paymentFee, 0);
  const shipping = orders.reduce((sum, o) => sum + o.deliveryCost, 0);
  const vat = orders.reduce((sum, o) => sum + o.taxAmount, 0);
  const profit = orders.reduce((sum, o) => sum + adjustedDashboardNetProfit(o, data.settings), 0);

  // 1x1: the one number, the two that qualify it, and how much of revenue the
  // costs eat — never the bank feed's transactions (§7).
  if (size === "1x1") {
    const costShare = revenue > 0 ? Math.min(100, (costs / revenue) * 100) : 0;
    return (
      <div className="home-money">
        <p className="home-metric-label">{t("Net profit")}</p>
        <strong className={`home-metric-value ${profit >= 0 ? "is-positive" : "is-negative"}`}>{money(profit)}</strong>
        <div className="home-split-pair">
          <span><em>{t("Revenue")}</em><b className="is-positive">{money(revenue)}</b></span>
          <span><em>{t("Outstanding")}</em><b className="is-info">{money(outstanding)}</b></span>
        </div>
        <div className="home-ratio">
          <span className="home-ratio-head"><em>{t("Revenue")}</em><em>{t("Costs")}</em></span>
          <span className="home-ratio-bar" aria-hidden="true">
            <i className="is-revenue" style={{ width: `${Math.max(0, 100 - costShare)}%` }} />
            <i className="is-costs" style={{ width: `${costShare}%` }} />
          </span>
          <span className="home-ratio-foot"><b className="is-revenue">{money(revenue)}</b><b className="is-costs">{money(costs)}</b></span>
        </div>
      </div>
    );
  }

  // "VAT" rather than the Dashboard's "VAT Amount": this row has six things to
  // fit across one card and the longer label is what pushed the last two into
  // each other. The Dashboard keeps its own wording — a summary card there has
  // the room and the context to be explicit.
  const deductions = [
    { label: "Costs", value: costs },
    { label: "Platform fees", value: fees },
    { label: "Shipping", value: shipping },
    { label: "VAT", value: vat },
  ];

  // 2x1: the four headline figures, then how revenue becomes profit.
  if (size === "2x1") {
    return (
      <div className="home-money is-wide">
        <div className="home-stat-row is-ruled">
          <Stat label={t("Revenue")} value={money(revenue)} tone="positive" />
          <Stat label={t("Payments received")} value={money(received)} tone="positive" />
          <Stat label={t("Outstanding")} value={money(outstanding)} tone="info" />
          <Stat label={t("Net profit")} value={money(profit)} tone={profit >= 0 ? "positive" : "warning"} />
        </div>
        {/* How revenue becomes profit, read left to right. The two arrows are
            the point of the row: without them it is six figures in a line and
            nothing says the middle four are taken OUT of the first to reach the
            last. */}
        <ol className="home-waterfall">
          <li className="is-end"><em>{t("Revenue")}</em><b className="is-positive">{money(revenue)}</b></li>
          <li className="home-waterfall-arrow" aria-hidden="true">→</li>
          {deductions.map((entry) => (
            <li key={entry.label} className="is-deduction">
              <em><span className="home-minus" aria-hidden="true">−</span><span>{t(entry.label)}</span></em>
              <b>{money(entry.value)}</b>
            </li>
          ))}
          <li className="home-waterfall-arrow" aria-hidden="true">→</li>
          <li className="is-end"><em>{t("Net profit")}</em><b className="is-positive">{money(profit)}</b></li>
        </ol>
      </div>
    );
  }

  // 2x2: the figures, the shape of the month, and where the money went.
  const margin = revenue > 0 ? Math.max(0, Math.min(100, (profit / revenue) * 100)) : 0;
  return (
    <div className="home-money is-large">
      <div className="home-tile-row">
        {/* MoneyTile has always taken an icon and these four never passed one,
            so the tile drew an empty pale disc — the "unfinished placeholder"
            look the reference replaces with a mark that says what the figure
            is. */}
        <MoneyTile label={t("Revenue")} value={money(revenue)} tone="green" icon="trendUp" />
        <MoneyTile label={t("Payments received")} value={money(received)} tone="green" icon="paid" />
        <MoneyTile label={t("Outstanding")} value={money(outstanding)} tone="blue" icon="awaiting" />
        <MoneyTile label={t("Net profit")} value={money(profit)} tone={profit >= 0 ? "green" : "red"} icon="margin" />
      </div>
      <div className="home-money-panels">
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Revenue & profit")}</p>
          <RevenueProfitChart orders={orders} t={t} moneySettings={moneySettings} />
        </div>
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Cost breakdown")}</p>
          <ul className="home-cost-list">
            {deductions.map((entry, index) => (
              <li key={entry.label}>
                {/* A coloured dot says "this row is a different colour". An
                    icon says what the row IS, which is what the four labels
                    beside them are already doing and the dot was not. */}
                <span className={`home-cost-dot tone-${index}`} aria-hidden="true">
                  <HomeTileIcon name={COST_ICONS[index] ?? "percent"} />
                </span>
                <em>{t(entry.label)}</em>
                <b>{money(entry.value)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="home-margin-strip">
        <span className="home-eyebrow is-strong">{t("Margin")}</span>
        <span className="home-progress"><span style={{ width: `${margin}%` }} /></span>
        <b>{margin.toFixed(0)}%</b>
      </div>
    </div>
  );
}

function MoneyTile({
  label, value, tone, sub, icon,
}: {
  label: string; value: string; tone: "green" | "blue" | "orange" | "red" | "neutral"; sub?: string; icon?: HomeTileIconName;
}) {
  return (
    <div className={`home-money-tile tone-${tone}`}>
      <span className="home-money-tile-dot" aria-hidden="true">
        {icon ? <HomeTileIcon name={icon} /> : null}
      </span>
      <em>{label}</em>
      <b>{value}</b>
      {sub ? <i>{sub}</i> : null}
    </div>
  );
}

/**
 * Revenue and profit over the last twelve weeks, from the orders themselves.
 * Drawn inline rather than with a chart library: it is two polylines and two
 * fills, and a library would be a bigger download than the whole screen.
 */
/** In the same order as `deductions`: what was spent, what the platform took,
 *  what the courier took, what the taxman is owed. */
const COST_ICONS: HomeTileIconName[] = ["order", "percent", "out", "calculator"];

function RevenueProfitChart({ orders, t, moneySettings }: {
  orders: HomeData["financeOrders"];
  t: (text: string) => string;
  moneySettings: StudioMoneySettings;
}) {
  const weeks = 12;
  const now = new Date();
  const buckets = Array.from({ length: weeks }, (_unused, index) => {
    // Each bucket keeps the date it covers, because a chart with no dates on
    // it is a shape rather than a reading.
    const end = new Date(now);
    end.setDate(now.getDate() - (weeks - 1 - index) * 7);
    return { revenue: 0, profit: 0, end };
  });
  for (const order of orders) {
    if (!order.paymentDate) continue;
    const weeksAgo = Math.floor((now.getTime() - order.paymentDate.getTime()) / (7 * 24 * 3600 * 1000));
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    const bucket = buckets[weeks - 1 - weeksAgo];
    const value = order.paidAmount + order.remainingAmount;
    bucket.revenue += value;
    bucket.profit += value - order.watchPurchasePrice - order.paymentFee - order.deliveryCost - order.taxAmount;
  }

  if (buckets.every((b) => b.revenue === 0)) {
    return <p className="home-card-note">{t("Not enough history yet.")}</p>;
  }

  // A grid the eye can measure against. The chart had none — no scale, no
  // dates, and preserveAspectRatio="none" stretching the line until a quiet
  // month looked like a cliff. A reader could tell the two lines apart and
  // nothing else about them.
  const rawPeak = Math.max(1, ...buckets.map((b) => Math.max(b.revenue, b.profit)));
  const step = niceAxisStep(rawPeak / 4);
  const top = Math.ceil(rawPeak / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_unused, i) => i * step);

  // Room on the left for the scale and under it for the dates; the plot keeps
  // what is left. Proportional, so the line is never distorted.
  const W = 320, H = 158, L = 40, R = 6, TOP = 8, B = 22;
  const plotW = W - L - R;
  const plotH = H - TOP - B;
  const x = (index: number) => L + (index / (weeks - 1)) * plotW;
  const y = (value: number) => TOP + plotH - (Math.max(0, value) / top) * plotH;
  const line = (key: "revenue" | "profit") => buckets.map((b, i) => `${x(i)},${y(b[key])}`).join(" ");
  const area = (key: "revenue" | "profit") =>
    `${L},${TOP + plotH} ${line(key)} ${L + plotW},${TOP + plotH}`;

  const shortMoney = (value: number) => compactMoney(value, moneySettings);
  const shortDate = (date: Date) =>
    date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  // Three dates, not twelve: first, middle, last is enough to say what window
  // this is, and twelve would overlap into a smudge.
  const dateAt = [0, Math.floor((weeks - 1) / 2), weeks - 1];

  return (
    <>
      <p className="home-chart-key">
        <span><i className="is-revenue" aria-hidden="true" />{t("Revenue")}</span>
        <span><i className="is-profit" aria-hidden="true" />{t("Net profit")}</span>
      </p>
      <svg className="home-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Revenue & profit")}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="home-chart-grid" x1={L} y1={y(tick)} x2={W - R} y2={y(tick)} />
            <text className="home-chart-tick" x={L - 7} y={y(tick) + 3.5} textAnchor="end">{shortMoney(tick)}</text>
          </g>
        ))}
        <polygon className="home-chart-area is-revenue" points={area("revenue")} />
        <polygon className="home-chart-area is-profit" points={area("profit")} />
        <polyline className="home-chart-line is-revenue" points={line("revenue")} />
        <polyline className="home-chart-line is-profit" points={line("profit")} />
        {dateAt.map((index, position) => (
          <text
            key={index}
            className="home-chart-tick"
            x={x(index)}
            y={H - 6}
            textAnchor={position === 0 ? "start" : position === 2 ? "end" : "middle"}
          >
            {shortDate(buckets[index].end)}
          </text>
        ))}
      </svg>
    </>
  );
}

/** 1, 2 or 5 times a power of ten — the steps a person reads without doing
 *  arithmetic. An axis at £1,317 intervals is technically correct and useless. */
function niceAxisStep(rough: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, rough))));
  const normalised = rough / magnitude;
  const stepped = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return stepped * magnitude;
}

/** £8K rather than £8,000.00: an axis label has to be read sideways, at a
 *  glance, in the width of a gutter. */
function compactMoney(value: number, settings: StudioMoneySettings): string {
  const symbol = moneySymbol(settings);
  if (value >= 1_000_000) return `${symbol}${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${symbol}${Math.round(value / 100) / 10}K`.replace(".0K", "K");
  return `${symbol}${Math.round(value)}`;
}

/* ---------------------------------------------------------------- Banking */

export function BankingCardBody({ size, period, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const transactions = data.bankTransactions;
  if (transactions.length === 0) return null;

  const money = (value: number) => cash(value, hideNumbers, moneySettings);
  // The header offers a range, so the totals have to cover it — the month was
  // hardcoded here while the card said nothing about which month it meant.
  const { start, end } = homePeriodRange(period);
  const inRange = transactions.filter((tx) =>
    tx.bookingDate !== null && tx.bookingDate >= start && tx.bookingDate <= end);
  const incoming = inRange.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const spent = inRange.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const toReview = transactions.filter((tx) => !tx.reviewed).length;
  // Not scoped to the range, and deliberately: this is a queue, not a
  // statistic. A receipt you still owe from March does not stop being owed
  // because the card is showing April, and the label never claims a period.
  const missingReceipts = transactions.filter((tx) => tx.amount < 0 && !tx.hasReceipt).length;
  // "Incoming this month" beside a header reading "This year" is just wrong,
  // and at All time there is no window to name at all.
  const incomingLabel = period === "month" ? "Incoming this month"
    : period === "year" ? "Incoming this year" : "Incoming";
  const spentLabel = period === "month" ? "Spent this month"
    : period === "year" ? "Spent this year" : "Spent";

  // 1x1, as the sheet draws it: the freshness of the feed, then what left the
  // account this month, then what came in against what still needs a receipt.
  // The read-only promise and the range select both belong beside the title,
  // and both are hidden at this size — the square has no room for either and
  // was rendering the card's own name as an ellipsis to make space.
  if (size === "1x1") {
    return (
      <div className="home-money">
        <SyncLine lastSync={data.bankLastSync} unhealthy={data.bankNeedsAttention} t={t} />
        <p className="home-metric-label">{t(spentLabel)}</p>
        {/* Spending is not a loss and not an error. It is what a workshop does
            every week, and painting it red with a minus made an ordinary month
            look like a warning — the label already says "Spent", so the sign
            was saying it twice and the colour was saying something untrue. */}
        <strong className="home-metric-value">{money(spent)}</strong>
        <div className="home-split-pair">
          <span><em>{t("Incoming")}</em><b className="is-positive">+{money(incoming)}</b></span>
          <span>
            <em>{t("Missing receipts")}</em>
            <b className={missingReceipts > 0 ? "is-negative" : ""}>{missingReceipts}</b>
          </span>
        </div>
      </div>
    );
  }

  // The fourth tile is what the workspace pays on repeat, as the sheet has it —
  // the review queue is already the card's link, and repeating what the second
  // tile implies would waste the slot.
  const tiles = (
    <div className="home-tile-row">
      <MoneyTile icon="in" label={t(incomingLabel)} value={`+${money(incoming)}`} tone="green" />
      <MoneyTile icon="out" label={t(spentLabel)} value={money(spent)} tone="neutral" />
      <MoneyTile icon="receiptAlert" label={t("Missing receipts")} value={String(missingReceipts)}
                 tone={missingReceipts > 0 ? "red" : "blue"} />
      <MoneyTile icon="recurring" label={t("Fixed")}
                 value={data.bankMonthlyFixed > 0 ? `≈\u00a0${money(data.bankMonthlyFixed)}` : "—"}
                 sub={data.bankMonthlyFixed > 0 ? t("per month") : undefined} tone="blue" />
    </div>
  );

  const recentRows = transactions.slice(0, 3);

  // 2x1, as the sheet draws it: the three figures across the top, then the last
  // few counterparties beside what the workspace pays on repeat and how fresh
  // the feed is.
  if (size === "2x1") {
    return (
      <div className="home-money is-wide is-bank">
        <div className="home-figure-row">
          <span><em>{t(incomingLabel)}</em><b className="is-positive">+{money(incoming)}</b></span>
          <span><em>{t(spentLabel)}</em><b>{money(spent)}</b></span>
          <span>
            <em>{t("Missing receipts")}</em>
            <b className={missingReceipts > 0 ? "is-warning" : ""}>{missingReceipts}</b>
          </span>
        </div>
        <div className="home-bank-split">
          <div>
            <p className="home-eyebrow is-strong">{t("Recent transactions")}</p>
            <ul className="home-cost-list">
              {recentRows.map((tx) => (
                <li key={tx.id}>
                  <span className="home-avatar" aria-hidden="true">{(tx.name || "?").slice(0, 1).toUpperCase()}</span>
                  <em>{tx.name || t("Transactions")}</em>
                  <b className={tx.amount < 0 ? "" : "is-positive"}>
                    {tx.amount < 0 ? "−" : "+"}{money(Math.abs(tx.amount))}
                  </b>
                </li>
              ))}
            </ul>
          </div>
          <div className="home-bank-aside">
            {data.bankMonthlyFixed > 0 ? (
              <p className="home-aside-line">
                <span className="home-aside-mark" aria-hidden="true">£</span>
                {t("Fixed ≈ {amount}/month").replace("{amount}", money(data.bankMonthlyFixed))}
              </p>
            ) : null}
            <SyncLine lastSync={data.bankLastSync} unhealthy={data.bankNeedsAttention} t={t} />
          </div>
        </div>
      </div>
    );
  }

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const year = transactions.filter((tx) => tx.bookingDate && tx.bookingDate >= yearStart);
  const yearIn = year.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const yearOut = year.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return (
    <div className="home-money is-large">
      <SyncLine lastSync={data.bankLastSync} unhealthy={data.bankNeedsAttention} t={t} />
      {tiles}
      <div className="home-money-panels">
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Bank activity")}</p>
          <BankActivityChart transactions={transactions} t={t} symbol={moneySymbol(moneySettings)} />
        </div>
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Recent transactions")}</p>
          <ul className="home-cost-list">
            {recentRows.map((tx) => (
              <li key={tx.id}>
                <span className="home-avatar" aria-hidden="true">{(tx.name || "?").slice(0, 1).toUpperCase()}</span>
                <em>{tx.name || t("Transactions")}</em>
                <b className={tx.amount < 0 ? "" : "is-positive"}>
                  {tx.amount < 0 ? "−" : "+"}{money(Math.abs(tx.amount))}
                </b>
              </li>
            ))}
          </ul>
          <p className="home-year-line">
            {t("This year")}: <em>{t("In")}</em> <b className="is-positive">{money(yearIn)}</b>
            {" · "}<em>{t("Out")}</em> <b>{money(yearOut)}</b>
          </p>
        </div>
      </div>
      {missingReceipts > 0 ? (
        <div className="home-alert-strip">
          <span className="home-alert-dot" aria-hidden="true">!</span>
          <span>
            <strong>{t("{count} transactions need a receipt").replace("{count}", String(missingReceipts))}</strong>
            <em>{t("We couldn't find a receipt for {count} transactions.").replace("{count}", String(missingReceipts))}</em>
          </span>
          <Link className="home-alert-link" href="/bank?tab=receipts">
            {t("Go to banking")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/**
 * How fresh the feed is. The real signal is the connection's own lastSyncedAt —
 * a live snapshot only says the listener fired, not that the bank handed
 * anything over, which is exactly the thing that made "Connected" misleading.
 */
function SyncLine({ lastSync, unhealthy, t }: { lastSync: Date | null; unhealthy: boolean; t: (text: string) => string }) {
  if (!lastSync) {
    return (
      <p className={`home-sync-line${unhealthy ? " is-warning" : ""}`}>
        <span aria-hidden="true">{unhealthy ? "\u26A0" : "\u21BB"}</span>
        {t("Never synced")}
      </p>
    );
  }
  const days = Math.floor((Date.now() - lastSync.getTime()) / 86400000);
  const hours = Math.floor((Date.now() - lastSync.getTime()) / 3600000);
  const stale = days >= 2 || unhealthy;
  const label =
    days >= 1 ? t("Last synced {n} days ago").replace("{n}", String(days))
    : hours >= 1 ? t("Last synced {n}h ago").replace("{n}", String(hours))
    : t("Last synced just now");
  return (
    <p className={`home-sync-line${stale ? " is-warning" : ""}`}>
      <span aria-hidden="true">{stale ? "\u26A0" : "\u21BB"}</span>
      {label}
    </p>
  );
}

/** Money in and money out, week by week, from the feed itself. */
function BankActivityChart({ transactions, t, symbol }: {
  transactions: HomeData["bankTransactions"]; t: (text: string) => string; symbol: string;
}) {
  const weeks = 12;
  const now = new Date();
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const end = new Date(now);
    end.setDate(now.getDate() - (weeks - 1 - index) * 7);
    return { incoming: 0, spent: 0, at: end };
  });
  for (const tx of transactions) {
    if (!tx.bookingDate) continue;
    const weeksAgo = Math.floor((now.getTime() - tx.bookingDate.getTime()) / (7 * 24 * 3600 * 1000));
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    const bucket = buckets[weeks - 1 - weeksAgo];
    if (tx.amount >= 0) bucket.incoming += tx.amount;
    else bucket.spent += Math.abs(tx.amount);
  }
  if (buckets.every((b) => b.incoming === 0 && b.spent === 0)) {
    return <p className="home-card-note">{t("Not enough history yet.")}</p>;
  }

  // Pick the gridline STEP first and let the top follow, so every line lands on
  // a number a person would write. Rounding the top on its own and then cutting
  // it into quarters puts the odd numbers straight back: a peak of 8,600 became
  // a top of 9,000 and gridlines at 2.3K, 4.5K and 6.8K.
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.incoming, b.spent)));
  const niceStep = (raw: number) => {
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const scaled = raw / magnitude;
    return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10) * magnitude;
  };
  const step = niceStep(peak / 5);
  const top = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const shortMoney = (value: number) =>
    value >= 1000 ? `${Math.round(value / 100) / 10}K` : String(Math.round(value));

  const width = 100;
  const height = 46;
  const line = (key: "incoming" | "spent") =>
    buckets.map((b, i) => `${(i / (weeks - 1)) * width},${height - (b[key] / top) * height}`).join(" ");
  const dayMonth = (date: Date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <>
      <p className="home-chart-key">
        <span><i className="is-profit" aria-hidden="true" />{t("Incoming")}</span>
        <span><i className="is-spent" aria-hidden="true" />{t("Spent")}</span>
      </p>
      <div className="home-chart-frame">
        <ul className="home-chart-axis" aria-hidden="true"
              style={{ "--axis-symbol": `"${symbol}"` } as CSSProperties}>
          {[...ticks].reverse().map((value) => <li key={value}>{shortMoney(value)}</li>)}
        </ul>
        <div className="home-chart-plot">
          <svg className="home-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
               aria-label={t("Bank activity")}>
            {ticks.map((value) => (
              <line key={value} className="home-chart-grid" x1="0" x2={width}
                    y1={height - (value / top) * height} y2={height - (value / top) * height} />
            ))}
            <polygon className="home-chart-area is-profit" points={`0,${height} ${line("incoming")} ${width},${height}`} />
            <polyline className="home-chart-line is-profit" points={line("incoming")} />
            <polyline className="home-chart-line is-spent" points={line("spent")} />
          </svg>
          <ul className="home-chart-dates" aria-hidden="true">
            {[0, 3, 6, 9, 11].map((index) => <li key={index}>{dayMonth(buckets[index].at)}</li>)}
          </ul>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- Inventory */

export function InventoryCardBody({ size, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const summary = data.inventory;
  if (!summary) return null;
  const money = (value: number) => cash(value, hideNumbers, moneySettings);

  if (size === "1x1") {
    // The sheet reads: what the stock is worth, then the three counts that say
    // whether it needs attention, then the mix as one bar. Reserved is the third
    // — stock that is spoken for is not stock you can sell.
    const items = summary.uniqueCount + summary.quantityCount;
    const healthy = Math.max(0, items - summary.lowStockCount - summary.incomingCount - summary.reservedCount);
    const share = (value: number) => (items > 0 ? value / items : 0);
    return (
      <div className="home-money is-stock">
        <p className="home-metric-label">{t("total value")}</p>
        <strong className="home-metric-value is-info">{money(summary.totalValue)}</strong>
        <div className="home-figure-row is-ruled">
          <span>
            <em>{t("low stock")}</em>
            <b className={summary.lowStockCount > 0 ? "is-negative" : ""}>{summary.lowStockCount}</b>
          </span>
          <span>
            <em>{t("incoming")}</em>
            <b className={summary.incomingCount > 0 ? "is-warning" : ""}>{summary.incomingCount}</b>
          </span>
          <span>
            <em>{t("Reserved")}</em>
            <b className={summary.reservedCount > 0 ? "is-warning" : ""}>{summary.reservedCount}</b>
          </span>
        </div>
        {items > 0 ? (
          <span className="home-mix-bar" aria-hidden="true">
            <i className="tone-green" style={{ flex: `${share(healthy)} 1 0` }} />
            <i className="tone-orange" style={{ flex: `${share(summary.incomingCount)} 1 0` }} />
            <i className="tone-red" style={{ flex: `${share(summary.lowStockCount)} 1 0` }} />
            <i className="tone-slate" style={{ flex: `${share(summary.reservedCount)} 1 0` }} />
          </span>
        ) : null}
      </div>
    );
  }

  const tiles = (
    <div className="home-tile-row">
      <MoneyTile label={t("total value")} value={money(summary.totalValue)} tone="blue" />
      <MoneyTile label={t("Unique items")} value={String(summary.uniqueCount)} tone="blue" sub={money(summary.uniqueValue)} />
      <MoneyTile label={t("Quantity stock")} value={String(summary.quantityCount)} tone="blue" sub={money(summary.quantityValue)} />
      <MoneyTile label={t("low stock")} value={String(summary.lowStockCount)} tone={summary.lowStockCount > 0 ? "orange" : "blue"} />
    </div>
  );

  if (size === "2x1") {
    // The sheet's wide card: what the stock is worth and how it splits, ruled
    // apart, then the two holdings that are not free stock — reserved against
    // orders, and what is still on its way. Both carry their count AND their
    // value; a bare amount does not say how much of the shelf it is.
    return (
      <div className="home-money is-wide is-stock">
        <div className="home-figure-row is-quad">
          <span>
            <em>{t("total value")}</em>
            <b className="is-total">{money(summary.totalValue)}</b>
          </span>
          <span>
            <em>{t("Unique items")}</em>
            <b>{summary.uniqueCount}</b>
            <i>{money(summary.uniqueValue)}</i>
          </span>
          <span>
            <em>{t("Quantity stock")}</em>
            <b>{summary.quantityCount}</b>
            <i>{money(summary.quantityValue)}</i>
          </span>
          <span>
            <em>{t("low stock")}</em>
            <b className={summary.lowStockCount > 0 ? "is-negative" : ""}>{summary.lowStockCount}</b>
          </span>
        </div>
        <ul className="home-holding-row">
          <li className="is-reserved">
            <span className="home-holding-badge" aria-hidden="true"><HomeTileIcon name="reserved" /></span>
            <span className="home-holding-name">
              <strong>{t("Reserved")}</strong>
              <em>{summary.reservedCount} {t("items")}</em>
            </span>
            <b>{money(summary.reservedValue)}</b>
          </li>
          <li className="is-incoming">
            <span className="home-holding-badge" aria-hidden="true"><HomeTileIcon name="incomingStock" /></span>
            <span className="home-holding-name">
              <strong>{t("incoming")}</strong>
              <em>{summary.incomingCount} {t("items")}</em>
            </span>
            <b>{money(summary.incomingValue)}</b>
          </li>
        </ul>
      </div>
    );
  }

  // Unique and quantity are different things and the split is the point (§8).
  const total = summary.uniqueValue + summary.quantityValue;
  const uniqueShare = total > 0 ? (summary.uniqueValue / total) * 100 : 0;
  // What actually needs a decision, worst first: nothing on the shelf, then
  // spoken for, then still on its way. The counts above say how many; this says
  // which — a card that only counts problems cannot be acted on.
  const attention = data.inventoryItems
    .map((item) => {
      const onHand = item.quantity?.onHand ?? 0;
      const reserved = item.quantity?.reserved ?? 0;
      const incoming = item.quantity?.incoming ?? 0;
      const low = item.lowStockAt > 0 && onHand <= item.lowStockAt;
      if (low) return { item, kind: "low" as const, rank: 0 };
      if (reserved > 0) return { item, kind: "reserved" as const, rank: 1 };
      if (incoming > 0) return { item, kind: "incoming" as const, rank: 2 };
      return null;
    })
    .filter((entry): entry is { item: InventoryItem; kind: "low" | "reserved" | "incoming"; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const kindLabel = { low: t("Low stock"), reserved: t("Reserved"), incoming: t("Incoming") };
  return (
    <div className="home-money is-large is-stock">
      <div className="home-tile-row">
        <MoneyTile label={t("total value")} value={money(summary.totalValue)} tone="blue" />
        <MoneyTile label={t("Unique items")} value={String(summary.uniqueCount)} tone="blue" sub={money(summary.uniqueValue)} />
        <MoneyTile label={t("Quantity stock")} value={String(summary.quantityCount)} tone="blue" sub={money(summary.quantityValue)} />
        <MoneyTile label={t("low stock")} value={String(summary.lowStockCount)} tone={summary.lowStockCount > 0 ? "red" : "blue"} />
      </div>
      <div className="home-panel home-donut-panel">
        <Donut share={uniqueShare} />
        <ul className="home-donut-key">
          <li>
            <span className="home-cost-dot is-small tone-unique" aria-hidden="true" />
            <em>{t("Unique items")}</em>
            <b>{money(summary.uniqueValue)}</b>
          </li>
          <li>
            <span className="home-cost-dot is-small tone-quantity" aria-hidden="true" />
            <em>{t("Quantity stock")}</em>
            <b>{money(summary.quantityValue)}</b>
          </li>
        </ul>
      </div>
      <div className="home-panel is-flush">
        <p className="home-eyebrow is-strong">{t("Needs attention")}</p>
        {attention.length === 0 ? (
          <p className="home-card-note">{t("Nothing here yet.")}</p>
        ) : (
          <ul className="home-attention-list">
            {attention.map(({ item, kind }) => (
              <li key={item.id}>
                {item.photos?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="home-attention-thumb" src={item.photos[0]} alt="" loading="lazy" />
                ) : (
                  <span className="home-attention-thumb is-blank" aria-hidden="true">{item.name.slice(0, 1)}</span>
                )}
                <strong>{item.name}</strong>
                <span className={`home-attention-chip is-${kind}`}>{kindLabel[kind]}</span>
                <span className="home-attention-where">{item.location || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Two slices, drawn with one stroke-dasharray. */
function Donut({ share }: { share: number }) {
  const radius = 15.9155;
  return (
    <svg className="home-donut" viewBox="0 0 42 42" role="img" aria-hidden="true">
      <circle className="home-donut-track" cx="21" cy="21" r={radius} />
      <circle
        className="home-donut-value"
        cx="21" cy="21" r={radius}
        strokeDasharray={`${share} ${100 - share}`}
        strokeDashoffset="25"
      />
    </svg>
  );
}

/* ------------------------------------------------------ Orders/production */

/** A stage's colour follows its kind, not its position — a workspace may define
 *  any number of lanes and an index-keyed palette runs out. */
const STAGE_TONE: Record<string, string> = {
  ready: "green", active: "blue", blocked: "red", review: "purple", shipready: "green", done: "slate",
};

export function OrdersProductionCardBody({ size, data, t }: CardBodyProps) {
  const open = data.scheduleOrders.filter((order) => !order.isDelivered);
  if (open.length === 0) return null;

  // The stage is derived from the order's own steps against the workspace's own
  // stages — the same rule the Production screen applies, never a second one.
  const resolved = open.map((order) => ({
    order,
    stageId: resolveProductionStage(order, data.productionStages, data.productionSteps).stageId,
  }));
  const byStage = data.productionStages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    kind: stage.kind,
    count: resolved.filter((entry) => entry.stageId === stage.id).length,
  }));
  const late = open.filter((order) => order.dueDate && order.dueDate.getTime() < Date.now());

  if (size === "1x1") {
    // The square reads top to bottom: how many are live, how they are split,
    // then the split as one bar. The counts come from the workspace's own stage
    // kinds — never a fixed list of stage names.
    const byKind = (kind: string) =>
      byStage.filter((stage) => stage.kind === kind).reduce((sum, stage) => sum + stage.count, 0);
    const counts: { label: string; value: number; tone: string; icon: HomeTileIconName }[] = [
      { label: t("Ready"), value: byKind("ready"), tone: "green", icon: "ready" },
      { label: t("In production"), value: byKind("active"), tone: "blue", icon: "inProduction" },
      { label: t("Ready to ship"), value: byKind("shipready"), tone: "green", icon: "readyToShip" },
      { label: t("Overdue"), value: late.length, tone: late.length > 0 ? "red" : "slate", icon: "overdue" },
    ];
    const total = byStage.reduce((sum, stage) => sum + stage.count, 0);
    return (
      <div className="home-money is-square">
        <p className="home-lede">
          <strong>{open.length}</strong>
          <span>{t("active orders")}</span>
        </p>
        <div className="home-count-row">
          {counts.map((count) => (
            <div key={count.label} className={`home-count tone-${count.tone}`}>
              <em>{count.label}</em>
              <b>{count.value}</b>
              <span className="home-count-icon" aria-hidden="true"><HomeTileIcon name={count.icon} /></span>
            </div>
          ))}
        </div>
        <span className="home-mix-bar" aria-hidden="true">
          {byStage.filter((stage) => stage.count > 0).map((stage) => (
            <i
              key={stage.id}
              className={`tone-${STAGE_TONE[stage.kind] ?? "slate"}`}
              style={{ flex: `${total > 0 ? stage.count / total : 0} 1 0` }}
            />
          ))}
        </span>
      </div>
    );
  }

  const flow = (
    <ol className="home-flow">
      {byStage.map((stage) => (
        <li key={stage.id}>
          <span className={`home-flow-node tone-${STAGE_TONE[stage.kind] ?? "slate"}`} aria-hidden="true" />
          <em>{t(stage.title)}</em>
          <b className={`tone-${STAGE_TONE[stage.kind] ?? "slate"}`}>{stage.count}</b>
        </li>
      ))}
    </ol>
  );

  if (size === "2x1") {
    // The sheet's wide card: the stages as figures across the top, then the
    // orders that actually need a decision. Done is left out — finished work is
    // not a bottleneck, and its lane only narrowed the five that are.
    const lanes = byStage.filter((stage) => stage.kind !== "done");
    const priority = [...late, ...open.filter((o) => !late.includes(o))].slice(0, 3);
    return (
      <div className="home-money is-wide">
        <ol className="home-lane-row">
          {lanes.map((stage) => (
            <li key={stage.id} className={`tone-${STAGE_TONE[stage.kind] ?? "slate"}`}>
              <span className="home-lane-head">
                <i className="home-lane-dot" aria-hidden="true" />
                <em>{t(stage.title)}</em>
              </span>
              <b>{stage.count}</b>
            </li>
          ))}
        </ol>
        <ul className="home-order-list">
          {priority.map((order) => {
            const overdue = order.dueDate && order.dueDate.getTime() < Date.now();
            const days = order.dueDate
              ? Math.floor((Date.now() - order.dueDate.getTime()) / (24 * 3600 * 1000))
              : 0;
            const stage = byStage.find((entry) =>
              entry.id === resolved.find((r) => r.order.id === order.id)?.stageId);
            const name = order.customerName || order.designName || order.watchRef;
            return (
              <li key={order.id}>
                <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                  {order.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="home-order-thumb" src={order.previewImageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="home-order-thumb is-blank" aria-hidden="true">{name.slice(0, 1)}</span>
                  )}
                  <strong>{name}</strong>
                  <span className="home-order-design">{order.designName}</span>
                  {overdue ? (
                    <span className="home-chip is-late">
                      {days > 0 ? t("{days}d late").replace("{days}", String(days)) : t("Overdue")}
                    </span>
                  ) : <span />}
                  {stage ? (
                    <span className={`home-chip tone-${STAGE_TONE[stage.kind] ?? "slate"}`}>{t(stage.title)}</span>
                  ) : <span />}
                  <span className="home-order-chevron" aria-hidden="true">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const priority = [...late, ...open.filter((o) => !late.includes(o))].slice(0, 3);
  return (
    <div className="home-money is-large is-production">
      <div className="home-tile-row is-pair">
        <MoneyTile label={t("active orders")} value={String(open.length)} tone="blue" />
        <MoneyTile label={t("Overdue")} value={String(late.length)} tone={late.length > 0 ? "orange" : "blue"} />
      </div>
      <div className="home-panel">
        <p className="home-eyebrow is-strong">{t("Production flow")}</p>
        {flow}
      </div>
      <div className="home-panel is-flush">
        <p className="home-eyebrow is-strong">{t("Priority orders")}</p>
        <ul className="home-record-list">
          {priority.map((order) => {
            const overdue = order.dueDate && order.dueDate.getTime() < Date.now();
            const days = order.dueDate
              ? Math.floor((Date.now() - order.dueDate.getTime()) / (24 * 3600 * 1000))
              : 0;
            const stage = byStage.find((entry) =>
              entry.id === resolved.find((r) => r.order.id === order.id)?.stageId);
            return (
              <li key={order.id}>
                <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                  {order.customerName || order.designName || order.watchRef}
                </Link>
                {stage ? <span className={`home-chip tone-${STAGE_TONE[stage.kind] ?? "slate"}`}>{t(stage.title)}</span> : null}
                {overdue ? (
                  <span className="home-chip is-late">
                    {days > 0 ? t("{days}d late").replace("{days}", String(days)) : t("Overdue")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Schedule */

/// "24–30 Aug", or "28 Aug – 3 Sep" when the visible week straddles two months.
export function homeWeekRangeLabel() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const endLabel = end.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const startLabel = sameMonth
    ? String(start.getDate())
    : start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return sameMonth ? `${startLabel}–${endLabel}` : `${startLabel} – ${endLabel}`;
}

export function ScheduleCardBody({ size, data, t }: CardBodyProps) {
  // Dates and deadlines only — never production status again (§10).
  const open = data.scheduleOrders.filter((order) => !order.isDelivered && order.dueDate);
  if (open.length === 0) return null;
  const upcoming = [...open].sort((a, b) => (a.dueDate!.getTime()) - (b.dueDate!.getTime()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // The chip answers "when", never "how far along" — production status stays
  // out of this card (§10). A start still ahead of us beats the deadline,
  // because nothing is late on an order that has not begun yet. A weekday on
  // its own only reads unambiguously inside the coming week; past that it
  // takes a date.
  const startOfDayOf = (date: Date) => new Date(new Date(date).setHours(0, 0, 0, 0));
  const daysFromToday = (date: Date) => Math.round((startOfDayOf(date).getTime() - today.getTime()) / 86400000);
  const dueChip = (order: ScheduleOrderItem) => {
    const startsIn = order.paymentDate ? daysFromToday(order.paymentDate) : 0;
    if (startsIn > 0 && startsIn < 7) {
      const day = startOfDayOf(order.paymentDate!).toLocaleDateString(undefined, { weekday: "short" });
      return { label: t("Starts {day}").replace("{day}", day), hue: "hue-purple" };
    }
    const days = daysFromToday(order.dueDate!);
    if (days < 0) return { label: t("Overdue"), hue: "hue-red" };
    if (days === 0) return { label: t("Due today"), hue: "hue-red" };
    if (days === 1) return { label: t("Tomorrow"), hue: "hue-amber" };
    return {
      label: order.dueDate!.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      hue: "hue-blue",
    };
  };

  if (size === "1x1") {
    return (
      <ul className="home-due-list">
        {upcoming.slice(0, 3).map((order) => {
          const chip = dueChip(order);
          const ref = order.watchRef.trim();
          const name = order.customerName || order.designName;
          return (
            <li key={order.id}>
              <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                <span className="home-due-head">
                  {/* The sheet names the row after the order. A workspace that
                      never gave the order a reference has only the customer,
                      and then that is the name. */}
                  <b>
                    {ref ? <><i>{t("Order")}</i>{ref.startsWith("#") ? ref : `#${ref}`}</> : name}
                  </b>
                  <span className={`home-chip ${chip.hue}`}>{chip.label}</span>
                </span>
                {ref && name ? <em>{name}</em> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  // The visible week, Monday first, so the timeline and the day strip agree.
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });


  if (size === "2x1") {
    const weekEndDay = new Date(days[6]);
    weekEndDay.setHours(23, 59, 59, 999);
    const columnOf = (date: Date) =>
      Math.round((new Date(new Date(date).setHours(0, 0, 0, 0)).getTime() - weekStart.getTime()) / 86400000);
    const todayColumn = columnOf(today);

    return (
      <div className="home-week">
        {/* Today's column runs the height of the card, as the sheet draws it —
            it is what every bar is read against. */}
        {todayColumn >= 0 && todayColumn <= 6 ? (
          <span className="home-week-today" style={{ gridColumn: todayColumn + 2 }} aria-hidden="true" />
        ) : null}
        {days.map((date, index) => {
          const isToday = index === todayColumn;
          return (
            <span key={date.toISOString()} className={`home-week-day${isToday ? " is-today" : ""}`}
                  style={{ gridColumn: index + 2 }}>
              <em>{date.toLocaleDateString(undefined, { weekday: "short" })}</em>
              <b>{date.getDate()}</b>
            </span>
          );
        })}
        {upcoming.slice(0, 3).map((order, row) => {
          const chip = dueChip(order);
          const name = order.customerName || order.designName;
          const ref = order.watchRef.trim();
          // A deadline that fell before this week has no bar to draw — the row
          // still has to say the order is late, so the chip stands on its own.
          const from = Math.max(0, columnOf(order.paymentDate ?? weekStart));
          const to = columnOf(order.dueDate!);
          const offWeek = to < 0;
          // A bar narrower than its own chip has to borrow a column, and it
          // borrows to the left: borrowing to the right runs off the card.
          const end = Math.min(Math.max(to, from), 6);
          const start = end === 6 ? Math.min(from, 5) : Math.min(from, 6);
          // The name and the bar are grid items of the card's own grid, not of a
          // row box: that is what makes a bar land exactly on its days.
          return (
            <Fragment key={order.id}>
              <Link className="home-week-name" style={{ gridRow: row + 2 }}
                    href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                {ref ? <><b>{ref.startsWith("#") ? ref : `#${ref}`}</b> {name}</> : name}
              </Link>
              <span className={`home-week-bar ${chip.hue}${offWeek ? " is-off-week" : ""}`}
                    style={{ gridRow: row + 2, gridColumn: `${start + 2} / ${end + 3}` }}>
                <em>{chip.label}</em>
              </span>
            </Fragment>
          );
        })}
      </div>
    );
  }

  // The big card is the same week, with room for the day it is read against,
  // four bars instead of three, and the next deadlines spelled out under it.
  // Read-only on purpose: dragging a date here would fight the gesture that
  // moves the card itself (§10).
  const columnOf = (date: Date) =>
    Math.round((new Date(new Date(date).setHours(0, 0, 0, 0)).getTime() - weekStart.getTime()) / 86400000);
  const todayColumn = columnOf(today);
  const bars = upcoming.slice(0, 4);
  // "Upcoming" is what is still ahead. The timeline above already carries the
  // late ones, and repeating them here would spend the section on old news.
  const ahead = upcoming.filter((order) => columnOf(order.dueDate!) >= 0).slice(0, 2);

  return (
    <div className="home-week is-large" style={{ gridTemplateRows: `auto auto repeat(${bars.length}, minmax(0, 1fr)) auto auto` }}>
      {days.map((date, index) => (
        <span key={date.toISOString()} className={`home-week-day${index === todayColumn ? " is-today" : ""}`}
              style={{ gridColumn: index + 2 }}>
          <em>{date.toLocaleDateString(undefined, { weekday: "short" })}</em>
          <b>{date.getDate()}</b>
          {index === todayColumn ? <i>{t("Today")}</i> : null}
        </span>
      ))}
      <p className="home-week-eyebrow" style={{ gridRow: 2 }}>{t("Weekly timeline")}</p>
      {/* One element draws every day line and row line: seven spans and four
          more would say the same thing and cost eleven DOM nodes. */}
      <span className="home-week-guides" style={{ gridRow: `3 / ${bars.length + 3}` }} aria-hidden="true" />
      {bars.map((order, row) => {
        const chip = dueChip(order);
        const name = order.customerName || order.designName;
        const ref = order.watchRef.trim();
        const from = Math.max(0, columnOf(order.paymentDate ?? weekStart));
        const to = columnOf(order.dueDate!);
        const offWeek = to < 0;
        const end = Math.min(Math.max(to, from), 6);
        const start = end === 6 ? Math.min(from, 5) : Math.min(from, 6);
        // The section below spells out the dates, so up here only the bars that
        // need doing something about carry a word.
        const urgent = offWeek || columnOf(order.dueDate!) <= todayColumn + 1;
        return (
          <Fragment key={order.id}>
            <Link className="home-week-name" style={{ gridRow: row + 3 }}
                  href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
              {ref ? <><b>{ref.startsWith("#") ? ref : `#${ref}`}</b> {name}</> : name}
            </Link>
            <span className={`home-week-bar ${chip.hue}${offWeek ? " is-off-week" : ""}`}
                  style={{ gridRow: row + 3, gridColumn: `${start + 2} / ${end + 3}` }}>
              {urgent ? <em>{chip.label}</em> : null}
            </span>
          </Fragment>
        );
      })}
      {ahead.length > 0 ? (
        <>
          <p className="home-week-eyebrow is-ruled" style={{ gridRow: bars.length + 3 }}>{t("Upcoming")}</p>
          <ul className="home-upcoming" style={{ gridRow: bars.length + 4 }}>
            {ahead.map((order) => {
              const chip = dueChip(order);
              const name = order.customerName || order.designName;
              const ref = order.watchRef.trim();
              return (
                <li key={order.id}>
                  <span className={`home-upcoming-mark ${chip.hue}`} aria-hidden="true">
                    <HomeTileIcon name="reminder" />
                  </span>
                  <span>
                    <em className={chip.hue}>{chip.label}</em>
                    <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                      {ref ? `${ref.startsWith("#") ? ref : `#${ref}`} ${name}` : name}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- Customers */

export function CustomersCardBody({ size, data, t }: CardBodyProps) {
  const customers = data.customers;
  if (customers.length === 0) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const isNew = (customer: (typeof customers)[number]) =>
    Boolean(customer.lastContactDate && customer.lastContactDate >= monthStart && (customer.orderCount ?? 0) <= 1);
  const newThisMonth = customers.filter(isNew).length;
  const returning = customers.filter((customer) => (customer.orderCount ?? 0) > 1).length;
  const existing = Math.max(0, customers.length - newThisMonth - returning);
  const activeNames = new Set(
    data.scheduleOrders.filter((order) => !order.isDelivered).map((order) => order.customerName.toLowerCase()),
  );
  const withActive = customers.filter((customer) => activeNames.has(customer.name.toLowerCase())).length;

  if (size === "1x1") {
    const latest = customers[0];
    return (
      <div className="home-money">
        <p className="home-metric-label">{t("customers")}</p>
        <strong className="home-metric-value">{customers.length}</strong>
        <div className="home-split-pair">
          <span><em>{t("active orders")}</em><b className="is-positive">{withActive}</b></span>
          {latest ? <span><em>{t("Latest")}</em><b className="is-plain">{latest.name}</b></span> : null}
        </div>
      </div>
    );
  }

  const tiles = (
    <div className="home-tile-row">
      <MoneyTile label={t("Total customers")} value={String(customers.length)} tone="blue" />
      <MoneyTile label={t("New this month")} value={String(newThisMonth)} tone="green" />
      <MoneyTile label={t("Returning customers")} value={String(returning)} tone="blue" />
      <MoneyTile label={t("Customers with active orders")} value={String(withActive)} tone="green" />
    </div>
  );

  const mix = [
    { key: "New this month", count: newThisMonth, tone: "new" },
    { key: "Returning", count: returning, tone: "returning" },
    { key: "Existing", count: existing, tone: "existing" },
  ];
  const mixTotal = Math.max(1, newThisMonth + returning + existing);

  if (size === "2x1") {
    return (
      <div className="home-money is-wide">
        {tiles}
        <CustomerMix mix={mix} total={mixTotal} t={t} />
      </div>
    );
  }

  return (
    <div className="home-money is-large">
      {tiles}
      <div className="home-panel">
        <p className="home-eyebrow is-strong">{t("Customer mix")}</p>
        <CustomerMix mix={mix} total={mixTotal} t={t} />
      </div>
      <div className="home-panel is-flush">
        <p className="home-eyebrow is-strong">{t("Recent customers")}</p>
        <ul className="home-record-list">
          {customers.slice(0, 3).map((customer) => (
            <li key={customer.id}>
              <span className="home-avatar" aria-hidden="true">{customer.name.slice(0, 1).toUpperCase()}</span>
              <Link href={`/customers?customer=${encodeURIComponent(customer.id)}`}>{customer.name}</Link>
              <span className={`home-chip is-source${customer.source && customer.source !== "manual" ? " is-store" : ""}`}>
                {customer.source && customer.source !== "manual" ? customer.source : t("Direct")}
              </span>
              <span className={activeNames.has(customer.name.toLowerCase()) ? "home-chip is-active" : "home-chip is-muted"}>
                {activeNames.has(customer.name.toLowerCase()) ? t("Active customer") : t("No open orders")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* §11 and §19: a member only ever sees the customers their role allows,
          and the card says so rather than looking like the whole list. */}
      <p className="home-action-note">{t("Only customers you have permission to view are shown")}</p>
    </div>
  );
}

function CustomerMix({ mix, total, t }: { mix: { key: string; count: number; tone: string }[]; total: number; t: (text: string) => string }) {
  return (
    <div className="home-mix">
      <span className="home-mix-bar" aria-hidden="true">
        {mix.map((entry) => (
          <i key={entry.key} className={`tone-${entry.tone}`} style={{ width: `${(entry.count / total) * 100}%` }} />
        ))}
      </span>
      <ul className="home-mix-key">
        {mix.map((entry) => (
          <li key={entry.key}>
            <span className={`home-cost-dot is-small tone-${entry.tone}`} aria-hidden="true" />
            <em>{t(entry.key)}</em>
            <b>{entry.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------- Recent activity */

/** Event type to colour. The title always names the event, so colour only
 *  speeds up scanning — it never carries the meaning on its own (§20). */
// What a row looks like, decided from the notification type the SERVER writes.
//
// This was a chain of substring guesses ending in a grey disc, and ten real
// types fell off the end of it — estimate_decision, both bank_ types,
// shared_note, support_ticket_reply, workspace_ticket_assigned, team, direct,
// delivery, deleted. The card in front of a real workspace was three blank grey
// circles: two estimate approvals and a bank connection, none of them
// recognisable, all of them things this product does every day.
//
// So it is a table now, and homeActivityTypes.test.ts checks it against the
// list of types the server actually writes. A guess that silently degrades to
// grey is worse than a missing case that a test can point at.
const ACTIVITY_LOOKS: Array<{ match: RegExp; tone: string; glyph: HomeActivityIconName }> = [
  // Money first: woocommerce_payment must not be read as an order.
  { match: /payment|refund|invoice_paid/, tone: "green", glyph: "payment" },
  { match: /^bank_|bank_connection|bank_receipt/, tone: "cyan", glyph: "bank" },
  { match: /estimate/, tone: "indigo", glyph: "estimate" },
  { match: /delivery|dispatch|shipped/, tone: "blue", glyph: "delivery" },
  { match: /production|status|stage/, tone: "blue", glyph: "production" },
  // Deletion requests are about an order but are not one; they read as admin.
  { match: /deletion|deleted/, tone: "slate", glyph: "message" },
  { match: /order/, tone: "purple", glyph: "order" },
  { match: /note/, tone: "amber", glyph: "note" },
  { match: /ticket|support|direct|message|reply/, tone: "slate", glyph: "message" },
  { match: /team|member|invite/, tone: "teal", glyph: "team" },
  { match: /file|upload|document/, tone: "amber", glyph: "file" },
  { match: /inventory|stock/, tone: "orange", glyph: "inventory" },
  { match: /customer/, tone: "teal", glyph: "customer" },
  { match: /schedule|reminder/, tone: "blue", glyph: "schedule" }
];

export function activityLook(type: string): { tone: string; glyph: HomeActivityIconName } {
  const key = String(type || "").toLowerCase();
  const hit = ACTIVITY_LOOKS.find((row) => row.match.test(key));
  return hit ? { tone: hit.tone, glyph: hit.glyph } : { tone: "slate", glyph: "update" };
}

/** The detail line under an activity title.
 *
 *  The reference sheet writes it as "detail · who", and the temptation is to
 *  append senderName to every row. Our messages already put the actor in the
 *  sentence — "Jeffrey approved EST-2026-0010." — so appending it produces
 *  "Jeffrey approved EST-2026-0010. · Jeffrey", which reads like a bug.
 *
 *  So the name is added only when the sentence does not already contain it.
 *  And `source` is deliberately NOT shown: in a notification it is internal
 *  plumbing — "web", "callable", "default", "chatgpt" — not the "Shopify" or
 *  "Stripe" the reference imagines, and showing a jeweller the word "callable"
 *  would be worse than showing nothing. */
function detailFor(item: { message: string; senderName: string }): string {
  const message = String(item.message || "").trim();
  const who = String(item.senderName || "").trim();
  if (!who || !message) return message;
  if (message.toLowerCase().includes(who.toLowerCase())) return message;
  return `${message} · ${who}`;
}

export function RecentActivityCardBody({ size, data, t, moneySettings, activityFilter = "all" }: CardBodyProps) {
  // The workspace's own stream, already filtered to what this user is a
  // recipient of — activity never widens what someone can see (§12). The pills
  // narrow what is LOOKED at, on top of that; they are not a permission.
  const visible = size === "2x2"
    ? data.activity.filter((item) => activityMatchesFilter(item.type, activityFilter))
    : data.activity;
  // Six on a wide card, because it is two columns of three now rather than one
  // column of five — an odd number left the second column short by one and the
  // card looked like it had run out of events.
  const rows = visible.slice(0, size === "1x1" ? 3 : size === "2x1" ? 6 : 8);
  if (rows.length === 0) {
    // A pill with nothing behind it has to say so, or it reads as a card that
    // has stopped working.
    return activityFilter === "all"
      ? null
      : <p className="home-empty-note">{t("Nothing in this filter yet.")}</p>;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);

  const relative = (millis: number) => {
    if (!millis) return "";
    const minutes = Math.max(1, Math.round((Date.now() - millis) / 60000));
    // A square has no room for "ago" beside a title; the reference sheet drops
    // it there and keeps it on the wider cards.
    if (minutes < 60) return size === "1x1" ? `${minutes} ${t("min")}` : `${minutes} ${t("min ago")}`;
    if (millis >= startOfToday.getTime()) return `${Math.round(minutes / 60)}h`;
    if (millis >= startOfYesterday.getTime()) return t("Yesterday");
    return new Date(millis).toLocaleDateString();
  };

  const symbol = moneySymbol(moneySettings);
  const row = (item: (typeof rows)[number]) => {
    const { tone, glyph } = activityLook(item.type);
    return (
    <li key={item.id}>
      <span className={`home-activity-mark tone-${tone}`} aria-hidden="true">
        {/* Money is the one row that shows a character rather than a drawing:
            the workspace's own currency, so a euro shop is never shown a
            pound. Everything else is a glyph. */}
        {glyph === "payment"
          ? <b className="home-activity-symbol">{symbol}</b>
          : <HomeActivityIcon name={glyph} />}
      </span>
      <span className="home-activity-text">
        <strong>{item.title || t("Update")}</strong>
        {/* The second line used to be dropped in a square, which left the
            title stranded and the row taller than it needed to be. A 1x1 has
            the height for it; what it lacks is width, and that is a clamp. */}
        {item.message ? <em>{detailFor(item)}</em> : null}
      </span>
      {size === "2x2" && item.senderName ? <span className="home-chip is-muted">{item.senderName}</span> : null}
      <span className="home-activity-when">{relative(item.createdAtMillis)}</span>
    </li>
    );
  };

  if (size !== "2x2") {
    return <ul className="home-activity-list">{rows.map(row)}</ul>;
  }

  // The wide-open card draws a row as columns rather than a stack: title,
  // detail, who, when, and a chevron — the reference sheet's layout, and the
  // one that makes a row scannable down its columns instead of read one block
  // at a time.
  const wideRow = (item: (typeof rows)[number]) => {
    const { tone, glyph } = activityLook(item.type);
    const who = String(item.senderName || "").trim() || t("System");
    const href = item.orderId
      ? `/orders?selectedOrderId=${encodeURIComponent(item.orderId)}`
      : (item.route ? `/${String(item.route).replace(/^\//, "")}` : "");
    const inner = (
      <>
        <span className={`home-activity-mark tone-${tone}`} aria-hidden="true">
          {glyph === "payment" ? <b className="home-activity-symbol">{symbol}</b> : <HomeActivityIcon name={glyph} />}
        </span>
        <strong className="home-activity-head">{item.title || t("Update")}</strong>
        <span className="home-activity-detail">{item.message}</span>
        <span className="home-activity-actor">
          <i aria-hidden="true"><HomeActivityIcon name={item.senderName ? "customer" : "production"} /></i>
          {who}
        </span>
        <span className="home-activity-when">{relative(item.createdAtMillis)}</span>
        {/* The chevron is only drawn when it goes somewhere. An arrow that does
            nothing when pressed is worse than no arrow. */}
        <span className="home-activity-go" aria-hidden="true">{href ? "\u203A" : ""}</span>
      </>
    );
    return href
      ? <li key={item.id}><Link href={href} className="home-activity-wide is-link">{inner}</Link></li>
      : <li key={item.id}><span className="home-activity-wide">{inner}</span></li>;
  };

  const today = rows.filter((item) => item.createdAtMillis >= startOfToday.getTime());
  const earlier = rows.filter((item) => item.createdAtMillis < startOfToday.getTime());
  return (
    <div className="home-money is-large">
      {today.length > 0 ? (
        <>
          <p className="home-eyebrow is-strong">{t("Today")}</p>
          <ul className="home-activity-list is-wide">{today.map(wideRow)}</ul>
        </>
      ) : null}
      {earlier.length > 0 ? (
        <>
          <p className="home-eyebrow is-strong">{t("Earlier")}</p>
          <ul className="home-activity-list is-wide">{earlier.map(wideRow)}</ul>
        </>
      ) : null}
      {/* The permission note now sits in the card footer, beside the link —
          see footerNote in HomeCardShell. */}
    </div>
  );
}

/* ------------------------------------------------------------------ Files */

function fileKind(name: string, contentType: string): "pdf" | "image" | "doc" {
  if (contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) return "image";
  if (contentType === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "doc";
}

function humanSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** "2 min ago" / "Today" / "Yesterday" / the date — what the sheet shows beside
 *  a file, and what a person actually asks about a recent upload. */
function homeAgo(when: Date, t: (text: string) => string) {
  const mins = Math.round((Date.now() - when.getTime()) / 60000);
  if (mins < 1) return t("Just now");
  if (mins < 60) return `${mins} ${t("min ago")}`;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const days = Math.floor((startOfDay.getTime() - when.getTime()) / 86400000);
  if (days < 0) return t("Today");
  if (days === 0) return t("Yesterday");
  return when.toLocaleDateString();
}

export function FilesCardBody({ size, data, t }: CardBodyProps) {
  const files = data.files;
  if (files.length === 0) return null;

  // One file, linked to as many records as it belongs to — the card counts
  // files, never copies (§14).
  const unlinked = files.filter((file) => !file.orderId);
  const used = files.reduce((sum, file) => sum + (file.fileSize || 0), 0);

  /** The sheet's row: what kind of file it is, its name, what it is attached to,
   *  and when it arrived. */
  const fileRow = (file: (typeof files)[number]) => {
    const kind = fileKind(file.fileName, file.contentType);
    const ext = (file.fileName.split(".").pop() || "").slice(0, 4).toUpperCase();
    return (
      <li key={file.fileId || file.id}>
        <Link href={file.orderId ? `/orders?selectedOrderId=${encodeURIComponent(file.orderId)}` : "/files"}>
          <span className={`home-file-icon is-${kind}`} aria-hidden="true">{ext}</span>
          <strong>{file.fileName}</strong>
          {file.orderId ? (
            <span className="home-chip is-link">{file.designName || file.customerName || t("Order")}</span>
          ) : null}
          <em>{file.uploadedAt ? homeAgo(file.uploadedAt, t) : ""}</em>
        </Link>
      </li>
    );
  };

  const row = (file: (typeof files)[number]) => (
    <li key={file.fileId || file.id}>
      <span className={`home-file-mark is-${fileKind(file.fileName, file.contentType)}`} aria-hidden="true" />
      <Link href={file.orderId ? `/orders?selectedOrderId=${encodeURIComponent(file.orderId)}` : "/files"}>
        {file.fileName}
      </Link>
      {file.orderId ? (
        <span className="home-chip is-source">{file.designName || file.customerName || t("Order")}</span>
      ) : (
        <span className="home-chip is-muted">{t("Unlinked")}</span>
      )}
    </li>
  );

  const limitBytes = (data.storageLimitMB || 0) * 1024 * 1024;
  const pct = limitBytes > 0 ? Math.min(100, Math.round((used / limitBytes) * 100)) : null;
  const quota = limitBytes > 0 ? (
    <div className="home-quota">
      <span className="home-quota-line">
        <em>{humanSize(used)} {t("of")} {humanSize(limitBytes)}</em>
        <b className={pct !== null && pct >= 90 ? "is-full" : ""}>{pct}%</b>
      </span>
      <span className="home-quota-bar" aria-hidden="true">
        <i className={pct !== null && pct >= 90 ? "is-full" : ""} style={{ width: `${pct ?? 0}%` }} />
      </span>
    </div>
  ) : null;

  if (size === "1x1") {
    // The square asks the same question as the wide card — how full is this
    // workspace, and what landed recently. "File library" was the file count
    // again under a second name.
    return (
      <div className="home-money is-files">
        {quota}
        <p className="home-eyebrow is-strong">{t("Recent")}</p>
        <ul className="home-file-list">{files.slice(0, 2).map(fileRow)}</ul>
      </div>
    );
  }

  if (size === "2x1") {
    return (
      <div className="home-money is-wide is-files">
        {quota}
        <p className="home-eyebrow is-strong">{t("Recent files")}</p>
        <ul className="home-file-list">{files.slice(0, 3).map(fileRow)}</ul>
      </div>
    );
  }

  // The sheet's three figures: how many, how full, and how many are floating
  // free. The last is the only one that asks for anything to be done.
  return (
    <div className="home-money is-large is-files">
      <div className="home-tile-row is-triple">
        <MoneyTile label={t("files")} value={String(files.length)} tone="blue" />
        <MoneyTile label={t("Storage")} value={pct !== null ? `${pct}%` : humanSize(used)}
                   tone="green" sub={limitBytes > 0 ? `${humanSize(used)} ${t("of")} ${humanSize(limitBytes)}` : undefined} />
        <MoneyTile label={t("Unlinked")} value={String(unlinked.length)} tone={unlinked.length > 0 ? "orange" : "blue"} />
      </div>
      <div className="home-panel is-flush">
        <p className="home-eyebrow is-strong">{t("Recent files")}</p>
        <ul className="home-file-list">{files.slice(0, 4).map(fileRow)}</ul>
      </div>
      {unlinked.length > 0 ? (
        <Link className="home-linking-banner" href="/files">
          <span aria-hidden="true">🔗</span>
          <strong>{t("{count} files are not linked to a record.").replace("{count}", String(unlinked.length))}</strong>
          <em>{t("Review")}</em>
        </Link>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Notes */

export function NotesCardBody({ size, data, t, onQuickAction }: CardBodyProps) {
  // Notes only — not files, not AI replies (§13). Pinned first, then recent.
  const live = data.notes.filter((note) => !note.isDeleted && !note.isArchived);
  if (live.length === 0) return null;
  const pinned = live.filter((note) => note.isPinned);
  const recent = live
    .filter((note) => !note.isPinned)
    .sort((a, b) => (b.updatedAtMillis ?? 0) - (a.updatedAtMillis ?? 0));

  const limit = size === "1x1" ? 2 : size === "2x1" ? 3 : 6;
  const shown = [...pinned, ...recent].slice(0, limit);

  if (size !== "2x2") {
    return (
      <div className="home-note-grid" data-size={size}>
        {shown.map((note) => <NoteTile key={note.id} note={note} t={t} />)}
      </div>
    );
  }

  return (
    <div className="home-notes-large">
      {/* The sheet opens this card with somewhere to start typing. It is a
          button, not a field: the composer lives on the Notes screen and two
          places to draft the same note is one too many. */}
      <button
        type="button"
        className="home-note-composer"
        onClick={(event) => { event.stopPropagation(); onQuickAction?.("note"); }}
      >
        {t("Take a note…")}
      </button>
      {pinned.length > 0 ? (
        <>
          <p className="home-eyebrow is-strong">{t("Pinned")}</p>
          <div className="home-note-grid">
            {pinned.slice(0, 2).map((note) => <NoteTile key={note.id} note={note} t={t} />)}
          </div>
        </>
      ) : null}
      <p className="home-eyebrow is-strong">{t("Recent")}</p>
      <ul className="home-note-rows">
        {recent.slice(0, pinned.length > 0 ? 3 : 5).map((note) => (
          <NoteRow key={note.id} note={note} t={t} />
        ))}
      </ul>
    </div>
  );
}

/** What a note is about, and the one fact worth showing beside it: when it is
 *  due, or what it is attached to. Derived from the note — never invented. */
function noteMeta(note: HomeData["notes"][number], t: (text: string) => string) {
  if (note.reminderDateMillis) {
    const due = new Date(note.reminderDateMillis);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - startOfDay.getTime()) / 86400000);
    return {
      icon: "reminder" as const,
      text: days === 0 ? t("Today") : days === 1 ? t("Tomorrow") : due.toLocaleDateString(),
      overdue: days < 0,
    };
  }
  if (note.linkedOrderLabel) return { icon: "order" as const, text: note.linkedOrderLabel, overdue: false };
  if (note.linkedCustomerName) return { icon: "customer" as const, text: note.linkedCustomerName, overdue: false };
  return { icon: "note" as const, text: "", overdue: false };
}

function NoteRow({ note, t }: { note: HomeData["notes"][number]; t: (text: string) => string }) {
  const meta = noteMeta(note, t);
  const hue = note.colorName || "default";
  return (
    <li className={`home-note-row hue-${hue}`}>
      <Link href={`/notes?note=${encodeURIComponent(note.id)}`}>
        <span className="home-note-row-badge" aria-hidden="true"><HomeTileIcon name={meta.icon} /></span>
        <strong>{note.title || t("Untitled note")}</strong>
        {meta.text ? <em className={meta.overdue ? "is-due" : ""}>{meta.text}</em> : null}
      </Link>
    </li>
  );
}

/** A note keeps its own colour — that is the note's, not the card's. */
function NoteTile({ note, t }: { note: HomeData["notes"][number]; t: (text: string) => string }) {
  const chip = note.linkedOrderLabel || note.linkedCustomerName;
  const reminder = note.reminderDateMillis ? new Date(note.reminderDateMillis) : null;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const days = reminder ? Math.round((reminder.getTime() - startOfDay.getTime()) / 86400000) : null;
  return (
    // hue-, not tone-: a global `.tone-green { color: … !important }` earlier in
    // the stylesheet would repaint a green note's text its own green.
    <Link
      className={`home-note hue-${note.colorName || "default"}${note.isPinned ? " is-pinned" : ""}`}
      href={`/notes?note=${encodeURIComponent(note.id)}`}
    >
      {/* Top right, out of the title's way — the sheet marks the corner rather
          than pushing the heading along. */}
      {note.isPinned ? <span className="home-note-pin" aria-label={t("Pinned")}>📌</span> : null}
      <strong>{note.title || t("Untitled note")}</strong>
      {note.text ? <p>{note.text}</p> : null}
      <span className="home-note-foot">
        {/* The chip takes the note's own colour, not a grey one — it belongs to
            the note, and on a coloured ground grey reads as disabled. */}
        {chip ? <span className="home-chip is-note">{chip}</span> : null}
        {days !== null ? (
          <em className={days <= 0 ? "is-due" : days === 1 ? "is-soon" : ""}>
            {days === 0 ? t("Today") : days === 1 ? t("Tomorrow") : reminder?.toLocaleDateString()}
          </em>
        ) : null}
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------- Quick actions */

/**
 * The action set, grouped as the reference groups it. Colour is per action and
 * is decoration, never meaning — the label says what the tile does (§20).
 */
const QUICK_ACTIONS: {
  id: QuickActionId; label: string; group: "create" | "capture" | "finance";
  icon: HomeActionIconName; tone: string; primary?: boolean;
}[] = [
  { id: "order", label: "New order", group: "create", icon: "newOrder", tone: "blue", primary: true },
  { id: "customer", label: "Add customer", group: "create", icon: "addCustomer", tone: "teal" },
  { id: "note", label: "Add note", group: "create", icon: "addNote", tone: "amber" },
  { id: "file", label: "Upload file", group: "capture", icon: "uploadFile", tone: "violet" },
  { id: "inventory", label: "Add inventory item", group: "create", icon: "addInventory", tone: "purple" },
  { id: "receipt", label: "Scan receipt", group: "capture", icon: "scanReceipt", tone: "orange" },
  // NivaDesk has no manual expense form yet: spending arrives from the read-only
  // bank feed and becomes an expense when it is categorised. Until one exists
  // this lands on the review queue, which is where that actually happens.
  { id: "reviewSpending", label: "Add expense", group: "finance", icon: "addExpense", tone: "indigo" },
  { id: "aiReply", label: "Generate AI reply", group: "finance", icon: "aiReply", tone: "green" },
];

const QUICK_ACTION_GROUPS: { id: "create" | "capture" | "finance"; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "capture", label: "Capture" },
  { id: "finance", label: "Finance & communication" },
];

export function QuickActionsCardBody({ size, t, onQuickAction }: CardBodyProps) {
  // 1x1: four large tinted tiles, icon over label.
  if (size === "1x1") {
    return (
      <div className="home-action-grid is-tiles">
        {QUICK_ACTIONS.slice(0, 4).map((action) => (
          <button
            key={action.id}
            type="button"
            className={`home-action-tile tone-${action.tone}${action.primary ? " is-primary" : ""}`}
            onClick={() => onQuickAction?.(action.id)}
          >
            <span className="home-action-glyph"><HomeActionIcon name={action.icon} /></span>
            <span className="home-action-label">{t(action.label)}</span>
          </button>
        ))}
      </div>
    );
  }

  // 2x1: six compact rows, icon beside label.
  if (size === "2x1") {
    return (
      <div className="home-action-grid is-rows">
        {QUICK_ACTIONS.slice(0, 6).map((action) => (
          <button
            key={action.id}
            type="button"
            className={`home-action-row tone-${action.tone}${action.primary ? " is-primary" : ""}`}
            onClick={() => onQuickAction?.(action.id)}
          >
            <span className="home-action-glyph"><HomeActionIcon name={action.icon} /></span>
            <span className="home-action-label">{t(action.label)}</span>
          </button>
        ))}
      </div>
    );
  }

  // 2x2: every action, grouped, with the permissions note the reference carries.
  return (
    <div className="home-action-groups">
      {QUICK_ACTION_GROUPS.map((group) => {
        const rows = QUICK_ACTIONS.filter((action) => action.group === group.id);
        if (rows.length === 0) return null;
        return (
          <div key={group.id} className="home-action-group">
            <p className="home-eyebrow is-strong">{t(group.label)}</p>
            <div className="home-action-grid is-rows">
              {rows.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`home-action-row tone-${action.tone}${action.primary ? " is-primary" : ""}`}
                  onClick={() => onQuickAction?.(action.id)}
                >
                  <span className="home-action-glyph"><HomeActionIcon name={action.icon} /></span>
                  <span className="home-action-label">{t(action.label)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="home-action-note">
        <span aria-hidden="true">ⓘ</span> {t("Actions follow your permissions")}
      </p>
    </div>
  );
}

/* --------------------------------------------------------- Getting started */

/** Where each setup step sends the user, and the sentence that explains it. */
const SETUP_STEPS = [
  { id: "profile", label: "Set up business profile", blurb: "Name, currency and tax so every document reads right.", href: "/settings", cta: "Open settings" },
  { id: "customer", label: "Add your first customer", blurb: "Orders, notes and files all hang off a customer.", href: "/customers?new=1", cta: "Add customer" },
  { id: "order", label: "Create your first order", blurb: "The record everything else in NivaDesk attaches to.", href: "/orders", cta: "Create order" },
  { id: "shop", label: "Connect your shop", blurb: "Import orders automatically from Shopify or WooCommerce.", href: "/settings?section=integrations&category=commerce&intent=connect-shop", cta: "Connect shop" },
  { id: "inventory", label: "Add an inventory item", blurb: "Track what you own, what is reserved and what is low.", href: "/inventory?new=1", cta: "Add item" },
  { id: "bank", label: "Connect your bank", blurb: "Read-only. Spending arrives and you categorise it.", href: "/bank", cta: "Connect bank" },
] as const;

export function GettingStartedCardBody({
  size, data, t, skipped = [], onSkip, onRestoreSkipped,
}: CardBodyProps & {
  skipped?: string[];
  onSkip?: (stepId: string) => void;
  onRestoreSkipped?: () => void;
}) {
  const steps = SETUP_STEPS.filter((step) => !skipped.includes(step.id)).map((step) => ({
    ...step,
    done:
      step.id === "profile" ? true :
      step.id === "customer" ? data.customers.length > 0 :
      step.id === "order" ? data.orders.length > 0 :
      // A store order carries the shop's own status field; that is the only
      // signal on the order itself that it did not come from this app.
      step.id === "shop" ? data.orders.some((order) =>
        Boolean(order.customFields?.["Shopify Status"] || order.customFields?.["WooCommerce Status"])) :
      step.id === "inventory" ? (data.inventory?.uniqueCount ?? 0) + (data.inventory?.quantityCount ?? 0) > 0 :
      data.bankTransactions.length > 0,
  }));
  const complete = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  const done = steps.filter((step) => step.done);
  const todo = steps.filter((step) => !step.done && step.id !== next?.id);

  // 1x1 has no room for the completed list. The sheet spends the square on the
  // one thing to do next and the way out of it, rather than on a list of what
  // is still open — that list is the wall §15 says never to put here.
  if (size === "1x1") {
    return (
      <div className="home-setup is-square">
        <HomeProgress complete={complete} total={steps.length} t={t} />
        {next ? (
          <>
            <NextStepPanel step={next} t={t} compact />
            {onSkip ? (
              <button type="button" className="home-setup-skip"
                      onClick={(event) => { event.stopPropagation(); onSkip(next.id); }}>
                {t("Skip for now")}
              </button>
            ) : null}
          </>
        ) : (
          <AllSetNote skipped={skipped} onRestore={onRestoreSkipped} t={t} />
        )}
      </div>
    );
  }

  // 2x1: the one thing to do next on the left, what is left after it on the
  // right (§15 — never a blocking wall, always one obvious continue). The
  // Completed list that used to hold the left column is gone: a card whose job
  // is to move you forward spent half itself on work already finished.
  if (size === "2x1") {
    return (
      <div className="home-setup is-split">
        <HomeProgress complete={complete} total={steps.length} t={t} />
        <div className="home-setup-columns">
          <div className="home-setup-next">
            {next ? (
              <>
                <NextStepPanel step={next} t={t} inline />
                {onSkip ? (
                  <button type="button" className="home-setup-skip"
                          onClick={(event) => { event.stopPropagation(); onSkip(next.id); }}>
                    {t("Skip for now")}
                  </button>
                ) : null}
              </>
            ) : (
              <AllSetNote skipped={skipped} onRestore={onRestoreSkipped} t={t} />
            )}
          </div>
          <ul className="home-check-list is-ruled">
            {todo.slice(0, 3).map((step) => (
              <li key={step.id}><span className="home-check is-todo" aria-hidden="true" />{t(step.label)}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // 2x2: the whole checklist down the card and the current step's panel under
  // it. One column, not two: side by side the list had about half the width and
  // every label was cut to "Set up business pro…" — a checklist you cannot read
  // is not a checklist.
  return (
    <div className="home-setup is-large">
      <HomeProgress complete={complete} total={steps.length} t={t} />
      <p className="home-eyebrow is-strong">{t("Your checklist")}</p>
      <ul className="home-check-list is-full">
        {steps.map((step) => (
          <li key={step.id} className={step.id === next?.id ? "is-current" : step.done ? "is-done" : ""}>
            <span
              className={step.done ? "home-check is-done" : step.id === next?.id ? "home-check is-current" : "home-check is-todo"}
              aria-hidden="true"
            />
            {t(step.label)}
          </li>
        ))}
      </ul>
      {next ? (
        <div className="home-setup-next">
          <NextStepPanel step={next} t={t} large />
          {onSkip ? (
            <button type="button" className="home-setup-skip"
                    onClick={(event) => { event.stopPropagation(); onSkip(next.id); }}>
              {t("Skip for now")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="home-next-panel">
          <AllSetNote skipped={skipped} onRestore={onRestoreSkipped} t={t} />
        </div>
      )}
    </div>
  );
}

function HomeProgress({ complete, total, t, hideLabel }: { complete: number; total: number; t: (text: string) => string; hideLabel?: boolean }) {
  return (
    <>
      {hideLabel ? null : (
        <p className="home-metric-label">
          {t("{done} of {total} complete").replace("{done}", String(complete)).replace("{total}", String(total))}
        </p>
      )}
      <div className="home-progress" role="progressbar" aria-valuenow={complete} aria-valuemin={0} aria-valuemax={total}>
        <span style={{ width: `${(complete / total) * 100}%` }} />
      </div>
    </>
  );
}

/**
 * The end of the checklist, and the way back into it.
 *
 * "Skip for now" has to be true: without a way to bring a skipped step back,
 * the word "now" is a promise the card does not keep. There is nothing left to
 * do here, so this is where the offer belongs.
 */
function AllSetNote({
  skipped, onRestore, t,
}: {
  skipped: string[];
  onRestore?: () => void;
  t: (text: string) => string;
}) {
  return (
    <div className="home-setup-allset">
      <p className="home-card-note">{t("All set — nice work.")}</p>
      {skipped.length > 0 && onRestore ? (
        <button type="button" className="home-setup-skip"
                onClick={(event) => { event.stopPropagation(); onRestore(); }}>
          {t("{count} skipped").replace("{count}", String(skipped.length))}
        </button>
      ) : null}
    </div>
  );
}

function NextStepPanel({
  step, t, compact, inline, large,
}: {
  step: { label: string; blurb: string; href: string; cta: string };
  t: (text: string) => string;
  compact?: boolean; inline?: boolean; large?: boolean;
}) {
  return (
    <div className={`home-next-panel${inline ? " is-inline" : ""}${large ? " is-large" : ""}${compact ? " is-stacked" : ""}`}>
      <div className="home-next-body">
        <div>
          {/* The big card's list above already names this step and colours it
              blue; the panel repeating it was the same words twice. */}
          {large ? null : <strong>{t(step.label)}</strong>}
          {/* The square keeps the step and the way past it and gives up the
              line that explains why: measured, "Verbinde deinen Shop" plus its
              own blurb runs 17px past the bottom of a 174px card. The page the
              button opens explains itself. */}
          {compact ? null : <p>{t(step.blurb)}</p>}
        </div>
        {/* The square has no width for "Connect your shop" twice — the panel's
            heading already named the step, so the button just moves. */}
        <Link className="home-next-button" href={step.href}>
          {t(inline || compact ? "Continue" : step.cta)}
        </Link>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- shared */

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" | "info" }) {
  return (
    <div className="home-stat">
      <span className="home-stat-label">{label}</span>
      <strong className={tone ? `is-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="home-breakdown-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
