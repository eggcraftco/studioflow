"use client";

import Link from "next/link";
import { CardIconGlyph } from "@/components/CardTitle";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import type { BlockHeadingSettings, HeadingItem } from "@/lib/studioflow/blockHeadings";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";

export type OrderListCardItem = {
  id: string;
  customerName: string;
  designName: string;
  designStatus?: string;
  status: string;
  paidAmount: number;
  remainingAmount: number;
  paymentDate?: Date | null;
  dueDate: Date | null;
  isDispatched?: boolean;
  isDelivered?: boolean;
  clientFileCount: number;
  previewImageUrl: string;
  extraStatuses?: Record<string, string>;
};

function money(value: number, hidden: boolean, settings: StudioMoneySettings) {
  if (hidden) return hiddenMoneyLabel(moneySymbol(settings));
  return formatStudioMoney(value, settings);
}

function daysRemaining(date: Date | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function dueLabel(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled") return "Cancelled";
  if (order.isDispatched) return "Dispatched";

  const days = daysRemaining(order.dueDate);
  if (days === null) return "-";
  if (days > 0) return `${days}d`;
  if (days === 0) return "Today";
  return `${Math.abs(days)}d late`;
}

function dueIcon(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled") return "×";
  if (order.isDispatched) return "✓";
  const days = daysRemaining(order.dueDate);
  if (days !== null && days <= 7) return "◷";
  return "▦";
}

function shortDate(date: Date | null | undefined) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

function shouldShowDeliveryCountdown(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  return normalizedStatus !== "done" &&
    normalizedStatus !== "completed" &&
    normalizedStatus !== "cancelled" &&
    normalizedStatus !== "canceled" &&
    !order.isDispatched;
}

function dueTone(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled" || order.isDispatched) return "neutral";
  const days = daysRemaining(order.dueDate);
  if (days === null) return "neutral";
  if (days <= 7) return "danger";
  if (days <= 14) return "warning";
  return "success";
}

function statusTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"].includes(normalized)) return "success";
  if (["not yet", "blocked", "overdue", "urgent"].includes(normalized)) return "danger";
  if (["cancelled", "canceled", "refunded", "new", "quoted", "low"].includes(normalized)) return "neutral";
  return "warning";
}

function shortStepTitle(stepName: string) {
  const cleaned = stepName.replaceAll("/", " ").replaceAll("&", " ").trim();
  const firstWord = cleaned.split(/\s+/)[0] || "ST";
  return firstWord.slice(0, 4).toUpperCase();
}

function availableBadgeSteps(settings?: BlockHeadingSettings | null) {
  const steps = settings?.customSteps
    ?.map(item => item.title.trim())
    .filter(Boolean) ?? [];
  return steps.length > 0 ? steps : ["Design", "Painting"];
}

function resolveBadgeStep(settings: BlockHeadingSettings | null | undefined, slot: 1 | 2) {
  const steps = availableBadgeSteps(settings);
  const stored = settings
    ? (slot === 1 ? settings.orderListStep1 : settings.orderListStep2)
    : (slot === 1 ? "Design" : "Painting");
  const cleaned = stored.trim();
  if (!cleaned) return "";
  if (steps.includes(cleaned)) return cleaned;
  return steps[slot - 1] ?? "";
}

function stepValue(order: OrderListCardItem, settings: BlockHeadingSettings | null | undefined, stepName: string) {
  const steps: HeadingItem[] = settings?.customSteps?.length
    ? settings.customSteps
    : [{ id: "design", title: "Design" }, { id: "painting", title: "Painting" }];
  const index = steps.findIndex(item => item.title === stepName);
  if (index === 0) return order.designStatus || "Not Yet";
  if (index === 1) return order.status || "Not Yet";
  return order.extraStatuses?.[stepName] || "Not Yet";
}

export function OrderListCard({
  order,
  selected,
  canSeeFinance,
  onSelect,
  mobileHref,
  blockHeadingSettings,
  moneySettings
}: {
  order: OrderListCardItem;
  selected: boolean;
  canSeeFinance: boolean;
  canSeeAdvancedFinance: boolean;
  onSelect?: () => void;
  mobileHref?: string;
  blockHeadingSettings?: BlockHeadingSettings | null;
  moneySettings?: StudioMoneySettings;
}) {
  const { hideNumbers } = usePricePrivacy();
  const firstBadgeStep = resolveBadgeStep(blockHeadingSettings, 1);
  const secondBadgeStep = resolveBadgeStep(blockHeadingSettings, 2);
  const customerHref = order.customerName.trim()
    ? `/customers?customerName=${encodeURIComponent(order.customerName.trim())}`
    : "";
  const deliveryCountdown = shouldShowDeliveryCountdown(order) ? dueLabel(order) : "";
  const content = (
    <div className="order-list-card-content">
      <div className="order-list-thumbnail" aria-hidden="true">
        {order.previewImageUrl ? <img src={order.previewImageUrl} alt="" /> : <span className="image-placeholder-icon" aria-hidden="true"><CardIconGlyph icon="photo" /></span>}
      </div>

      <div className="order-list-card-body">
        <div className="order-list-main">
          <div className="order-list-title-row">
            {customerHref && !mobileHref ? (
              <Link
                className="order-customer-name-link"
                href={customerHref}
                onClick={event => event.stopPropagation()}
                title={order.customerName}
                aria-label={`Open ${order.customerName} in Customers`}
              >
                <strong>{order.customerName}</strong>
              </Link>
            ) : (
              <strong title={order.customerName}>{order.customerName}</strong>
            )}
            {deliveryCountdown ? (
              <span className={`order-delivery-badge ${dueTone(order)}`}>
                <span className="order-delivery-icon" aria-hidden="true">{dueIcon(order)}</span>
                {deliveryCountdown}
              </span>
            ) : null}
          </div>

          <div className="order-list-detail-line">
            <span aria-hidden="true">✽</span>
            <span>{order.designName || "-"}</span>
          </div>
          <div className="order-list-detail-line">
            <span aria-hidden="true">▣</span>
            <span>{shortDate(order.paymentDate ?? null)}</span>
          </div>
        </div>

        <div className="order-list-side">
          <div className="order-list-badges">
            {firstBadgeStep ? <OrderStatusBadge stepName={firstBadgeStep} value={stepValue(order, blockHeadingSettings, firstBadgeStep)} /> : null}
            {secondBadgeStep ? <OrderStatusBadge stepName={secondBadgeStep} value={stepValue(order, blockHeadingSettings, secondBadgeStep)} /> : null}
          </div>
          {canSeeFinance ? (
            <strong className={order.status.trim().toLowerCase().includes("cancel") ? "order-list-amount muted" : "order-list-amount"}>
              {money(order.paidAmount, hideNumbers, moneySettings)}
            </strong>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (mobileHref) {
    return (
      <Link href={mobileHref} className={selected ? "order-list-card selected" : "order-list-card"}>
        {content}
      </Link>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={selected ? "order-list-card selected" : "order-list-card"}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
    >
      {content}
    </div>
  );
}

function OrderStatusBadge({ stepName, value }: { stepName: string; value: string }) {
  const tone = statusTone(value);
  return (
    <span className="order-status-badge-row">
      <span className="order-status-abbrev">{shortStepTitle(stepName)}</span>
      <span className={`order-status-value ${tone}`}>{value}</span>
    </span>
  );
}
