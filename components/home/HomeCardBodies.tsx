"use client";

import Link from "next/link";
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
  const counted = data.financeOrders.filter((order) => order.countsTowardBalance !== false);
  const revenue = counted.reduce((total, o) => total + o.paidAmount + o.remainingAmount, 0);
  const received = counted.reduce((total, o) => total + o.paidAmount, 0);
  const outstanding = counted.reduce((total, o) => total + o.remainingAmount, 0);
  const costs = counted.reduce((total, o) => total + o.watchPurchasePrice, 0);
  const fees = counted.reduce((total, o) => total + o.paymentFee, 0);
  const shipping = counted.reduce((total, o) => total + o.deliveryCost, 0);
  const vat = counted.reduce((total, o) => total + o.taxAmount, 0);
  const netProfit = revenue - costs - fees - shipping - vat;

  if (size === "1x1") {
    return (
      <div className="home-money">
        <p className="home-metric-label">{t("Net profit")}</p>
        <strong className="home-metric-value is-positive">{cash(netProfit, hideNumbers, moneySettings)}</strong>
        <div className="home-metric-split">
          <span><em>{t("Revenue")}</em>{cash(revenue, hideNumbers, moneySettings)}</span>
          <span><em>{t("Outstanding")}</em>{cash(outstanding, hideNumbers, moneySettings)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="home-money-wide">
      <div className="home-stat-row">
        <Stat label={t("Revenue")} value={cash(revenue, hideNumbers, moneySettings)} tone="positive" />
        <Stat label={t("Payments received")} value={cash(received, hideNumbers, moneySettings)} tone="positive" />
        <Stat label={t("Outstanding")} value={cash(outstanding, hideNumbers, moneySettings)} tone="info" />
        <Stat label={t("Net profit")} value={cash(netProfit, hideNumbers, moneySettings)} tone="positive" />
      </div>
      {size === "2x2" ? (
        <div className="home-breakdown">
          <p className="home-sub-title">{t("Cost breakdown")}</p>
          <BreakdownRow label={t("Costs")} value={cash(costs, hideNumbers, moneySettings)} />
          <BreakdownRow label={t("Platform fees")} value={cash(fees, hideNumbers, moneySettings)} />
          <BreakdownRow label={t("Shipping")} value={cash(shipping, hideNumbers, moneySettings)} />
          <BreakdownRow label={t("VAT Amount")} value={cash(vat, hideNumbers, moneySettings)} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Banking */

export function BankingCardBody({ size, data, t, moneySettings, hideNumbers }: CardBodyProps) {
  const toReview = data.bankTransactions.filter((tx) => !tx.reviewed).length;
  const missingReceipts = data.bankTransactions.filter((tx) => tx.amount < 0 && !tx.hasReceipt).length;
  const uncategorised = data.bankTransactions.filter((tx) => !tx.categoryId).length;

  if (size === "1x1") {
    return (
      <div className="home-banking">
        <p className="home-count-line"><strong>{toReview}</strong> {t("to review")}</p>
        <p className="home-count-line is-warning"><strong>{missingReceipts}</strong> {t("missing receipts")}</p>
      </div>
    );
  }

  return (
    <div className="home-banking-wide">
      <div className="home-stat-row">
        <Stat label={t("to review")} value={String(toReview)} tone="info" />
        <Stat label={t("missing receipts")} value={String(missingReceipts)} tone="warning" />
        <Stat label={t("uncategorised")} value={String(uncategorised)} tone="warning" />
      </div>
      {size === "2x2" ? (
        <ul className="home-list">
          {data.bankTransactions.filter((tx) => !tx.reviewed).slice(0, 5).map((tx) => (
            <li key={tx.id}>
              <span>{tx.bookingDate ? tx.bookingDate.toLocaleDateString() : "—"}</span>
              <strong className={tx.amount < 0 ? "is-negative" : "is-positive"}>
                {cash(tx.amount, hideNumbers, moneySettings)}
              </strong>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Read-only by design: Banking never offers a way to move money (§7). */}
      <p className="home-card-note">{t("Read-only bank connection. NivaDesk never moves money.")}</p>
    </div>
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

const FLOW_STAGES = ["Ready", "In production", "Waiting", "Quality check", "Ready to ship"];

export function OrdersProductionCardBody({ size, data, t }: CardBodyProps) {
  const open = data.orders.filter((order) => !order.isDelivered);
  const byStage = FLOW_STAGES.map((stage) => ({
    stage,
    count: open.filter((order) => (order.status || "").toLowerCase() === stage.toLowerCase()).length,
  }));
  const overdue = open.filter((order) => order.dueDate && order.dueDate.getTime() < Date.now()).length;

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
          <li key={entry.stage}>
            <span className={`home-flow-dot stage-${index}`} aria-hidden="true" />
            <span className="home-flow-name">{t(entry.stage)}</span>
            <strong>{entry.count}</strong>
          </li>
        ))}
      </ol>
      {size === "2x2" ? (
        <ul className="home-list">
          {open
            .filter((order) => order.dueDate && order.dueDate.getTime() < Date.now())
            .slice(0, 5)
            .map((order) => (
              <li key={order.id}>
                <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
                  {order.designName || order.watchRef || order.customerName}
                </Link>
                <span className="is-warning">{t("Overdue")}</span>
              </li>
            ))}
        </ul>
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
  const rows = data.orders
    .slice()
    .sort((a, b) => (b.paymentDate?.getTime() ?? 0) - (a.paymentDate?.getTime() ?? 0))
    .slice(0, size === "1x1" ? 3 : size === "2x1" ? 5 : 8);

  if (rows.length === 0) return null;

  return (
    <ul className="home-list home-activity">
      {rows.map((order) => (
        <li key={order.id}>
          <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`}>
            {order.designName || order.watchRef || order.customerName}
          </Link>
          <span className="home-activity-status">{t(order.status || "Not Yet")}</span>
        </li>
      ))}
    </ul>
  );
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

const QUICK_ACTIONS: { id: QuickActionId; label: string; primary?: boolean }[] = [
  { id: "order", label: "New order", primary: true },
  { id: "customer", label: "Add customer" },
  { id: "note", label: "Add note" },
  { id: "file", label: "Upload file" },
  { id: "inventory", label: "Add inventory item" },
  // Not "Add expense": NivaDesk has no manual expense form, and it should not
  // pretend to. Spending arrives from the read-only bank feed (§7) and becomes
  // an expense when it is categorised — so the action is the review queue.
  { id: "reviewSpending", label: "Review spending" },
  { id: "receipt", label: "Add receipt" },
  { id: "aiReply", label: "AI reply" },
];

export function QuickActionsCardBody({ size, t, onQuickAction }: CardBodyProps) {
  // Four, six or eight by size (§6). A permission-less action is simply absent
  // and the grid closes up rather than leaving a hole.
  const limit = size === "1x1" ? 4 : size === "2x1" ? 6 : 8;
  return (
    <div className="home-quick-grid">
      {QUICK_ACTIONS.slice(0, limit).map((action) => (
        <button
          key={action.id}
          type="button"
          className={`home-quick-action${action.primary ? " is-primary" : ""}`}
          onClick={() => onQuickAction?.(action.id)}
        >
          {t(action.label)}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- Getting started */

export function GettingStartedCardBody({ size, data, t }: CardBodyProps) {
  const steps = [
    { id: "profile", label: "Set up business profile", done: true },
    { id: "customer", label: "Add your first customer", done: data.customers.length > 0 },
    { id: "order", label: "Create your first order", done: data.orders.length > 0 },
    { id: "inventory", label: "Add an inventory item", done: (data.inventory?.uniqueCount ?? 0) + (data.inventory?.quantityCount ?? 0) > 0 },
    { id: "bank", label: "Connect your bank", done: data.bankTransactions.length > 0 },
    { id: "files", label: "Upload your first file", done: data.files.length > 0 },
  ];
  const complete = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  return (
    <div className="home-getting-started">
      <p className="home-metric-label">
        {t("{done} of {total} complete").replace("{done}", String(complete)).replace("{total}", String(steps.length))}
      </p>
      <div className="home-progress" role="progressbar" aria-valuenow={complete} aria-valuemin={0} aria-valuemax={steps.length}>
        <span style={{ width: `${(complete / steps.length) * 100}%` }} />
      </div>
      {/* Never blocking, never a payment prompt (§15). */}
      {next ? (
        <div className="home-next-step">
          <span className="home-next-label">{t("Up next")}</span>
          <strong>{t(next.label)}</strong>
        </div>
      ) : (
        <p className="home-card-note">{t("All set — nice work.")}</p>
      )}
      {size !== "1x1" ? (
        <ul className="home-check-list">
          {steps.slice(0, size === "2x2" ? 6 : 4).map((step) => (
            <li key={step.id} className={step.done ? "is-done" : ""}>
              <span aria-hidden="true">{step.done ? "✓" : "○"}</span>
              {t(step.label)}
            </li>
          ))}
        </ul>
      ) : null}
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
