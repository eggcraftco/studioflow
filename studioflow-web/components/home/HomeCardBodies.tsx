"use client";

import Link from "next/link";
import { resolveProductionStage } from "@/lib/studioflow/production";
import { HomeActionIcon, type HomeActionIconName } from "@/components/home/HomeActionIcons";
import type { HomeCardSize } from "@/lib/studioflow/homeCards";
import type { HomeData } from "@/lib/studioflow/useHomeData";
import type { StudioMoneySettings } from "@/lib/studioflow/money";
import { formatStudioMoney } from "@/lib/studioflow/money";

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
  data: HomeData;
  t: (text: string) => string;
  moneySettings: StudioMoneySettings;
  hideNumbers: boolean;
  onQuickAction?: (action: QuickActionId) => void;
};

export type QuickActionId =
  | "order" | "customer" | "note" | "file" | "inventory" | "reviewSpending" | "receipt" | "aiReply";

/** Respects the price-privacy toggle: hidden means hidden everywhere. */
function cash(value: number, hide: boolean, settings: StudioMoneySettings) {
  if (hide) return "••••";
  return formatStudioMoney(value, settings);
}

/* ------------------------------------------------------------------ Money */

export function MoneyCardBody({ size, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const orders = data.financeOrders.filter((order) => order.countsTowardBalance !== false);
  if (orders.length === 0) return null;

  const money = (value: number) => cash(value, hideNumbers, moneySettings);
  const revenue = orders.reduce((sum, o) => sum + o.paidAmount + o.remainingAmount, 0);
  const received = orders.reduce((sum, o) => sum + o.paidAmount, 0);
  const outstanding = orders.reduce((sum, o) => sum + o.remainingAmount, 0);
  const costs = orders.reduce((sum, o) => sum + o.watchPurchasePrice, 0);
  const fees = orders.reduce((sum, o) => sum + o.paymentFee, 0);
  const shipping = orders.reduce((sum, o) => sum + o.deliveryCost, 0);
  const vat = orders.reduce((sum, o) => sum + o.taxAmount, 0);
  const profit = revenue - costs - fees - shipping - vat;

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
          <span className="home-ratio-foot"><b className="is-positive">{money(revenue)}</b><b className="is-warning">{money(costs)}</b></span>
        </div>
      </div>
    );
  }

  const deductions = [
    { label: "Costs", value: costs },
    { label: "Platform fees", value: fees },
    { label: "Shipping", value: shipping },
    { label: "VAT Amount", value: vat },
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
        <ol className="home-waterfall">
          <li className="is-end"><em>{t("Revenue")}</em><b className="is-positive">{money(revenue)}</b></li>
          {deductions.map((entry) => (
            <li key={entry.label}>
              <em><span className="home-minus" aria-hidden="true">−</span>{t(entry.label)}</em>
              <b className="is-warning">{money(entry.value)}</b>
            </li>
          ))}
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
        <MoneyTile label={t("Revenue")} value={money(revenue)} tone="green" />
        <MoneyTile label={t("Payments received")} value={money(received)} tone="green" />
        <MoneyTile label={t("Outstanding")} value={money(outstanding)} tone="blue" />
        <MoneyTile label={t("Net profit")} value={money(profit)} tone="green" />
      </div>
      <div className="home-money-panels">
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Revenue & profit")}</p>
          <RevenueProfitChart orders={orders} t={t} />
        </div>
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Cost breakdown")}</p>
          <ul className="home-cost-list">
            {deductions.map((entry, index) => (
              <li key={entry.label}>
                <span className={`home-cost-dot tone-${index}`} aria-hidden="true" />
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

function MoneyTile({ label, value, tone, sub }: { label: string; value: string; tone: "green" | "blue" | "orange"; sub?: string }) {
  return (
    <div className={`home-money-tile tone-${tone}`}>
      <span className="home-money-tile-dot" aria-hidden="true" />
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
function RevenueProfitChart({ orders, t }: { orders: HomeData["financeOrders"]; t: (text: string) => string }) {
  const weeks = 12;
  const now = new Date();
  const buckets = Array.from({ length: weeks }, () => ({ revenue: 0, profit: 0 }));
  for (const order of orders) {
    if (!order.paymentDate) continue;
    const weeksAgo = Math.floor((now.getTime() - order.paymentDate.getTime()) / (7 * 24 * 3600 * 1000));
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    const bucket = buckets[weeks - 1 - weeksAgo];
    const value = order.paidAmount + order.remainingAmount;
    bucket.revenue += value;
    bucket.profit += value - order.watchPurchasePrice - order.paymentFee - order.deliveryCost - order.taxAmount;
  }
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.revenue, b.profit)));
  const width = 100;
  const height = 46;
  const point = (index: number, value: number) =>
    `${(index / (weeks - 1)) * width},${height - (Math.max(0, value) / peak) * height}`;
  const line = (key: "revenue" | "profit") => buckets.map((b, i) => point(i, b[key])).join(" ");
  const area = (key: "revenue" | "profit") => `0,${height} ${line(key)} ${width},${height}`;

  if (buckets.every((b) => b.revenue === 0)) {
    return <p className="home-card-note">{t("Not enough history yet.")}</p>;
  }
  return (
    <>
      <p className="home-chart-key">
        <span><i className="is-revenue" aria-hidden="true" />{t("Revenue")}</span>
        <span><i className="is-profit" aria-hidden="true" />{t("Net profit")}</span>
      </p>
      <svg className="home-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
           aria-label={t("Revenue & profit")}>
        <polygon className="home-chart-area is-revenue" points={area("revenue")} />
        <polygon className="home-chart-area is-profit" points={area("profit")} />
        <polyline className="home-chart-line is-revenue" points={line("revenue")} />
        <polyline className="home-chart-line is-profit" points={line("profit")} />
      </svg>
    </>
  );
}

/* ---------------------------------------------------------------- Banking */

export function BankingCardBody({ size, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const transactions = data.bankTransactions;
  if (transactions.length === 0) return null;

  const money = (value: number) => cash(value, hideNumbers, moneySettings);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = transactions.filter((tx) => tx.bookingDate && tx.bookingDate >= monthStart);
  const incoming = thisMonth.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const spent = thisMonth.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const toReview = transactions.filter((tx) => !tx.reviewed).length;
  const missingReceipts = transactions.filter((tx) => tx.amount < 0 && !tx.hasReceipt).length;

  // 1x1: the queue, because that is the card's whole job — never Money's
  // totals again (§7).
  if (size === "1x1") {
    return (
      <div className="home-money">
        <div className="home-count-pair">
          <span><b className={toReview > 0 ? "is-warning" : ""}>{toReview}</b><em>{t("to review")}</em></span>
          <span><b className={missingReceipts > 0 ? "is-warning" : ""}>{missingReceipts}</b><em>{t("missing receipts")}</em></span>
        </div>
        <p className="home-readonly-note">
          <span className="home-pill is-warning">{t("Read-only")}</span>
          {t("NivaDesk never moves money.")}
        </p>
      </div>
    );
  }

  const tiles = (
    <div className="home-tile-row">
      <MoneyTile label={t("Incoming this month")} value={`+${money(incoming)}`} tone="green" />
      <MoneyTile label={t("Spent this month")} value={`−${money(spent)}`} tone="orange" />
      <MoneyTile label={t("to review")} value={String(toReview)} tone={toReview > 0 ? "orange" : "blue"} />
      <MoneyTile label={t("missing receipts")} value={String(missingReceipts)} tone={missingReceipts > 0 ? "orange" : "blue"} />
    </div>
  );

  if (size === "2x1") {
    return (
      <div className="home-money is-wide">
        {tiles}
        <p className="home-readonly-note">
          <span className="home-pill is-warning">{t("Read-only")}</span>
          {t("Read-only bank connection. NivaDesk never moves money.")}
        </p>
      </div>
    );
  }

  const recent = transactions.slice(0, 3);
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const year = transactions.filter((tx) => tx.bookingDate && tx.bookingDate >= yearStart);
  const yearIn = year.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
  const yearOut = year.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return (
    <div className="home-money is-large">
      {tiles}
      <div className="home-money-panels">
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Bank activity")}</p>
          <BankActivityChart transactions={transactions} t={t} />
        </div>
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Recent transactions")}</p>
          <ul className="home-cost-list">
            {recent.map((tx) => (
              <li key={tx.id}>
                <span className="home-avatar" aria-hidden="true">{(tx.name || "?").slice(0, 1).toUpperCase()}</span>
                <em>{tx.name || t("Transactions")}</em>
                <b className={tx.amount < 0 ? "is-warning" : "is-positive"}>
                  {tx.amount < 0 ? "−" : "+"}{money(Math.abs(tx.amount))}
                </b>
              </li>
            ))}
          </ul>
          <p className="home-year-line">
            {t("This year")}: <b className="is-positive">{money(yearIn)}</b> · <b className="is-warning">{money(yearOut)}</b>
          </p>
        </div>
      </div>
      {missingReceipts > 0 ? (
        <div className="home-alert-strip">
          <span className="home-alert-dot" aria-hidden="true">!</span>
          <span>
            <strong>{t("{count} transactions need a receipt").replace("{count}", String(missingReceipts))}</strong>
            <em>{t("Read-only bank connection. NivaDesk never moves money.")}</em>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Money in and money out, week by week, from the feed itself. */
function BankActivityChart({ transactions, t }: { transactions: HomeData["bankTransactions"]; t: (text: string) => string }) {
  const weeks = 12;
  const now = new Date();
  const buckets = Array.from({ length: weeks }, () => ({ incoming: 0, spent: 0 }));
  for (const tx of transactions) {
    if (!tx.bookingDate) continue;
    const weeksAgo = Math.floor((now.getTime() - tx.bookingDate.getTime()) / (7 * 24 * 3600 * 1000));
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    const bucket = buckets[weeks - 1 - weeksAgo];
    if (tx.amount >= 0) bucket.incoming += tx.amount;
    else bucket.spent += Math.abs(tx.amount);
  }
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.incoming, b.spent)));
  const width = 100;
  const height = 46;
  const line = (key: "incoming" | "spent") =>
    buckets.map((b, i) => `${(i / (weeks - 1)) * width},${height - (b[key] / peak) * height}`).join(" ");

  if (buckets.every((b) => b.incoming === 0 && b.spent === 0)) {
    return <p className="home-card-note">{t("Not enough history yet.")}</p>;
  }
  return (
    <>
      <p className="home-chart-key">
        <span><i className="is-profit" aria-hidden="true" />{t("Incoming")}</span>
        <span><i className="is-spent" aria-hidden="true" />{t("Spent")}</span>
      </p>
      <svg className="home-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
           aria-label={t("Bank activity")}>
        <polygon className="home-chart-area is-profit" points={`0,${height} ${line("incoming")} ${width},${height}`} />
        <polyline className="home-chart-line is-profit" points={line("incoming")} />
        <polyline className="home-chart-line is-spent" points={line("spent")} />
      </svg>
    </>
  );
}

/* -------------------------------------------------------------- Inventory */

export function InventoryCardBody({ size, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const summary = data.inventory;
  if (!summary) return null;
  const money = (value: number) => cash(value, hideNumbers, moneySettings);

  if (size === "1x1") {
    return (
      <div className="home-money">
        <p className="home-metric-label">{t("total value")}</p>
        <strong className="home-metric-value">{money(summary.totalValue)}</strong>
        <div className="home-split-pair">
          <span><em>{t("low stock")}</em><b className={summary.lowStockCount > 0 ? "is-warning" : ""}>{summary.lowStockCount}</b></span>
          <span><em>{t("incoming")}</em><b className="is-positive">{summary.incomingCount}</b></span>
        </div>
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
    return (
      <div className="home-money is-wide">
        {tiles}
        <ul className="home-cost-list is-compact">
          <li><span className="home-cost-dot tone-0" aria-hidden="true" /><em>{t("Reserved")}</em><b>{money(summary.reservedValue)}</b></li>
          <li><span className="home-cost-dot tone-2" aria-hidden="true" /><em>{t("incoming")}</em><b>{money(summary.incomingValue)}</b></li>
          <li><span className="home-cost-dot tone-3" aria-hidden="true" /><em>{t("Customer owned")}</em><b>{summary.customerOwnedCount}</b></li>
        </ul>
      </div>
    );
  }

  // Unique and quantity are different things and the split is the point (§8).
  const total = summary.uniqueValue + summary.quantityValue;
  const uniqueShare = total > 0 ? (summary.uniqueValue / total) * 100 : 0;
  return (
    <div className="home-money is-large">
      {tiles}
      <div className="home-money-panels">
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Inventory value")}</p>
          <div className="home-donut-row">
            <Donut share={uniqueShare} />
            <ul className="home-donut-key">
              <li>
                <span className="home-cost-dot is-small tone-unique" aria-hidden="true" />
                <em>{t("Unique items")}</em><b>{money(summary.uniqueValue)}</b>
                <i>{uniqueShare.toFixed(1)}%</i>
              </li>
              <li>
                <span className="home-cost-dot is-small tone-quantity" aria-hidden="true" />
                <em>{t("Quantity stock")}</em><b>{money(summary.quantityValue)}</b>
                <i>{(100 - uniqueShare).toFixed(1)}%</i>
              </li>
            </ul>
          </div>
        </div>
        <div className="home-panel">
          <p className="home-eyebrow is-strong">{t("Stock status")}</p>
          <ul className="home-cost-list">
            <li>
              <span className="home-cost-dot tone-0" aria-hidden="true" />
              <em>{t("Reserved")}<i>{summary.reservedCount} {t("items")}</i></em>
              <b>{money(summary.reservedValue)}</b>
            </li>
            <li>
              <span className="home-cost-dot tone-2" aria-hidden="true" />
              <em>{t("incoming")}<i>{summary.incomingCount} {t("items")}</i></em>
              <b>{money(summary.incomingValue)}</b>
            </li>
            <li>
              <span className="home-cost-dot tone-low" aria-hidden="true" />
              <em>{t("low stock")}<i>{summary.lowStockCount} {t("items")}</i></em>
              <b />
            </li>
          </ul>
        </div>
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
    return (
      <div className="home-money">
        <p className="home-metric-label">{t("active orders")}</p>
        <strong className="home-metric-value is-info">{open.length}</strong>
        <div className="home-split-pair">
          <span><em>{t("Overdue")}</em><b className={late.length > 0 ? "is-warning" : ""}>{late.length}</b></span>
          <span><em>{t("Ready to ship")}</em><b className="is-positive">
            {byStage.filter((s) => s.kind === "shipready").reduce((sum, s) => sum + s.count, 0)}
          </b></span>
        </div>
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
    return <div className="home-money is-wide"><p className="home-eyebrow is-strong">{t("Production flow")}</p>{flow}</div>;
  }

  const priority = [...late, ...open.filter((o) => !late.includes(o))].slice(0, 3);
  return (
    <div className="home-money is-large">
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

export function ScheduleCardBody({ size, data, t }: CardBodyProps) {
  // Dates and deadlines only — never production status again (§10).
  const open = data.scheduleOrders.filter((order) => !order.isDelivered && order.dueDate);
  if (open.length === 0) return null;
  const upcoming = [...open].sort((a, b) => (a.dueDate!.getTime()) - (b.dueDate!.getTime()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayLabel = (date: Date) => {
    const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
    if (days === 0) return t("Today");
    if (days === 1) return t("Tomorrow");
    if (days < 0) return t("Overdue");
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };

  if (size === "1x1") {
    return (
      <ul className="home-record-list">
        {upcoming.slice(0, 3).map((order) => (
          <li key={order.id}>
            <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
              {order.customerName || order.designName}
            </Link>
            <span className={order.dueDate! < today ? "home-chip is-late" : "home-chip is-muted"}>
              {dayLabel(order.dueDate!)}
            </span>
          </li>
        ))}
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

  const deadlines = (
    <ul className="home-deadline-row">
      {upcoming.slice(0, 3).map((order) => {
        const overdue = order.dueDate! < today;
        const tone = overdue ? "red" : dayLabel(order.dueDate!) === t("Tomorrow") ? "blue" : "green";
        return (
          <li key={order.id}>
            <span className={`home-deadline-dot tone-${tone}`} aria-hidden="true" />
            <span>
              <em className={`tone-${tone}`}>{dayLabel(order.dueDate!)}</em>
              <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                {order.customerName || order.designName}
              </Link>
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (size === "2x1") {
    return (
      <div className="home-money is-wide">
        <ol className="home-week-strip">
          {days.map((date) => {
            const count = open.filter((order) => order.dueDate!.toDateString() === date.toDateString()).length;
            const isToday = date.getTime() === today.getTime();
            return (
              <li key={date.toISOString()} className={isToday ? "is-today" : ""}>
                <em>{date.toLocaleDateString(undefined, { weekday: "short" })}</em>
                <b>{date.getDate()}</b>
                <i className={count > 0 ? "has-work" : ""}>{count > 0 ? count : ""}</i>
              </li>
            );
          })}
        </ol>
        {deadlines}
      </div>
    );
  }

  // A read-only bar per order across the week. Read-only on purpose: dragging a
  // date here would fight the gesture that moves the card itself (§10).
  const weekEnd = new Date(days[6]);
  weekEnd.setHours(23, 59, 59, 999);
  const bars = upcoming
    .filter((order) => order.dueDate! >= weekStart && (order.paymentDate ?? order.dueDate!) <= weekEnd)
    .slice(0, 5);
  const span = weekEnd.getTime() - weekStart.getTime();
  const pct = (date: Date) =>
    Math.max(0, Math.min(100, ((date.getTime() - weekStart.getTime()) / span) * 100));

  return (
    <div className="home-money is-large">
      <p className="home-eyebrow is-strong">{t("Weekly timeline")}</p>
      <div className="home-timeline">
        <ol className="home-timeline-head">
          {days.map((date) => (
            <li key={date.toISOString()} className={date.getTime() === today.getTime() ? "is-today" : ""}>
              {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
            </li>
          ))}
        </ol>
        <ul className="home-timeline-rows">
          {bars.map((order, index) => {
            const from = pct(order.paymentDate ?? weekStart);
            const to = pct(order.dueDate!);
            const overdue = order.dueDate! < today;
            return (
              <li key={order.id}>
                <span className="home-timeline-name">{order.customerName || order.designName}</span>
                <span className="home-timeline-track">
                  <i
                    className={overdue ? "tone-red" : `tone-${["blue", "green", "purple", "amber", "teal"][index % 5]}`}
                    style={{ left: `${Math.min(from, to)}%`, width: `${Math.max(4, Math.abs(to - from))}%` }}
                  >
                    {overdue ? t("Overdue") : ""}
                  </i>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="home-eyebrow is-strong">{t("Upcoming deadlines")}</p>
      {deadlines}
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
function activityTone(type: string) {
  const key = type.toLowerCase();
  if (key.includes("payment")) return "green";
  if (key.includes("order")) return "purple";
  if (key.includes("production") || key.includes("status")) return "blue";
  if (key.includes("file")) return "amber";
  if (key.includes("inventory")) return "orange";
  if (key.includes("customer")) return "teal";
  if (key.includes("schedule")) return "blue";
  return "slate";
}

export function RecentActivityCardBody({ size, data, t }: CardBodyProps) {
  // The workspace's own stream, already filtered to what this user is a
  // recipient of — activity never widens what someone can see (§12).
  const rows = data.activity.slice(0, size === "1x1" ? 3 : size === "2x1" ? 5 : 8);
  if (rows.length === 0) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);

  const relative = (millis: number) => {
    if (!millis) return "";
    const minutes = Math.max(1, Math.round((Date.now() - millis) / 60000));
    if (minutes < 60) return `${minutes} ${t("min ago")}`;
    if (millis >= startOfToday.getTime()) return `${Math.round(minutes / 60)}h`;
    if (millis >= startOfYesterday.getTime()) return t("Yesterday");
    return new Date(millis).toLocaleDateString();
  };

  const row = (item: (typeof rows)[number]) => (
    <li key={item.id}>
      <span className={`home-activity-mark tone-${activityTone(item.type)}`} aria-hidden="true" />
      <span className="home-activity-text">
        <strong>{item.title || t("Update")}</strong>
        {size !== "1x1" && item.message ? <em>{item.message}</em> : null}
      </span>
      {size === "2x2" && item.senderName ? <span className="home-chip is-muted">{item.senderName}</span> : null}
      <span className="home-activity-when">{relative(item.createdAtMillis)}</span>
    </li>
  );

  if (size !== "2x2") {
    return <ul className="home-activity-list">{rows.map(row)}</ul>;
  }

  const today = rows.filter((item) => item.createdAtMillis >= startOfToday.getTime());
  const earlier = rows.filter((item) => item.createdAtMillis < startOfToday.getTime());
  return (
    <div className="home-money is-large">
      {today.length > 0 ? (
        <>
          <p className="home-eyebrow is-strong">{t("Today")}</p>
          <ul className="home-activity-list">{today.map(row)}</ul>
        </>
      ) : null}
      {earlier.length > 0 ? (
        <>
          <p className="home-eyebrow is-strong">{t("Earlier")}</p>
          <ul className="home-activity-list">{earlier.map(row)}</ul>
        </>
      ) : null}
      <p className="home-action-note">{t("Only activity you have permission to view is shown")}</p>
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

export function FilesCardBody({ size, data, t }: CardBodyProps) {
  const files = data.files;
  if (files.length === 0) return null;

  // One file, linked to as many records as it belongs to — the card counts
  // files, never copies (§14).
  const unlinked = files.filter((file) => !file.orderId);
  const used = files.reduce((sum, file) => sum + (file.fileSize || 0), 0);

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

  if (size === "1x1") {
    return (
      <div className="home-money">
        <p className="home-metric-label">{t("Total files")}</p>
        <strong className="home-metric-value is-info">{files.length}</strong>
        <div className="home-split-pair">
          <span><em>{t("Storage")}</em><b className="is-plain">{humanSize(used)}</b></span>
          <span><em>{t("Unlinked")}</em><b className={unlinked.length > 0 ? "is-warning" : ""}>{unlinked.length}</b></span>
        </div>
      </div>
    );
  }

  const tiles = (
    <div className="home-tile-row is-triple">
      <MoneyTile label={t("Total files")} value={String(files.length)} tone="blue" />
      <MoneyTile label={t("Storage")} value={humanSize(used)} tone="green" />
      <MoneyTile label={t("Unlinked")} value={String(unlinked.length)} tone={unlinked.length > 0 ? "orange" : "blue"} />
    </div>
  );

  if (size === "2x1") {
    return (
      <div className="home-money is-wide">
        {tiles}
        <ul className="home-record-list">{files.slice(0, 3).map(row)}</ul>
      </div>
    );
  }

  return (
    <div className="home-money is-large">
      {tiles}
      <div className="home-money-panels">
        <div className="home-panel is-flush">
          <p className="home-eyebrow is-strong">{t("Recent files")}</p>
          <ul className="home-record-list">{files.slice(0, 5).map(row)}</ul>
        </div>
        <div className="home-panel is-flush">
          <p className="home-eyebrow is-strong">{t("Needs linking")}</p>
          {unlinked.length === 0 ? (
            <p className="home-card-note">{t("All set — nice work.")}</p>
          ) : (
            <>
              <p className="home-card-note">
                {t("{count} files are not linked to a record.").replace("{count}", String(unlinked.length))}
              </p>
              <ul className="home-record-list">{unlinked.slice(0, 3).map(row)}</ul>
            </>
          )}
        </div>
      </div>
      <p className="home-action-note">{t("One file, multiple links — no duplicates.")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Notes */

export function NotesCardBody({ size, data, t }: CardBodyProps) {
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
      {pinned.length > 0 ? (
        <>
          <p className="home-eyebrow is-strong">{t("Pinned")}</p>
          <div className="home-note-grid">
            {pinned.slice(0, 2).map((note) => <NoteTile key={note.id} note={note} t={t} />)}
          </div>
        </>
      ) : null}
      <p className="home-eyebrow is-strong">{t("Recent")}</p>
      <div className="home-note-grid">
        {recent.slice(0, pinned.length > 0 ? 4 : 6).map((note) => <NoteTile key={note.id} note={note} t={t} />)}
      </div>
    </div>
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
    <Link className={`home-note tone-${note.colorName || "default"}`} href={`/notes?note=${encodeURIComponent(note.id)}`}>
      <strong>{note.title || t("Untitled note")}</strong>
      {note.text ? <p>{note.text}</p> : null}
      <span className="home-note-foot">
        {chip ? <span className="home-chip is-muted">{chip}</span> : null}
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
  { id: "shop", label: "Connect your shop", blurb: "Bring Shopify or WooCommerce orders in automatically.", href: "/settings?section=integrations", cta: "Connect shop" },
  { id: "inventory", label: "Add an inventory item", blurb: "Track what you own, what is reserved and what is low.", href: "/inventory?new=1", cta: "Add item" },
  { id: "bank", label: "Connect your bank", blurb: "Read-only. Spending arrives and you categorise it.", href: "/bank", cta: "Connect bank" },
] as const;

export function GettingStartedCardBody({ size, data, t }: CardBodyProps) {
  const steps = SETUP_STEPS.map((step) => ({
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

  // 1x1 has no room for the completed list, so it leads with the next step and
  // shows what is still open underneath.
  if (size === "1x1") {
    return (
      <div className="home-setup">
        <HomeProgress complete={complete} total={steps.length} t={t} />
        {next ? (
          <>
            <p className="home-eyebrow">{t("Next step")}</p>
            <NextStepPanel step={next} t={t} compact />
          </>
        ) : (
          <p className="home-card-note">{t("All set — nice work.")}</p>
        )}
        <ul className="home-check-list">
          {todo.slice(0, 2).map((step) => (
            <li key={step.id}><span className="home-check is-todo" aria-hidden="true" />{t(step.label)}</li>
          ))}
        </ul>
      </div>
    );
  }

  // 2x1: what is done on the left, what is next on the right (§15 — never a
  // blocking wall, always one obvious continue).
  if (size === "2x1") {
    return (
      <div className="home-setup is-split">
        <HomeProgress complete={complete} total={steps.length} t={t} hideLabel />
        <div className="home-setup-columns">
          <div>
            <p className="home-eyebrow is-strong">{t("Completed")}</p>
            <ul className="home-check-list">
              {done.slice(0, 3).map((step) => (
                <li key={step.id}><span className="home-check is-done" aria-hidden="true" />{t(step.label)}</li>
              ))}
            </ul>
          </div>
          <div>
            {next ? <NextStepPanel step={next} t={t} inline /> : <p className="home-card-note">{t("All set — nice work.")}</p>}
            <ul className="home-check-list">
              {todo.slice(0, 2).map((step) => (
                <li key={step.id}><span className="home-check is-todo" aria-hidden="true" />{t(step.label)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // 2x2: the whole checklist with the current step called out, beside the
  // recommendation, and a note that the list adapts to the workspace.
  return (
    <div className="home-setup is-large">
      <HomeProgress complete={complete} total={steps.length} t={t} hideLabel />
      <div className="home-setup-columns">
        <div className="home-setup-panel">
          <p className="home-eyebrow is-strong">{t("Your checklist")}</p>
          <ul className="home-check-list is-full">
            {steps.map((step) => (
              <li key={step.id} className={step.id === next?.id ? "is-current" : ""}>
                <span
                  className={step.done ? "home-check is-done" : step.id === next?.id ? "home-check is-current" : "home-check is-todo"}
                  aria-hidden="true"
                />
                {t(step.label)}
              </li>
            ))}
          </ul>
        </div>
        {next ? <NextStepPanel step={next} t={t} large /> : (
          <div className="home-next-panel"><p className="home-card-note">{t("All set — nice work.")}</p></div>
        )}
      </div>
      <div className="home-tip">
        <span className="home-tip-icon" aria-hidden="true">💡</span>
        <span>
          <strong>{t("Your setup adapts to you")}</strong>
          <em>{t("Steps change with your plan, permissions and workflow.")}</em>
        </span>
      </div>
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

function NextStepPanel({
  step, t, compact, inline, large,
}: {
  step: { label: string; blurb: string; href: string; cta: string };
  t: (text: string) => string;
  compact?: boolean; inline?: boolean; large?: boolean;
}) {
  return (
    <div className={`home-next-panel${inline ? " is-inline" : ""}${large ? " is-large" : ""}`}>
      {large ? <p className="home-eyebrow is-accent">{t("Recommended next")}</p> : null}
      {inline ? <p className="home-eyebrow is-accent">{t("Up next")}</p> : null}
      <div className="home-next-body">
        <div>
          <strong>{t(step.label)}</strong>
          <p>{t(step.blurb)}</p>
        </div>
        <Link className="home-next-button" href={step.href}>
          {t(inline ? "Continue" : step.cta)}
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
