"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { CardIconGlyph } from "@/components/CardTitle";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import type { BlockHeadingSettings, HeadingItem } from "@/lib/studioflow/blockHeadings";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";

export type OrderListCardItem = {
  id: string;
  assignedToUid?: string;
  assignedToEmail?: string;
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
  customFields?: Record<string, string>;
  extraStatuses?: Record<string, string>;
};

const SCHEDULE_ITEMS_CUSTOM_KEY = "__scheduleAlertItemsV1";
const SWIFT_REFERENCE_SECONDS = 978307200;

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

function scheduleDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const unixSeconds = value > 2000000000 ? value / 1000 : value + SWIFT_REFERENCE_SECONDS;
    const date = new Date(unixSeconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? scheduleDateValue(numeric) : null;
  }
  return null;
}

function nextScheduleItem(order: OrderListCardItem) {
  const raw = order.customFields?.[SCHEDULE_ITEMS_CUSTOM_KEY];
  if (!raw) return null;
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (!Array.isArray(decoded)) return null;
    const active = decoded
      .filter(item => item && typeof item === "object")
      .map(item => {
        const source = item as Record<string, unknown>;
        return {
          title: String(source.title || "Reminder"),
          dueAt: scheduleDateValue(source.dueAt),
          status: String(source.status || "Pending")
        };
      })
      .filter(item => item.status !== "Done" && item.dueAt);
    if (active.length === 0) return null;
    const now = Date.now();
    active.sort((first, second) => {
      const firstTime = first.dueAt?.getTime() ?? 0;
      const secondTime = second.dueAt?.getTime() ?? 0;
      const firstOverdue = firstTime < now;
      const secondOverdue = secondTime < now;
      if (firstOverdue !== secondOverdue) return firstOverdue ? -1 : 1;
      return firstTime - secondTime;
    });
    return active[0] ?? null;
  } catch {
    return null;
  }
}

function scheduleTone(dueAt: Date | null | undefined) {
  if (!dueAt) return "neutral";
  const hours = (dueAt.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hours < 0) return "danger";
  if (hours <= 24) return "warning";
  return "info";
}

function statusTone(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"].includes(normalized)) return "success";
  if (["not yet", "blocked", "overdue", "urgent"].includes(normalized)) return "danger";
  if (["cancelled", "canceled", "refunded", "new", "quoted", "low"].includes(normalized)) return "neutral";
  return "warning";
}

function shortStepTitle(stepName: string) {
  const normalized = stepName.trim().toLowerCase();
  if (normalized === "design" || normalized === "desi" || normalized === "tasarım") return "DESI";
  if (normalized === "painting" || normalized === "paint" || normalized === "boya" || normalized === "boyama") return "BOYA";
  const cleaned = stepName.replaceAll("/", " ").replaceAll("&", " ").trim();
  const firstWord = cleaned.split(/\s+/)[0] || "ST";
  return firstWord.slice(0, 4).toUpperCase();
}

function localizedCardStatus(value: string, language: string | null | undefined) {
  const displayValue = value.trim() || "Not Yet";
  const normalizedLanguage = String(language || "").toLowerCase();
  const wantsTurkish = normalizedLanguage.includes("türk") || normalizedLanguage === "tr" || normalizedLanguage === "turkish";
  if (!wantsTurkish) return displayValue;

  const normalized = displayValue.toLowerCase();
  if (normalized === "done" || normalized === "completed") return "Bitti";
  if (normalized === "not yet") return "Yapılmadı";
  if (normalized === "in progress") return "Yapılıyor";
  if (normalized === "cancelled" || normalized === "canceled") return "İptal";
  if (normalized === "pending") return "Bekliyor";
  if (normalized === "ready" || normalized === "ready to ship") return "Hazır";
  if (normalized === "waiting for deposit") return "Depozito";
  return displayValue;
}

function displayOrderCustomerName(value: string) {
  const cleaned = value.trim();
  if (!cleaned || ["new order", "new project", "yeni sipariş", "yeni proje"].includes(cleaned.toLowerCase())) {
    return "New Project";
  }
  return cleaned;
}

