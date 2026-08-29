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
