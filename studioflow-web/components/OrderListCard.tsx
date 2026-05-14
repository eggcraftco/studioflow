"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CardIconGlyph } from "@/components/CardTitle";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import type {
  BlockHeadingSettings,
  HeadingItem,
} from "@/lib/studioflow/blockHeadings";
import { studioT } from "@/lib/studioflow/language";
import {
  formatStudioMoney,
  moneySymbol,
  type StudioMoneySettings,
} from "@/lib/studioflow/money";

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

type FirstProjectGuideStep = 1 | 2 | 3 | 4 | 5 | 6;

type FirstProjectGuideState = {
  step: FirstProjectGuideStep;
  orderId?: string;
  completed?: boolean;
};

const FIRST_PROJECT_GUIDE_EVENT = "studioflow-web-first-project-guide-updated";

function currentFirstProjectGuideStorageKey() {
  if (typeof window === "undefined") return "";
  try {
    const activeKey = window.localStorage.getItem(
      "studioflow-web-first-project-guide-active-key",
    );
    if (activeKey?.startsWith("studioflow-web-first-project-guide-v1:"))
      return activeKey;
    return (
      Object.keys(window.localStorage).find((key) =>
        key.startsWith("studioflow-web-first-project-guide-v1:"),
      ) ?? ""
    );
  } catch {
    return "";
  }
}

function readCurrentFirstProjectGuideState(): FirstProjectGuideState | null {
  if (typeof window === "undefined") return null;
  try {
    const matchingKey = currentFirstProjectGuideStorageKey();
    if (!matchingKey) return null;
    const raw = window.localStorage.getItem(matchingKey);
    if (!raw) return null;
    return JSON.parse(raw) as FirstProjectGuideState;
  } catch {
    return null;
  }
}

function broadcastFirstProjectGuideState(next: FirstProjectGuideState) {
  if (typeof window === "undefined") return;
  try {
    const matchingKey = currentFirstProjectGuideStorageKey();
    if (matchingKey)
      window.localStorage.setItem(matchingKey, JSON.stringify(next));
  } catch {
    // The guide can still move forward in memory through the event.
  }
  window.dispatchEvent(
    new CustomEvent(FIRST_PROJECT_GUIDE_EVENT, { detail: next }),
  );
}

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
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled")
    return "Cancelled";
  if (order.isDispatched) return "Dispatched";

  const days = daysRemaining(order.dueDate);
  if (days === null) return "-";
  if (days > 0) return `${days}d`;
  if (days === 0) return "Today";
  return `${Math.abs(days)}d late`;
}

function dueIcon(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled")
    return "×";
  if (order.isDispatched) return "✓";
  const days = daysRemaining(order.dueDate);
  if (days !== null && days <= 7) return "◷";
  return "▦";
}

function shortDate(date: Date | null | undefined) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function shouldShowDeliveryCountdown(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  return (
    normalizedStatus !== "done" &&
    normalizedStatus !== "completed" &&
    normalizedStatus !== "cancelled" &&
    normalizedStatus !== "canceled" &&
    !order.isDispatched
  );
}

function dueTone(order: OrderListCardItem) {
  const normalizedStatus = order.status.trim().toLowerCase();
  if (
    normalizedStatus === "cancelled" ||
    normalizedStatus === "canceled" ||
    order.isDispatched
  )
    return "neutral";
  const days = daysRemaining(order.dueDate);
  if (days === null) return "neutral";
  if (days <= 7) return "danger";
  if (days <= 14) return "warning";
  return "success";
}

function scheduleDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const unixSeconds =
      value > 2000000000 ? value / 1000 : value + SWIFT_REFERENCE_SECONDS;
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
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const source = item as Record<string, unknown>;
        return {
          title: String(source.title || "Reminder"),
          dueAt: scheduleDateValue(source.dueAt),
          status: String(source.status || "Pending"),
        };
      })
      .filter((item) => item.status !== "Done" && item.dueAt);
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
  if (
    [
      "none",
      "done",
      "completed",
      "delivered",
      "approved",
      "deposit paid",
      "shipped",
      "ready to ship",
    ].includes(normalized)
  )
    return "success";
  if (["not yet", "blocked", "overdue", "urgent"].includes(normalized))
    return "danger";
  if (
    ["cancelled", "canceled", "refunded", "new", "quoted", "low"].includes(
      normalized,
    )
  )
    return "neutral";
  return "warning";
}

