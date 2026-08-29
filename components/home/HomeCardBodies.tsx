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

function MoneyTile({ label, value, tone }: { label: string; value: string; tone: "green" | "blue" | "orange" }) {
  return (
    <div className={`home-money-tile tone-${tone}`}>
      <span className="home-money-tile-dot" aria-hidden="true" />
      <em>{label}</em>
      <b>{value}</b>
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

  if (size === "1x1") {
    return (
      <div className="home-inventory">
        <strong className="home-metric-value">{cash(summary.totalValue, hideNumbers, moneySettings)}</strong>
        <p className="home-metric-label">{t("total value")}</p>
        <div className="home-metric-split">
          <span className="is-warning"><em>{summary.lowStockCount}</em>{t("low stock")}</span>
          <span className="is-positive"><em>{summary.incomingCount}</em>{t("incoming")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="home-inventory-wide">
      <div className="home-stat-row">
        <Stat label={t("total value")} value={cash(summary.totalValue, hideNumbers, moneySettings)} />
        <Stat label={t("low stock")} value={String(summary.lowStockCount)} tone="warning" />
        <Stat label={t("Reserved")} value={String(summary.reservedCount)} tone="info" />
        <Stat label={t("incoming")} value={String(summary.incomingCount)} tone="positive" />
      </div>
      {size === "2x2" ? (
        <div className="home-breakdown">
          {/* Unique and quantity are different things and must stay apart (§8). */}
          <BreakdownRow label={t("Unique items")} value={String(summary.uniqueCount)} />
          <BreakdownRow label={t("Quantity stock")} value={String(summary.quantityCount)} />
          <BreakdownRow label={t("Customer owned")} value={String(summary.customerOwnedCount)} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------ Orders/production */

export function OrdersProductionCardBody({ size, data, t }: CardBodyProps) {
  // scheduleOrders, not orders: the lighter recent-orders shape leaves out
  // productionBlocker and productionStageOverride, so a blocked order would miss
  // the Blocked lane and one the user dragged somewhere would drift back to the
  // derived lane — Home and the Production board disagreeing about the same job.
  const open = data.scheduleOrders.filter((order) => !order.isDelivered);
  // The stage is never stored: it is derived from the order's own steps against
  // the workspace's own stages, by the same rule the Production screen uses.
  // Matching order.status against a hard-coded list was a second, incompatible
  // definition, and it read zero for every stage.
  const resolved = open.map((order) => ({
    order,
    stageId: resolveProductionStage(order, data.productionStages, data.productionSteps).stageId,
  }));
  const byStage = data.productionStages.map((stage) => ({
    stage: stage.title,
    kind: stage.kind,
    count: resolved.filter((entry) => entry.stageId === stage.id).length,
  }));
  const late = open.filter((order) => order.dueDate && order.dueDate.getTime() < Date.now());
  const overdue = late.length;

  if (size === "1x1") {
    return (
      <div className="home-orders">
        <strong className="home-metric-value">{open.length}</strong>
        <p className="home-metric-label">{t("active orders")}</p>
        {overdue > 0 ? <p className="home-count-line is-warning"><strong>{overdue}</strong> {t("Overdue")}</p> : null}
      </div>
    );
  }

  return (
    <div className="home-flow">
      {/* The KPI row and the flow must not say the same thing twice (§9), so the
          stage counts ARE the content here rather than a repeat above it. */}
      <ol className="home-flow-row">
        {byStage.map((entry, index) => (
          <li key={`${entry.stage}-${index}`}>
            {/* Keyed to the stage's kind, not its position: a workspace may define
                any number of stages, and an index-coloured dot runs out. */}
            <span className={`home-flow-dot kind-${entry.kind}`} aria-hidden="true" />
            <span className="home-flow-name">{t(entry.stage)}</span>
            <strong>{entry.count}</strong>
          </li>
        ))}
      </ol>
      {size === "2x2" ? (
        <>
          <p className="home-section-label">{t("At risk")}</p>
          {/* A bigger card has to earn its space. When nothing is late it says so
              rather than leaving the extra height blank, which reads as broken. */}
          {late.length === 0 ? (
            <p className="home-card-note">{t("All set — nice work.")}</p>
          ) : null}
        <ul className="home-list">
          {late.map((order) => (
              <li key={order.id}>
                <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                  {order.designName || order.watchRef || order.customerName}
                </Link>
                <span className="is-warning">{t("Overdue")}</span>
              </li>
            ))}
        </ul>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Schedule */

export function ScheduleCardBody({ size, data, t }: CardBodyProps) {
  const upcoming = data.scheduleOrders
    .filter((order) => order.dueDate && !order.isDelivered)
    .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
    .slice(0, size === "2x2" ? 8 : 4);

  if (upcoming.length === 0) return null;

  return (
    <div className="home-schedule">
      {/* Read-only on Home (§10): the card itself is draggable, and a timeline
          bar you can also drag would fight the card for the same gesture. */}
      <ul className="home-list">
        {upcoming.map((order) => {
          const due = order.dueDate!;
          const late = due.getTime() < Date.now();
          return (
            <li key={order.id}>
              <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                {order.designName || order.watchRef || order.customerName}
              </Link>
              <span className={late ? "is-warning" : ""}>
                {due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- Customers */

export function CustomersCardBody({ size, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const total = data.customers.length;
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const active = data.customers.filter((customer) =>
    customer.orders.some((order) => order.paymentDate && order.paymentDate.getTime() > monthAgo),
  ).length;
  const owing = data.customers.filter((customer) => customer.totalOutstanding > 0);

  if (size === "1x1") {
    return (
      <div className="home-customers">
        <strong className="home-metric-value">{total}</strong>
        <p className="home-metric-label">{t("customers")}</p>
        <div className="home-metric-split">
          <span className="is-positive"><em>{active}</em>{t("active")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="home-customers-wide">
      <div className="home-stat-row">
        <Stat label={t("customers")} value={String(total)} />
        <Stat label={t("active")} value={String(active)} tone="positive" />
        <Stat label={t("Outstanding")} value={String(owing.length)} tone="warning" />
      </div>
      {size === "2x2" ? (
        <ul className="home-list">
          {owing.slice(0, 5).map((customer) => (
            <li key={customer.id}>
              <Link href={`/customers?customerName=${encodeURIComponent(customer.name)}`}>{customer.name}</Link>
              <strong className="is-warning">{cash(customer.totalOutstanding, hideNumbers, moneySettings)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------- Recent activity */

export function RecentActivityCardBody({ size, data, t }: CardBodyProps) {
  // The workspace's own notification stream, not a second list of orders sorted
  // by date — that was the Orders card again under a different heading, which is
  // exactly what §5 says this card must not be.
  const rows = data.activity.slice(0, size === "1x1" ? 3 : size === "2x1" ? 5 : 8);

  if (rows.length === 0) return null;

  return (
    <ul className="home-list home-activity">
      {rows.map((item) => {
        const line = (
          <>
            <span className="home-activity-title">{item.title || t("Update")}</span>
            {size !== "1x1" && item.message ? (
              <span className="home-activity-message">{item.message}</span>
            ) : null}
          </>
        );
        return (
          <li key={item.id}>
            {item.orderId ? (
              <Link href={`/orders?selectedOrderId=${encodeURIComponent(item.orderId)}`}>{line}</Link>
            ) : (
              <span>{line}</span>
            )}
            <span className="home-activity-status">{homeRelative(item.createdAtMillis, t)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "12 min ago" while it is fresh, then a plain date. */
function homeRelative(millis: number, t: (text: string) => string) {
  if (!millis) return "";
  const minutes = Math.max(1, Math.round((Date.now() - millis) / 60000));
  if (minutes < 60) return `${minutes} ${t("min ago")}`;
  return new Date(millis).toLocaleDateString();
}

/* ------------------------------------------------------------------ Files */

export function FilesCardBody({ size, data, t }: CardBodyProps) {
  const rows = data.files.slice(0, size === "1x1" ? 3 : size === "2x1" ? 4 : 8);
  if (rows.length === 0) return null;

  return (
    <ul className="home-list home-files">
      {rows.map((file) => (
        <li key={file.fileId || file.id}>
          <Link href="/files">{file.fileName}</Link>
          {/* One file, many relationships (§14) — the chips are the links, not
              copies of the file. */}
          {file.orderId ? (
            <span className="home-chip">{file.designName || file.customerName || t("Order")}</span>
          ) : (
            <span className="home-chip is-muted">{t("Unlinked")}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Notes */

export function NotesCardBody({ size, data, t }: CardBodyProps) {
  const rows = data.orders
    .filter((order) => (order.notes || "").trim())
    .slice(0, size === "1x1" ? 2 : size === "2x1" ? 3 : 6);

  if (rows.length === 0) return null;

  return (
    <div className="home-notes">
      {rows.map((order) => (
        <article key={order.id} className="home-note">
          <p>{order.notes.slice(0, 140)}</p>
          <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`} className="home-chip">
            {order.designName || order.watchRef || order.customerName}
          </Link>
        </article>
      ))}
    </div>
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