function initialsForName(value: string) {
  const cleaned = displayNameFromEmail(value) || value.replace(/[._-]+/g, " ").trim();
  const initials = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
  return initials || "•";
}

function displayNameFromEmail(value = "") {
  const localPart = value.trim().replace(/@.*/, "");
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
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
  moneySettings,
  showStatusBadges = true,
  assigneeName = "",
  assigneePhotoURL = "",
  showFirstProjectGuideProjectBubble = false,
  onFirstProjectGuideProjectNext,
  multiSelected = false,
  selectionActive = false
}: {
  order: OrderListCardItem;
  selected: boolean;
  canSeeFinance: boolean;
  canSeeAdvancedFinance: boolean;
  onSelect?: (event?: ReactMouseEvent) => void;
  mobileHref?: string;
  blockHeadingSettings?: BlockHeadingSettings | null;
  moneySettings?: StudioMoneySettings;
  showStatusBadges?: boolean;
  assigneeName?: string;
  assigneePhotoURL?: string;
  showFirstProjectGuideProjectBubble?: boolean;
  onFirstProjectGuideProjectNext?: () => void;
  multiSelected?: boolean;
  selectionActive?: boolean;
}) {
  const { hideNumbers } = usePricePrivacy();
  const firstBadgeStep = resolveBadgeStep(blockHeadingSettings, 1);
  const secondBadgeStep = resolveBadgeStep(blockHeadingSettings, 2);
  const customerName = displayOrderCustomerName(order.customerName);
  const customerHref = order.customerName.trim()
    ? `/customers?customerName=${encodeURIComponent(order.customerName.trim())}`
    : "";
  const deliveryCountdown = shouldShowDeliveryCountdown(order) ? dueLabel(order) : "";
  const scheduleItem = nextScheduleItem(order);
  const assignmentLabel = assigneeName.trim() || displayNameFromEmail(order.assignedToEmail ?? "");
  const displayLanguage = (moneySettings as { selectedLanguage?: string } | null | undefined)?.selectedLanguage;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [guideBubblePosition, setGuideBubblePosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!showFirstProjectGuideProjectBubble) {
      setGuideBubblePosition(null);
      return;
    }

    function updatePosition() {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) {
        setGuideBubblePosition(null);
        return;
      }
      const bubbleWidth = 300;
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - bubbleWidth - 16));
      const top = Math.min(window.innerHeight - 170, rect.bottom + 12);
      setGuideBubblePosition({ left, top: Math.max(16, top) });
    }

    updatePosition();
    const timer = window.setInterval(updatePosition, 250);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showFirstProjectGuideProjectBubble]);

  const guideBubble = showFirstProjectGuideProjectBubble && guideBubblePosition ? (
    <div
      className="first-project-guide-bubble"
      style={{
        position: "fixed",
        left: guideBubblePosition.left,
        top: guideBubblePosition.top,
        width: 300,
        zIndex: 10000,
        border: "3px solid #2563eb",
        borderRadius: 18,
        padding: 16,
        background: "rgba(239, 246, 255, 0.98)",
        boxShadow: "0 22px 55px rgba(37, 99, 235, 0.32)",
        color: "var(--text)"
      }}
      onClick={event => event.stopPropagation()}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#2563eb", marginBottom: 6 }}>Step 2 of 6</div>
      <strong style={{ display: "block", marginBottom: 6 }}>This is your project card.</strong>
      <p style={{ margin: "0 0 12px", color: "var(--muted)", lineHeight: 1.4 }}>
        Each project appears in this list. Select a card to open its workspace on the right.
      </p>
      <button className="button" type="button" onClick={onFirstProjectGuideProjectNext}>
        Next
      </button>
    </div>
  ) : null;

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
                title={customerName}
                aria-label={`Open ${customerName} in Customers`}
              >
                <strong>{customerName}</strong>
              </Link>
            ) : (
              <strong title={customerName}>{customerName}</strong>
            )}
            {deliveryCountdown ? (
              <span className={`order-delivery-badge ${dueTone(order)}`}>
                <span className="order-delivery-icon" aria-hidden="true">{dueIcon(order)}</span>
                {deliveryCountdown}
              </span>
            ) : null}
          </div>

          {assignmentLabel ? (
            <div className="order-list-assignee" title={`Assigned to ${assignmentLabel}`}>
              <span className="order-list-assignee-line" aria-hidden="true" />
              <span className="order-list-assignee-avatar">
                {assigneePhotoURL ? <img src={assigneePhotoURL} alt="" /> : initialsForName(assignmentLabel)}
              </span>
              <span>{`Assigned to ${assignmentLabel}`}</span>
            </div>
          ) : null}

          <div className="order-list-detail-line">
            <span aria-hidden="true">✽</span>
            <span title={order.designName || "Untitled design"}>{order.designName || "Untitled design"}</span>
          </div>
          <div className="order-list-detail-line">
            <span aria-hidden="true">▣</span>
            <span>{shortDate(order.paymentDate ?? null)}</span>
          </div>
          {scheduleItem ? (
            <div className={`order-list-detail-line order-list-schedule-line ${scheduleTone(scheduleItem.dueAt)}`}>
              <span aria-hidden="true">◔</span>
              <span title={scheduleItem.title}>{scheduleItem.title}</span>
            </div>
          ) : null}
        </div>

        <div className="order-list-side">
          {showStatusBadges ? (
            <div className="order-list-badges">
              {firstBadgeStep ? <OrderStatusBadge stepName={firstBadgeStep} value={stepValue(order, blockHeadingSettings, firstBadgeStep)} language={displayLanguage} /> : null}
              {secondBadgeStep ? <OrderStatusBadge stepName={secondBadgeStep} value={stepValue(order, blockHeadingSettings, secondBadgeStep)} language={displayLanguage} /> : null}
            </div>
          ) : null}
          {canSeeFinance ? (
            <strong className={order.status.trim().toLowerCase().includes("cancel") ? "order-list-amount muted" : "order-list-amount"}>
              {money(order.paidAmount, hideNumbers, moneySettings)}
            </strong>
          ) : null}
        </div>
      </div>
    </div>
  );

  const cancelledClass = order.status.trim().toLowerCase().includes("cancel") ? " is-cancelled" : "";

  if (mobileHref) {
    return (
      <Link href={mobileHref} className={(selected ? "order-list-card selected" : "order-list-card") + cancelledClass}>
        {content}
      </Link>
    );
  }

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      className={[
        selected ? "order-list-card selected" : "order-list-card",
        multiSelected ? "multi-selected" : "",
        selectionActive ? "selection-active" : "",
        showFirstProjectGuideProjectBubble ? "first-project-guide-target" : ""
      ].filter(Boolean).join(" ")}
      style={showFirstProjectGuideProjectBubble ? {
        outline: "3px solid #2563eb",
        boxShadow: "0 0 0 6px rgba(37, 99, 235, 0.18), 0 18px 45px rgba(37, 99, 235, 0.22)"
      } : undefined}
      onClick={event => onSelect?.(event)}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
    >
      {selectionActive ? (
        <span className={`order-list-select-indicator${multiSelected ? " checked" : ""}`} aria-hidden="true">
          {multiSelected ? "✓" : ""}
        </span>
      ) : null}
      {content}
      {guideBubble}
    </div>
  );
}

function OrderStatusBadge({ stepName, value, language }: { stepName: string; value: string; language?: string }) {
  const displayValue = value.trim() || "Not Yet";
  const tone = statusTone(displayValue);
  return (
    <span className="order-status-badge-row">
      <span className="order-status-abbrev">{shortStepTitle(stepName)}</span>
      <span className={`order-status-value ${tone}`}>{localizedCardStatus(displayValue, language)}</span>
    </span>
  );
}