function shortStepTitle(stepName: string) {
  const normalized = stepName.trim().toLowerCase();
  if (
    normalized === "design" ||
    normalized === "desi" ||
    normalized === "tasarım"
  )
    return "DESI";
  if (
    normalized === "painting" ||
    normalized === "paint" ||
    normalized === "boya" ||
    normalized === "boyama"
  )
    return "BOYA";
  const cleaned = stepName.replaceAll("/", " ").replaceAll("&", " ").trim();
  const firstWord = cleaned.split(/\s+/)[0] || "ST";
  return firstWord.slice(0, 4).toUpperCase();
}

function localizedCardStatus(
  value: string,
  language: string | null | undefined,
) {
  const displayValue = value.trim() || "Not Yet";
  const normalizedLanguage = String(language || "").toLowerCase();
  const wantsTurkish =
    normalizedLanguage.includes("türk") ||
    normalizedLanguage === "tr" ||
    normalizedLanguage === "turkish";
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
  if (
    !cleaned ||
    ["new order", "new project", "yeni sipariş", "yeni proje"].includes(
      cleaned.toLowerCase(),
    )
  ) {
    return "New Project";
  }
  return cleaned;
}

function initialsForName(value: string) {
  const cleaned =
    displayNameFromEmail(value) || value.replace(/[._-]+/g, " ").trim();
  const initials = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
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
    .map(
      (part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

function availableBadgeSteps(settings?: BlockHeadingSettings | null) {
  const steps =
    settings?.customSteps?.map((item) => item.title.trim()).filter(Boolean) ??
    [];
  return steps.length > 0 ? steps : ["Design", "Painting"];
}

function resolveBadgeStep(
  settings: BlockHeadingSettings | null | undefined,
  slot: 1 | 2,
) {
  const steps = availableBadgeSteps(settings);
  const stored = settings
    ? slot === 1
      ? settings.orderListStep1
      : settings.orderListStep2
    : slot === 1
      ? "Design"
      : "Painting";
  const cleaned = stored.trim();
  if (!cleaned) return "";
  if (steps.includes(cleaned)) return cleaned;
  return steps[slot - 1] ?? "";
}

function stepValue(
  order: OrderListCardItem,
  settings: BlockHeadingSettings | null | undefined,
  stepName: string,
) {
  const steps: HeadingItem[] = settings?.customSteps?.length
    ? settings.customSteps
    : [
        { id: "design", title: "Design" },
        { id: "painting", title: "Painting" },
      ];
  const index = steps.findIndex((item) => item.title === stepName);
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
}: {
  order: OrderListCardItem;
  selected: boolean;
  canSeeFinance: boolean;
  canSeeAdvancedFinance: boolean;
  onSelect?: () => void;
  mobileHref?: string;
  blockHeadingSettings?: BlockHeadingSettings | null;
  moneySettings?: StudioMoneySettings;
  showStatusBadges?: boolean;
  assigneeName?: string;
  assigneePhotoURL?: string;
}) {
  const { hideNumbers } = usePricePrivacy();
  const [firstProjectGuide, setFirstProjectGuide] =
    useState<FirstProjectGuideState | null>(null);
  const cardRef = useRef<HTMLDivElement | HTMLAnchorElement | null>(null);
  const [guideBubbleStyle, setGuideBubbleStyle] = useState<CSSProperties>({});
  const firstBadgeStep = resolveBadgeStep(blockHeadingSettings, 1);
  const secondBadgeStep = resolveBadgeStep(blockHeadingSettings, 2);
  const customerName = displayOrderCustomerName(order.customerName);
  const customerHref = order.customerName.trim()
    ? `/customers?customerName=${encodeURIComponent(order.customerName.trim())}`
    : "";
  const deliveryCountdown = shouldShowDeliveryCountdown(order)
    ? dueLabel(order)
    : "";
  const scheduleItem = nextScheduleItem(order);
  const assignmentLabel =
    assigneeName.trim() || displayNameFromEmail(order.assignedToEmail ?? "");
  const displayLanguage = (
    moneySettings as { selectedLanguage?: string } | null | undefined
  )?.selectedLanguage;
  const t = (text: string) => studioT(text, displayLanguage);
  const showGuideProjectCard = Boolean(
    firstProjectGuide &&
    !firstProjectGuide.completed &&
    firstProjectGuide.step === 2 &&
    firstProjectGuide.orderId === order.id,
  );

  useEffect(() => {
    setFirstProjectGuide(readCurrentFirstProjectGuideState());
    function handleGuideUpdate(event: Event) {
      const next = (event as CustomEvent<FirstProjectGuideState>).detail;
      if (next) setFirstProjectGuide(next);
    }
    window.addEventListener(FIRST_PROJECT_GUIDE_EVENT, handleGuideUpdate);
    return () =>
      window.removeEventListener(FIRST_PROJECT_GUIDE_EVENT, handleGuideUpdate);
  }, []);

  function advanceProjectCardGuide() {
    broadcastFirstProjectGuideState({ step: 3, orderId: order.id });
  }

  function skipProjectCardGuide() {
    broadcastFirstProjectGuideState({
      step: 6,
      orderId: order.id,
      completed: true,
    });
  }

  useEffect(() => {
    if (!showGuideProjectCard) {
      setGuideBubbleStyle({});
      return;
    }

    function updateGuideBubblePosition() {
      const element = cardRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth || 1024;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 720;
      const bubbleWidth = Math.min(380, Math.max(280, viewportWidth - 32));
      const left = Math.max(
        16,
        Math.min(rect.left + 28, viewportWidth - bubbleWidth - 16),
      );
      const preferredTop = rect.bottom + 14;
      const fallbackTop = rect.top + 22;
      const top =
        preferredTop + 210 < viewportHeight
          ? preferredTop
          : Math.max(16, Math.min(fallbackTop, viewportHeight - 250));
      setGuideBubbleStyle({ left, top, width: bubbleWidth });
    }

    updateGuideBubblePosition();
    window.addEventListener("resize", updateGuideBubblePosition);
    window.addEventListener("scroll", updateGuideBubblePosition, true);
    return () => {
      window.removeEventListener("resize", updateGuideBubblePosition);
      window.removeEventListener("scroll", updateGuideBubblePosition, true);
    };
  }, [showGuideProjectCard]);

  const content = (
    <div className="order-list-card-content">
      <div className="order-list-thumbnail" aria-hidden="true">
        {order.previewImageUrl ? (
          <img src={order.previewImageUrl} alt="" />
        ) : (
          <span className="image-placeholder-icon" aria-hidden="true">
            <CardIconGlyph icon="photo" />
          </span>
        )}
      </div>

      <div className="order-list-card-body">
        <div className="order-list-main">
          <div className="order-list-title-row">
            {customerHref && !mobileHref ? (
              <Link
                className="order-customer-name-link"
                href={customerHref}
                onClick={(event) => event.stopPropagation()}
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
                <span className="order-delivery-icon" aria-hidden="true">
                  {dueIcon(order)}
                </span>
                {deliveryCountdown}
              </span>
            ) : null}
          </div>

          {assignmentLabel ? (
            <div
              className="order-list-assignee"
              title={`Assigned to ${assignmentLabel}`}
            >
              <span className="order-list-assignee-line" aria-hidden="true" />
              <span className="order-list-assignee-avatar">
                {assigneePhotoURL ? (
                  <img src={assigneePhotoURL} alt="" />
                ) : (
                  initialsForName(assignmentLabel)
                )}
              </span>
              <span>{`Assigned to ${assignmentLabel}`}</span>
            </div>
          ) : null}

          <div className="order-list-detail-line">
            <span aria-hidden="true">✽</span>
            <span title={order.designName || "Untitled design"}>
              {order.designName || "Untitled design"}
            </span>
          </div>
          <div className="order-list-detail-line">
            <span aria-hidden="true">▣</span>
            <span>{shortDate(order.paymentDate ?? null)}</span>
          </div>
          {scheduleItem ? (
            <div
              className={`order-list-detail-line order-list-schedule-line ${scheduleTone(scheduleItem.dueAt)}`}
            >
              <span aria-hidden="true">◔</span>
              <span title={scheduleItem.title}>{scheduleItem.title}</span>
            </div>
          ) : null}
        </div>

        <div className="order-list-side">
          {showStatusBadges ? (
            <div className="order-list-badges">
              {firstBadgeStep ? (
                <OrderStatusBadge
                  stepName={firstBadgeStep}
                  value={stepValue(order, blockHeadingSettings, firstBadgeStep)}
                  language={displayLanguage}
                />
              ) : null}
              {secondBadgeStep ? (
                <OrderStatusBadge
                  stepName={secondBadgeStep}
                  value={stepValue(
                    order,
                    blockHeadingSettings,
                    secondBadgeStep,
                  )}
                  language={displayLanguage}
                />
              ) : null}
            </div>
          ) : null}
          {canSeeFinance ? (
            <strong
              className={
                order.status.trim().toLowerCase().includes("cancel")
                  ? "order-list-amount muted"
                  : "order-list-amount"
              }
            >
              {money(order.paidAmount, hideNumbers, moneySettings)}
            </strong>
          ) : null}
        </div>
      </div>
    </div>
  );

  const cardClassName = [
    "order-list-card",
    selected ? "selected" : "",
    showGuideProjectCard ? "web-first-guide-order-card" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (mobileHref) {
    return (
      <Link href={mobileHref} className={cardClassName} ref={cardRef}>
        {content}
      </Link>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cardClassName}
      ref={cardRef}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
    >
      {content}
      {showGuideProjectCard ? (
        <div
          className="web-first-guide-order-bubble"
          style={guideBubbleStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="web-first-guide-eyebrow">{`${t("Step")} 2 / 6`}</span>
          <strong>{t("Project card")}</strong>
          <span>
            {t(
              "This small card represents the project you just created. You can select projects from this list and open their workspace on the right.",
            )}
          </span>
          <span className="web-first-guide-actions">
            <button type="button" onClick={skipProjectCardGuide}>
              {t("Skip")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={advanceProjectCardGuide}
            >
              {t("Next")}
            </button>
          </span>
          <style jsx global>{`
            .web-first-guide-order-card {
              position: relative;
              z-index: 35;
              outline: 3px solid rgba(37, 99, 235, 0.9) !important;
              outline-offset: 5px;
              box-shadow:
                0 0 0 8px rgba(37, 99, 235, 0.12),
                0 22px 54px rgba(37, 99, 235, 0.22) !important;
              overflow: visible !important;
            }
            .web-first-guide-order-bubble {
              position: fixed;
              z-index: 9999;
              display: grid;
              gap: 8px;
              max-width: calc(100vw - 32px);
              padding: 16px;
              border-radius: 20px;
              border: 3px solid rgba(37, 99, 235, 0.95);
              background: linear-gradient(
                180deg,
                rgba(239, 246, 255, 0.99),
                rgba(255, 255, 255, 0.99)
              );
              color: #0f172a;
              box-shadow:
                0 24px 70px rgba(37, 99, 235, 0.26),
                0 0 0 7px rgba(37, 99, 235, 0.1);
              cursor: default;
            }
            .web-first-guide-order-bubble strong {
              font-size: 1.05rem;
              line-height: 1.2;
            }
            .web-first-guide-order-bubble
              > span:not(.web-first-guide-eyebrow):not(
                .web-first-guide-actions
              ) {
              font-size: 0.92rem;
              line-height: 1.35;
            }
            @media (max-width: 720px) {
              .web-first-guide-order-bubble {
                max-width: calc(100vw - 28px);
              }
            }
            .web-first-guide-order-bubble .web-first-guide-eyebrow,
            .web-first-guide-eyebrow {
              width: fit-content;
              padding: 4px 10px;
              border-radius: 999px;
              background: rgba(37, 99, 235, 0.13);
              color: #1d4ed8;
              font-size: 0.72rem;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .web-first-guide-actions {
              display: flex;
              justify-content: flex-end;
              gap: 8px;
            }
            .web-first-guide-actions button {
              border: 1px solid rgba(37, 99, 235, 0.2);
              border-radius: 999px;
              background: white;
              color: #1d4ed8;
              cursor: pointer;
              font-weight: 800;
              padding: 8px 12px;
            }
            .web-first-guide-actions button.primary {
              background: #2563eb;
              border-color: #2563eb;
              color: white;
            }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}

function OrderStatusBadge({
  stepName,
  value,
  language,
}: {
  stepName: string;
  value: string;
  language?: string;
}) {
  const displayValue = value.trim() || "Not Yet";
  const tone = statusTone(displayValue);
  return (
    <span className="order-status-badge-row">
      <span className="order-status-abbrev">{shortStepTitle(stepName)}</span>
      <span className={`order-status-value ${tone}`}>
        {localizedCardStatus(displayValue, language)}
      </span>
    </span>
  );
}
