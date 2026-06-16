"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardIconGlyph, CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OrderListCard } from "@/components/OrderListCard";
import { OrderQuickFilterBar } from "@/components/OrderQuickFilterBar";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadWorkspaceBlockHeadings,
  type BlockHeadingSettings
} from "@/lib/studioflow/blockHeadings";
import {
  loadScheduleOrders,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  orderIsAssignedToCurrentUser,
  workspaceAssignedProjectsOnly,
  workspaceAccessAllows,
  type ScheduleOrderItem,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";
import {
  ORDER_QUICK_FILTERS,
  filterAndSortOrders,
  type OrderQuickFilterId,
  type OrderSortMode
} from "@/lib/studioflow/orderFilters";
import { studioT, studioLocaleTag } from "@/lib/studioflow/language";
import { canCreateOrdersForRole, canEditOrderStatusForRole, createOrderFromWeb, updateOrderFromWeb } from "@/lib/studioflow/orders";
import { useResizableSidebar } from "@/lib/studioflow/useResizableSidebar";

type ScheduleSpan = "weekly" | "monthly" | "threeMonths" | "sixMonths" | "yearly";
type ScheduleFilter = OrderQuickFilterId;
type ScheduleTone = "green" | "yellow" | "red" | "blue" | "gray";

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_ZOOM_STORAGE_KEY = "studioflow-schedule-timeline-zoom";
const MIN_SCHEDULE_ZOOM = 0.45;
const MAX_SCHEDULE_ZOOM = 2.2;

const SPANS: Array<{ id: ScheduleSpan; label: string }> = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "threeMonths", label: "3 Months" },
  { id: "sixMonths", label: "6 Months" },
  { id: "yearly", label: "Yearly" }
];

const FILTERS = ORDER_QUICK_FILTERS;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function escapeCalendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function safeCalendarFileName(value: string) {
  return (value || "studioflow-order")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "studioflow-order";
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addYears(date: Date, years: number) {
  return new Date(date.getFullYear() + years, 0, 1);
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  return addDays(start, -mondayOffset);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS));
}

function dateRange(start: Date, count: number) {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

function shortDate(date: Date | null, locale: string = "en-GB") {
  if (!date) return "-";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

function dayName(date: Date, locale: string = "en-GB") {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
}

function money(value: number, hidden: boolean, settings: StudioMoneySettings) {
  if (hidden) return hiddenMoneyLabel(moneySymbol(settings));
  return formatStudioMoney(value, settings, { maximumFractionDigits: 0 });
}

function orderStartDate(order: ScheduleOrderItem) {
  return startOfDay(order.paymentDate ?? new Date());
}

function orderDueDate(order: ScheduleOrderItem) {
  if (order.dueDate) return startOfDay(order.dueDate);
  return addDays(orderStartDate(order), Math.max(order.deliveryTime, 1));
}

function orderTexts(order: ScheduleOrderItem) {
  return [
    order.status,
    order.designStatus,
    order.priority,
    order.risk,
    order.riskReason,
    order.notes,
    order.designName,
    order.watchRef,
    ...Object.keys(order.extraStatuses),
    ...Object.values(order.extraStatuses),
    ...Object.keys(order.customFields),
    ...Object.values(order.customFields)
  ].map(value => value.trim().toLowerCase()).filter(Boolean);
}

function primaryStatus(order: ScheduleOrderItem) {
  return order.status.trim().toLowerCase();
}

function orderIsCancelled(order: ScheduleOrderItem) {
  const status = primaryStatus(order);
  return status.includes("cancelled") || status.includes("canceled") || status.includes("refunded");
}

function orderIsCompleted(order: ScheduleOrderItem) {
  if (order.isDelivered) return true;
  const status = primaryStatus(order);
  return status === "done" || status === "completed" || status === "delivered" || status.includes("complete");
}

function orderIsClosed(order: ScheduleOrderItem) {
  return orderIsCompleted(order) || orderIsCancelled(order);
}

function orderIsLate(order: ScheduleOrderItem) {
  return !orderIsClosed(order) && !order.isDispatched && orderDueDate(order).getTime() < startOfDay(new Date()).getTime();
}

function orderNeedsCustomerReply(order: ScheduleOrderItem) {
  return orderTexts(order).some(text =>
    text.includes("waiting for customer") ||
    text.includes("needs reply") ||
    text.includes("reply needed") ||
    text.includes("waiting for approval") ||
    text.includes("client approval") ||
    text.includes("customer approval")
  );
}

function orderIsReadyToShip(order: ScheduleOrderItem) {
  if (orderIsClosed(order) || order.isDispatched) return false;
  const readyTerms = ["ready to ship", "ready for shipping", "ready for pickup", "ready for collection", "delivery ready", "packed", "packaging ready"];
  return orderTexts(order).some(text => readyTerms.some(term => text.includes(term)));
}

function orderIsInProduction(order: ScheduleOrderItem) {
  if (orderIsClosed(order) || orderNeedsCustomerReply(order) || orderIsReadyToShip(order)) return false;
  const productionTerms = ["in progress", "painting", "production", "making", "sourcing", "quality check", "revision", "draft", "preparation"];
  return orderTexts(order).some(text => productionTerms.some(term => text.includes(term)));
}

function matchesFilter(order: ScheduleOrderItem, filter: ScheduleFilter) {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return !orderIsClosed(order);
    case "waitingCustomer":
      return orderNeedsCustomerReply(order);
    case "inProduction":
      return orderIsInProduction(order);
    case "readyToShip":
      return orderIsReadyToShip(order);
    case "lateOrders":
      return orderIsLate(order);
    case "completed":
      return orderIsCompleted(order);
  }
}

function scheduleStatusLabel(order: ScheduleOrderItem) {
  if (orderIsCancelled(order)) return "Cancelled";
  if (orderIsLate(order)) return "Late";
  if (orderIsCompleted(order)) return "Completed";
  if (orderNeedsCustomerReply(order)) return "Waiting Customer";
  if (orderIsReadyToShip(order)) return "Ready to Ship";
  if (orderIsInProduction(order)) return "In Production";
  if (order.priority.trim().toLowerCase().includes("urgent")) return "Urgent";
  return order.status || "Normal";
}

function scheduleTone(order: ScheduleOrderItem): ScheduleTone {
  const priority = order.priority.toLowerCase();
  const risk = order.risk.toLowerCase();
  if (orderIsCancelled(order)) return "gray";
  if (orderIsCompleted(order) || order.isDispatched) return "green";
  if (priority.includes("urgent") || risk.includes("high") || orderIsLate(order)) return "red";
  const days = daysBetween(startOfDay(new Date()), orderDueDate(order));
  if (days <= 7) return "red";
  if (days <= 14) return "yellow";
  return "green";
}

function statusTone(order: ScheduleOrderItem): ScheduleTone {
  const label = scheduleStatusLabel(order).trim().toLowerCase();
  if (["done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"].includes(label)) return "green";
  if (["not yet", "blocked", "overdue", "urgent", "late"].includes(label)) return "red";
  if (["cancelled", "refunded", "new", "quoted", "low"].includes(label)) return "gray";
  if (label.includes("ready")) return "blue";
  return "yellow";
}

function countdownText(order: ScheduleOrderItem) {
  if (orderIsCancelled(order) || orderIsCompleted(order) || order.isDispatched) return "";
  const days = daysBetween(startOfDay(new Date()), orderDueDate(order));
  const signedDays = Math.round((orderDueDate(order).getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
  if (signedDays > 0) return `${days}d`;
  if (signedDays === 0) return "Today";
  return `${Math.abs(signedDays)}d late`;
}

function scheduleRangeText(order: ScheduleOrderItem) {
  return `${shortDate(orderStartDate(order))} - ${shortDate(orderDueDate(order))}`;
}

function titleForOrder(order: ScheduleOrderItem) {
  const cleaned = order.customerName.trim();
  if (!cleaned || ["new order", "new project", "yeni sipariş", "yeni proje"].includes(cleaned.toLowerCase())) {
    return "New Project";
  }
  return cleaned;
}

function designForOrder(order: ScheduleOrderItem) {
  return order.designName.trim() || order.watchRef.trim() || "Untitled design";
}

function scheduleCalendarTitle(order: ScheduleOrderItem) {
  const parts = [order.customerName, order.designName]
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "Order";
}

function scheduleCalendarNotes(order: ScheduleOrderItem) {
  return [
    order.customerName ? `Customer: ${order.customerName}` : "",
    order.designName ? `Design: ${order.designName}` : "",
    order.watchRef ? `Reference: ${order.watchRef}` : "",
    order.status ? `Status: ${order.status}` : "",
    order.id ? `Order ID: ${order.id}` : "",
    `Created: ${shortDate(orderStartDate(order))}`,
    `Delivery Due: ${shortDate(orderDueDate(order))}`
  ].filter(Boolean).join("\n");
}

function downloadScheduleCalendarFile(order: ScheduleOrderItem) {
  if (!order.paymentDate) {
    throw new Error("Created date is needed before exporting a calendar event.");
  }

  const title = scheduleCalendarTitle(order);
  const dueDate = orderDueDate(order);
  const startDate = calendarDateValue(orderStartDate(order));
  const endDate = calendarDateValue(addDays(dueDate, 1));
  const uid = `studioflow-schedule-${order.id || safeCalendarFileName(title)}@eggcraft`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NivaDesk//NivaDesk//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(scheduleCalendarNotes(order))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeCalendarFileName(title)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function availableSpans(workspace: WorkspaceContext | null) {
  const fullRange = workspace?.billingPlan === "pro_monthly" || workspace?.billingPlan === "team_monthly";
  return SPANS.filter(span => fullRange || span.id === "weekly" || span.id === "monthly");
}

function availableFilters(workspace: WorkspaceContext | null) {
  const advanced = workspace?.billingPlan === "pro_monthly" || workspace?.billingPlan === "team_monthly";
  return FILTERS.filter(filter => advanced || filter.id === "all" || filter.id === "active" || filter.id === "lateOrders");
}

function planNotice(workspace: WorkspaceContext | null) {
  if (!workspace) return "";
  if (workspace.billingPlan === "team_monthly") return "Team includes shared schedule planning for the whole workspace.";
  if (workspace.billingPlan === "pro_monthly") return "";
  if (workspace.billingPlan === "lifetime_lite") return "Lite includes weekly/monthly scheduling. Advanced filters and long-range planning are available on Pro and Team.";
  return "Demo schedule shows your limited demo orders. Apple Calendar and Reminders are available from NivaDesk Lite.";
}

export default function SchedulePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [orders, setOrders] = useState<ScheduleOrderItem[]>([]);
  const [span, setSpan] = useState<ScheduleSpan>("weekly");
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [sortMode, setSortMode] = useState<OrderSortMode>("smart");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineZoomHydrated, setTimelineZoomHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [blockHeadingSettings, setBlockHeadingSettings] = useState<BlockHeadingSettings | null>(null);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [savingScheduleOrderId, setSavingScheduleOrderId] = useState("");
  const [creatingScheduleOrder, setCreatingScheduleOrder] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const scheduleTimelinePanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [scheduleTimelinePanning, setScheduleTimelinePanning] = useState(false);
  const sidebar = useResizableSidebar({ storageKey: "studioflow-schedule-sidebar", workspaceId: workspace?.id, initialWidth: 360, maxWidth: 720 });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    const stored = window.localStorage.getItem(SCHEDULE_ZOOM_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (Number.isFinite(parsed)) {
      setTimelineZoom(Math.min(MAX_SCHEDULE_ZOOM, Math.max(MIN_SCHEDULE_ZOOM, parsed)));
    }
    setTimelineZoomHydrated(true);
  }, []);

  useEffect(() => {
    if (!timelineZoomHydrated) return;
    window.localStorage.setItem(SCHEDULE_ZOOM_STORAGE_KEY, String(timelineZoom));
  }, [timelineZoom, timelineZoomHydrated]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingSchedule(true);
      setError("");
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        if (!workspaceAccessAllows(loadedWorkspace.memberAccess, "schedule")) {
          router.replace("/orders");
          return;
        }
        setWorkspace(loadedWorkspace);

        const [loadedOrders, loadedBlockHeadings, loadedMoneySettings] = await Promise.all([
          loadScheduleOrders(loadedWorkspace.id, loadedWorkspace, uid),
          loadWorkspaceBlockHeadings(loadedWorkspace).catch(() => null),
          loadWorkspaceSettingsOverview(loadedWorkspace.id).catch(() => null)
        ]);
        if (cancelled) return;
        setOrders(loadedOrders);
        setBlockHeadingSettings(loadedBlockHeadings);
        setMoneySettings(loadedMoneySettings);

        const firstActive = loadedOrders.filter(order => !orderIsClosed(order)).sort((lhs, rhs) => orderStartDate(lhs).getTime() - orderStartDate(rhs).getTime())[0];
        const anchorOrder = firstActive ?? loadedOrders[0];
        if (anchorOrder) {
          setAnchorDate(orderStartDate(anchorOrder));
          setSelectedOrderId(current => current || anchorOrder.id);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load schedule.");
      } finally {
        if (!cancelled) setLoadingSchedule(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const spanOptions = useMemo(() => availableSpans(workspace), [workspace]);
  const filterOptions = useMemo(() => availableFilters(workspace), [workspace]);

  useEffect(() => {
    if (!spanOptions.some(option => option.id === span)) setSpan("weekly");
  }, [span, spanOptions]);

  useEffect(() => {
    if (!filterOptions.some(option => option.id === filter)) setFilter("all");
  }, [filter, filterOptions]);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    window.requestAnimationFrame(() => {
      mobileSearchInputRef.current?.focus();
    });
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!selectedOrderId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`schedule-sidebar-order-${selectedOrderId}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [selectedOrderId]);

  function shouldStartScheduleTimelinePan(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest([
      ".schedule-order-block",
      ".schedule-resize-handle",
      ".schedule-order-grip",
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "[role='button']",
      "[contenteditable='true']"
    ].join(","));
  }

  function startScheduleTimelinePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!shouldStartScheduleTimelinePan(event.target)) return;

    scheduleTimelinePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setScheduleTimelinePanning(true);
  }

  function moveScheduleTimelinePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = scheduleTimelinePanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    event.preventDefault();
  }

  function endScheduleTimelinePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = scheduleTimelinePanRef.current;
    if (pan && event.currentTarget.hasPointerCapture(pan.pointerId)) {
      event.currentTarget.releasePointerCapture(pan.pointerId);
    }
    scheduleTimelinePanRef.current = null;
    setScheduleTimelinePanning(false);
  }

  const visibleStart = useMemo(() => {
    switch (span) {
      case "weekly":
        return startOfWeek(anchorDate);
      case "monthly":
      case "threeMonths":
      case "sixMonths":
        return startOfMonth(anchorDate);
      case "yearly":
        return startOfYear(anchorDate);
    }
  }, [anchorDate, span]);

  const visibleEnd = useMemo(() => {
    switch (span) {
      case "weekly":
        return addDays(visibleStart, 7);
      case "monthly":
        return addMonths(visibleStart, 1);
      case "threeMonths":
        return addMonths(visibleStart, 3);
      case "sixMonths":
        return addMonths(visibleStart, 6);
      case "yearly":
        return addYears(visibleStart, 1);
    }
  }, [span, visibleStart]);

  const clampedTimelineZoom = Math.min(MAX_SCHEDULE_ZOOM, Math.max(MIN_SCHEDULE_ZOOM, timelineZoom));
  const baseDayWidth = span === "weekly" ? 168 : span === "monthly" ? 118 : span === "threeMonths" ? 58 : span === "sixMonths" ? 38 : 28;
  const dayWidth = Math.max(18, Math.round(baseDayWidth * clampedTimelineZoom));
  const visibleDayCount = Math.max(1, daysBetween(visibleStart, visibleEnd));
  const visibleDays = useMemo(() => dateRange(visibleStart, visibleDayCount), [visibleDayCount, visibleStart]);
  const minimumTimelineWidth = span === "weekly" ? 980 : span === "monthly" ? 1300 : span === "threeMonths" ? 2100 : span === "sixMonths" ? 2600 : 3600;
  const timelineWidth = Math.max(
    visibleDayCount * dayWidth,
    Math.round(minimumTimelineWidth * clampedTimelineZoom)
  );

  const visibleSourceOrders = useMemo(
    () => workspace && workspaceAssignedProjectsOnly(workspace.memberAccess)
      ? orders.filter(order => orderIsAssignedToCurrentUser(order, user))
      : orders,
    [orders, user, workspace]
  );

  const filteredOrders = useMemo(() => {
    return filterAndSortOrders(visibleSourceOrders, search, filter, sortMode);
  }, [filter, visibleSourceOrders, search, sortMode]);

  const visibleOrders = useMemo(() => filteredOrders.filter(order => {
    const start = orderStartDate(order);
    const end = addDays(start, Math.max(order.deliveryTime, 1));
    return end.getTime() > visibleStart.getTime() && start.getTime() < visibleEnd.getTime();
  }), [filteredOrders, visibleEnd, visibleStart]);

  const notice = planNotice(workspace);
  const lateCount = filteredOrders.filter(orderIsLate).length;
  const readyCount = filteredOrders.filter(orderIsReadyToShip).length;
  const canSeeFinance = Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "financialInfo"));
  const canSeeAdvancedFinance = Boolean(workspace?.entitlements.features.financial_advanced && canSeeFinance);
  const canEditSchedule = Boolean(workspace && canEditOrderStatusForRole(workspace.role));
  const canCreateScheduleOrder = Boolean(workspace && workspace.entitlements.features.orders_create && canCreateOrdersForRole(workspace.role));
  const canUseCalendarExport = Boolean(workspace && workspace.billingPlan !== "demo");
  const selectedOrder = useMemo(
    () => visibleSourceOrders.find(order => order.id === selectedOrderId) ?? filteredOrders[0] ?? null,
    [filteredOrders, selectedOrderId, visibleSourceOrders]
  );
  const language = moneySettings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  function selectScheduleOrder(order: ScheduleOrderItem) {
    setSelectedOrderId(order.id);
    setAnchorDate(orderStartDate(order));
  }

  function moveRange(direction: -1 | 1) {
    setAnchorDate(current => {
      switch (span) {
        case "weekly":
          return addDays(current, 7 * direction);
        case "monthly":
          return addMonths(current, direction);
        case "threeMonths":
          return addMonths(current, 3 * direction);
        case "sixMonths":
          return addMonths(current, 6 * direction);
        case "yearly":
          return addYears(current, direction);
      }
    });
  }

  function setScheduleZoom(nextZoom: number) {
    setTimelineZoom(Math.min(MAX_SCHEDULE_ZOOM, Math.max(MIN_SCHEDULE_ZOOM, nextZoom)));
  }

  function adjustScheduleZoom(delta: number) {
    setScheduleZoom(clampedTimelineZoom + delta);
  }

  function handleScheduleTimelineWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    adjustScheduleZoom(event.deltaY < 0 ? 0.10 : -0.10);
  }

  async function saveScheduleOrderRange(order: ScheduleOrderItem, nextPaymentDate: Date, nextDeliveryTime: number) {
    if (!workspace || !user || !canEditSchedule || savingScheduleOrderId) return;
    const uid = user.uid;

    const normalizedPaymentDate = startOfDay(nextPaymentDate);
    const normalizedDeliveryTime = Math.min(730, Math.max(1, Math.round(nextDeliveryTime)));
    const paymentChanged = isoDateValue(normalizedPaymentDate) !== isoDateValue(orderStartDate(order));
    const deliveryChanged = normalizedDeliveryTime !== Math.max(order.deliveryTime, 1);
    if (!paymentChanged && !deliveryChanged) {
      selectScheduleOrder(order);
      return;
    }

    const previousOrders = orders;
    const nextDueDate = addDays(normalizedPaymentDate, normalizedDeliveryTime);
    const previousRange = scheduleRangeText(order);
    const nextRange = `${shortDate(normalizedPaymentDate)} - ${shortDate(nextDueDate)}`;

    setSavingScheduleOrderId(order.id);
    setScheduleStatus(`Saving ${order.customerName || "order"} schedule...`);
    setScheduleError("");
    setSelectedOrderId(order.id);
    setAnchorDate(normalizedPaymentDate);
    setOrders(current => current.map(item => item.id === order.id ? {
      ...item,
      paymentDate: normalizedPaymentDate,
      deliveryTime: normalizedDeliveryTime,
      dueDate: nextDueDate
    } : item));

    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: {
          paymentDate: isoDateValue(normalizedPaymentDate),
          deliveryTime: normalizedDeliveryTime
        }
      });
      const refreshedOrders = await loadScheduleOrders(workspace.id, workspace, uid);
      setOrders(refreshedOrders);
      setScheduleStatus(`Schedule updated: ${previousRange} -> ${nextRange}`);
    } catch (saveError) {
      setOrders(previousOrders);
      setScheduleStatus("");
      setScheduleError(saveError instanceof Error ? saveError.message : "Schedule could not be updated.");
    } finally {
      setSavingScheduleOrderId("");
    }
  }

  function moveScheduleOrder(order: ScheduleOrderItem, deltaDays: number) {
    if (deltaDays === 0) {
      selectScheduleOrder(order);
      return;
    }
    void saveScheduleOrderRange(order, addDays(orderStartDate(order), deltaDays), Math.max(order.deliveryTime, 1));
  }

  function resizeScheduleOrderLeading(order: ScheduleOrderItem, deltaDays: number) {
    const duration = Math.max(order.deliveryTime, 1);
    const clampedDelta = Math.min(Math.max(deltaDays, -365), duration - 1);
    if (clampedDelta === 0) return;
    void saveScheduleOrderRange(order, addDays(orderStartDate(order), clampedDelta), duration - clampedDelta);
  }

  function resizeScheduleOrderTrailing(order: ScheduleOrderItem, deltaDays: number) {
    if (deltaDays === 0) return;
    void saveScheduleOrderRange(order, orderStartDate(order), Math.min(730, Math.max(1, Math.max(order.deliveryTime, 1) + deltaDays)));
  }

  async function addScheduleOrder() {
    if (!workspace || !user || creatingScheduleOrder) return;
    const uid = user.uid;

    setScheduleStatus("");
    setScheduleError("");

    if (!canCreateOrdersForRole(workspace.role)) {
      setScheduleError(t("Your workspace role cannot create projects."));
      return;
    }

    if (!workspace.entitlements.features.orders_create) {
      setScheduleError(t("Creating projects is not available on this workspace plan."));
      return;
    }

    setCreatingScheduleOrder(true);
    try {
      const today = startOfDay(new Date());
      const result = await createOrderFromWeb(workspace, {
        deliveryDueDate: isoDateValue(addDays(today, 14))
      });
      const refreshedOrders = await loadScheduleOrders(workspace.id, workspace, uid);
      setOrders(refreshedOrders);
      const createdOrder = refreshedOrders.find(order => order.id === result.orderId) ?? null;
      if (createdOrder) {
        selectScheduleOrder(createdOrder);
      } else if (result.orderId) {
        setSelectedOrderId(result.orderId);
        setAnchorDate(today);
      }
      window.dispatchEvent(new CustomEvent("studioflow-order-created", { detail: { orderId: result.orderId || "" } }));
      setScheduleStatus(t("New project added to schedule."));
    } catch (createError) {
      setScheduleError(createError instanceof Error ? createError.message : t("Could not create a new project."));
    } finally {
      setCreatingScheduleOrder(false);
    }
  }

  function downloadSelectedCalendarFile() {
    setScheduleStatus("");
    setScheduleError("");

    if (!selectedOrder) {
      setScheduleError("Select an order before exporting a calendar file.");
      return;
    }

    if (!canUseCalendarExport) {
      setScheduleError("Apple Calendar export is available from NivaDesk Lite.");
      return;
    }

    try {
      downloadScheduleCalendarFile(selectedOrder);
      setScheduleStatus("Calendar file downloaded.");
    } catch (calendarError) {
      setScheduleError(calendarError instanceof Error ? calendarError.message : "Calendar file could not be created.");
    }
  }

  const locale = studioLocaleTag(language);
  const rangeText = span === "monthly"
    ? new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(visibleStart)
    : span === "yearly"
      ? new Intl.DateTimeFormat(locale, { year: "numeric" }).format(visibleStart)
      : `${shortDate(visibleStart, locale)} - ${shortDate(addDays(visibleEnd, -1), locale)}`;

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingSchedule ? <LoadingScreen /> : null}

      <section
        className={sidebar.collapsed ? "schedule-workspace resizable-workspace is-sidebar-collapsed" : "schedule-workspace resizable-workspace"}
        style={sidebar.workspaceStyle}
      >
        <aside className="orders-sidebar schedule-order-sidebar">
          <div className="orders-sidebar-toolbar">
            <div>
              <p className="orders-kicker">{t("Schedule Orders")}</p>
              <h1>{filteredOrders.length} {t("orders")}</h1>
              <p>{selectedOrder ? `${t("Selected:")} ${selectedOrder.customerName}` : workspace ? `${workspace.name} - ${workspace.roleLabel}` : t("Loading workspace...")}</p>
            </div>
            <div className="sidebar-toolbar-actions">
              {workspace ? <span className="studio-pill">{workspace.billingPlanName}</span> : null}
              <button
                className="sidebar-toggle-button"
                type="button"
                title={sidebar.collapsed ? t("Expand order list") : t("Collapse order list")}
                aria-label={sidebar.collapsed ? t("Expand order list") : t("Collapse order list")}
                onClick={() => sidebar.setCollapsed(value => !value)}
              >
                {sidebar.collapsed ? ">" : "<"}
              </button>
            </div>
          </div>

          <div className="orders-sidebar-controls">
            <label className="orders-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t("Search...")}
              />
            </label>
              <OrderQuickFilterBar
              orders={visibleSourceOrders}
              filter={filter}
              sortMode={sortMode}
              onFilterChange={setFilter}
              onSortModeChange={setSortMode}
              language={language}
            />
          </div>

          <div className="orders-list">
            {filteredOrders.map(order => (
              <div key={order.id} id={`schedule-sidebar-order-${order.id}`} className="schedule-sidebar-order-anchor">
                <OrderListCard
                  order={order}
                  selected={order.id === selectedOrderId}
                  canSeeFinance={canSeeFinance}
                  canSeeAdvancedFinance={canSeeAdvancedFinance}
                  blockHeadingSettings={blockHeadingSettings}
                  moneySettings={moneySettings}
                  showStatusBadges={moneySettings?.orderCardShowStatusBadges ?? true}
                  onSelect={() => selectScheduleOrder(order)}
                />
              </div>
            ))}
          </div>
        </aside>

        <button
          className="workspace-sidebar-resizer"
          type="button"
          aria-label={t("Resize schedule order list")}
          title={t("Resize schedule order list")}
          onPointerDown={sidebar.startResize}
        />

        <main className="schedule-main-pane">
          <div className="schedule-header-card">
            <div className="schedule-title-block">
              <h1>{t("Schedule")}</h1>
              <p>{t("See who is doing what and when.")}</p>
            </div>
            <div className="schedule-header-actions">
              {workspace ? <span className="studio-pill">{workspace.name} - {workspace.roleLabel}</span> : null}
              {selectedOrder ? (
                <button className="button secondary schedule-header-button" type="button" onClick={() => router.push(`/orders?selectedOrderId=${encodeURIComponent(selectedOrder.id)}`)}>
                  {t("Open Order")}
                </button>
              ) : null}
              <button
                className="button secondary schedule-header-button"
                type="button"
                disabled={!selectedOrder || !canUseCalendarExport}
                onClick={downloadSelectedCalendarFile}
                title={canUseCalendarExport ? t("Download an all-day calendar file") : t("Available from NivaDesk Lite")}
              >
                {t("Calendar File")}
              </button>
              <button
                className="button schedule-header-button"
                type="button"
                disabled={!canCreateScheduleOrder || creatingScheduleOrder}
                onClick={addScheduleOrder}
                title={canCreateScheduleOrder ? t("Create a new scheduled project") : t("Your plan or role cannot create projects")}
              >
                {creatingScheduleOrder ? t("Adding...") : `+ ${t("New Project")}`}
              </button>
            </div>
          </div>

          <div className="schedule-control-card">
            <div className="schedule-mobile-filter-card">
              <OrderQuickFilterBar
                orders={orders}
                filter={filter}
                sortMode={sortMode}
                onFilterChange={setFilter}
                onSortModeChange={setSortMode}
                filters={filterOptions}
                language={language}
              />
            </div>

            <label className="schedule-control">
              <span>{t("Filter by Status")}</span>
              <select value={filter} onChange={event => setFilter(event.target.value as ScheduleFilter)}>
                {filterOptions.map(option => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
              </select>
            </label>

            <label className="schedule-control schedule-mobile-sort-control">
              <span>{t("Sort")}</span>
              <select value={sortMode} onChange={event => setSortMode(event.target.value as OrderSortMode)}>
                <option value="smart">{t("Smart")}</option>
                <option value="recent">{t("Recent")}</option>
              </select>
            </label>

            <label className="schedule-control schedule-search-control schedule-search-desktop">
              <span>{t("Search Tasks")}</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Customer, design, status...")} />
            </label>

            <div className="schedule-range-control">
              <button type="button" onClick={() => moveRange(-1)} aria-label={t("Previous range")}>{"<"}</button>
              <strong>{rangeText}</strong>
              <button type="button" onClick={() => moveRange(1)} aria-label={t("Next range")}>{">"}</button>
            </div>

            <div className="schedule-zoom-control" role="group" aria-label={t("Timeline zoom")} title={t("Timeline zoom")}>
              <button type="button" onClick={() => adjustScheduleZoom(-0.15)} disabled={clampedTimelineZoom <= MIN_SCHEDULE_ZOOM + 0.001} aria-label={t("Zoom out")} title={t("Zoom out")}>−</button>
              <span>{Math.round(clampedTimelineZoom * 100)}%</span>
              <button type="button" onClick={() => adjustScheduleZoom(0.15)} disabled={clampedTimelineZoom >= MAX_SCHEDULE_ZOOM - 0.001} aria-label={t("Zoom in")} title={t("Zoom in")}>+</button>
              <button type="button" onClick={() => setScheduleZoom(1)} aria-label={t("Reset zoom")} title={t("Reset zoom")}>↺</button>
            </div>

            <div className="schedule-mobile-span-row">
              <label className="schedule-control schedule-span-control">
                <span>{t("Range")}</span>
                <select value={span} onChange={event => setSpan(event.target.value as ScheduleSpan)}>
                  {spanOptions.map(option => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
                </select>
              </label>
              <button
                className={search.trim() || mobileSearchOpen ? "schedule-mobile-search-toggle active" : "schedule-mobile-search-toggle"}
                type="button"
                onClick={() => setMobileSearchOpen(current => !current)}
                aria-label={t("Search schedule")}
                aria-expanded={mobileSearchOpen}
                title={t("Search Tasks")}
              >
                ⌕
              </button>
            </div>

            {mobileSearchOpen ? (
              <label className="schedule-control schedule-search-control schedule-search-mobile">
                <span>{t("Search Tasks")}</span>
                <input ref={mobileSearchInputRef} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Customer, design, status...")} />
              </label>
            ) : null}
          </div>

          {notice ? (
            <div className="schedule-plan-notice">
              <span aria-hidden="true">{workspace?.billingPlan === "team_monthly" ? "Team" : "Lite"}</span>
              <p>{t(notice)}</p>
            </div>
          ) : null}

          {scheduleStatus ? <p className="layout-status schedule-action-message">{scheduleStatus}</p> : null}
          {scheduleError ? <p className="layout-error schedule-action-message">{scheduleError}</p> : null}

          {error ? (
            <section className="card app-card schedule-empty-card">
              <CardTitle icon="lock" eyebrow={t("Schedule error")} title={t("Could not load schedule")} />
              <p className="layout-error">{error}</p>
            </section>
          ) : visibleOrders.length === 0 && !loadingSchedule ? (
            <section className="card app-card schedule-empty-card">
              <CardTitle icon="calendar" eyebrow={t("Schedule")} title={t("No orders in this schedule range.")} />
              <p className="muted-copy">{t("Use the arrows, filters or search to find scheduled work.")}</p>
            </section>
          ) : (
            <>
            <div className="schedule-agenda-mobile">
              <div className="schedule-agenda-hint">
                <span aria-hidden="true">🖥️</span>
                <p>{t("This is a quick agenda view. For the full drag-and-drop timeline, open NivaDesk on the web or Mac app.")}</p>
              </div>
              {visibleOrders.map(order => {
                const tone = scheduleTone(order);
                const countdown = countdownText(order);
                const late = orderIsLate(order);
                const design = designForOrder(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    className="schedule-agenda-card"
                    onClick={() => router.push(`/orders?selectedOrderId=${encodeURIComponent(order.id)}`)}
                  >
                    <span className={`schedule-agenda-accent ${tone}`} aria-hidden="true" />
                    <span className="schedule-agenda-body">
                      <span className="schedule-agenda-top">
                        <strong>{titleForOrder(order)}</strong>
                        <span className={`schedule-status-badge ${statusTone(order)}`}>{scheduleStatusLabel(order)}</span>
                      </span>
                      {design ? <span className="schedule-agenda-design">{design}</span> : null}
                      <span className="schedule-agenda-meta">
                        <span>{scheduleRangeText(order)}</span>
                        {countdown ? <span className={late ? "is-late" : ""}>{countdown}</span> : null}
                      </span>
                    </span>
                    <span className="schedule-agenda-chevron" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
            <div
              className={`schedule-timeline-scroll${scheduleTimelinePanning ? " is-panning" : ""}`}
              onPointerDown={startScheduleTimelinePan}
              onPointerMove={moveScheduleTimelinePan}
              onPointerUp={endScheduleTimelinePan}
              onPointerCancel={endScheduleTimelinePan}
              onLostPointerCapture={endScheduleTimelinePan}
              onWheel={handleScheduleTimelineWheel}
            >
              <div className="schedule-timeline-canvas" style={{ width: timelineWidth }}>
                <div className="schedule-timeline-title-row">
                  <strong>{rangeText}</strong>
                  <span>{visibleOrders.length} {t("orders")}</span>
                </div>
                <div className="schedule-day-header">
                  {visibleDays.map(day => (
                    <div key={day.toISOString()} className={startOfDay(day).getTime() === startOfDay(new Date()).getTime() ? "today" : ""} style={{ width: dayWidth }}>
                      <span>{dayName(day, locale)}</span>
                      <strong>{new Intl.DateTimeFormat(locale, { day: "numeric" }).format(day)}</strong>
                    </div>
                  ))}
                </div>
                <div className="schedule-rows">
                  {visibleOrders.map(order => (
                    <ScheduleTimelineRow
                      key={order.id}
                      order={order}
                      dayWidth={dayWidth}
                      timelineWidth={timelineWidth}
                      visibleStart={visibleStart}
                      visibleEnd={visibleEnd}
                      canSeeFinance={canSeeFinance}
                      moneySettings={moneySettings}
                      selected={order.id === selectedOrderId}
                      canEdit={canEditSchedule}
                      saving={savingScheduleOrderId === order.id}
                      onSelect={() => selectScheduleOrder(order)}
                      onOpen={() => router.push(`/orders?selectedOrderId=${encodeURIComponent(order.id)}`)}
                      onMove={delta => moveScheduleOrder(order, delta)}
                      onResizeLeading={delta => resizeScheduleOrderLeading(order, delta)}
                      onResizeTrailing={delta => resizeScheduleOrderTrailing(order, delta)}
                    />
                  ))}
                </div>
              </div>
            </div>
            </>
          )}

          <footer className="schedule-summary-footer">
            <span>{filteredOrders.length} {t("orders")}</span>
            <span>{lateCount} {t("Late")}</span>
            <span>{readyCount} {t("Ready to Ship")}</span>
            <span>{canEditSchedule ? t("Drag bars to move or resize. Double-click opens the order.") : t("Double-click a bar to open the order.")}</span>
          </footer>
        </main>
      </section>
    </AppShell>
  );
}

function ScheduleTimelineRow({
  order,
  dayWidth,
  timelineWidth,
  visibleStart,
  visibleEnd,
  canSeeFinance,
  moneySettings,
  selected,
  canEdit,
  saving,
  onSelect,
  onOpen,
  onMove,
  onResizeLeading,
  onResizeTrailing
}: {
  order: ScheduleOrderItem;
  dayWidth: number;
  timelineWidth: number;
  visibleStart: Date;
  visibleEnd: Date;
  canSeeFinance: boolean;
  moneySettings: StudioMoneySettings;
  selected: boolean;
  canEdit: boolean;
  saving: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onMove: (deltaDays: number) => void;
  onResizeLeading: (deltaDays: number) => void;
  onResizeTrailing: (deltaDays: number) => void;
}) {
  const { hideNumbers } = usePricePrivacy();
  const interactionRef = useRef<{ mode: "move" | "leading" | "trailing"; startX: number; moved: boolean } | null>(null);
  const lastClickAtRef = useRef(0);
  const start = orderStartDate(order);
  const end = addDays(start, Math.max(order.deliveryTime, 1));
  const clippedStart = start.getTime() < visibleStart.getTime() ? visibleStart : start;
  const clippedEnd = end.getTime() > visibleEnd.getTime() ? visibleEnd : end;
  const offsetDays = daysBetween(visibleStart, clippedStart);
  const durationDays = Math.max(1, daysBetween(clippedStart, clippedEnd));
  const x = offsetDays * dayWidth + 7;
  const width = Math.min(Math.max(132, durationDays * dayWidth - 14), timelineWidth - x - 7);
  const tone = scheduleTone(order);
  const status = scheduleStatusLabel(order);
  const statusClass = `schedule-status-badge ${statusTone(order)}`;
  const countdown = countdownText(order);

  function startInteraction(event: ReactPointerEvent<HTMLElement>, mode: "move" | "leading" | "trailing") {
    if (!canEdit || saving) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = { mode, startX: event.clientX, moved: false };
  }

  function updateInteraction(event: ReactPointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (Math.abs(event.clientX - interaction.startX) > 4) {
      interaction.moved = true;
    }
  }

  function finishInteraction(event: ReactPointerEvent<HTMLElement>) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    interactionRef.current = null;
    const deltaDays = Math.round((event.clientX - interaction.startX) / dayWidth);
    if (deltaDays === 0) {
      if (interaction.mode === "move" && !interaction.moved) {
        const now = Date.now();
        if (now - lastClickAtRef.current < 360) {
          lastClickAtRef.current = 0;
          onOpen();
        } else {
          lastClickAtRef.current = now;
          onSelect();
        }
      }
      return;
    }
    if (interaction.mode === "leading") onResizeLeading(deltaDays);
    else if (interaction.mode === "trailing") onResizeTrailing(deltaDays);
    else onMove(deltaDays);
  }

  function cancelInteraction() {
    interactionRef.current = null;
  }

  return (
    <div className="schedule-row" style={{ backgroundSize: `${dayWidth}px 100%` }}>
      <button
        type="button"
        className={[
          "schedule-order-block",
          tone,
          selected ? "selected" : "",
          canEdit ? "can-edit" : "",
          saving ? "is-saving" : ""
        ].filter(Boolean).join(" ")}
        style={{ left: x, width }}
        onClick={canEdit ? undefined : onSelect}
        onDoubleClick={onOpen}
        onPointerDown={event => startInteraction(event, "move")}
        onPointerMove={updateInteraction}
        onPointerUp={finishInteraction}
        onPointerCancel={cancelInteraction}
      >
        {canEdit ? (
          <span
            className="schedule-resize-handle leading"
            aria-hidden="true"
            onPointerDown={event => startInteraction(event, "leading")}
            onPointerMove={updateInteraction}
            onPointerUp={finishInteraction}
            onPointerCancel={cancelInteraction}
          />
        ) : null}
        <span className="schedule-order-thumb">
          {order.previewImageUrl ? <img src={order.previewImageUrl} alt="" /> : <span className="image-placeholder-icon" aria-hidden="true"><CardIconGlyph icon="photo" /></span>}
        </span>
        <span className="schedule-order-main">
          <strong>{titleForOrder(order)}</strong>
          <small>{designForOrder(order)}</small>
          <span className="schedule-order-meta">
            <span className={statusClass}>{status}</span>
            <span>{shortDate(orderStartDate(order))} - {shortDate(orderDueDate(order))}</span>
            {countdown ? <span>{countdown}</span> : null}
          </span>
        </span>
        {canSeeFinance ? <span className="schedule-order-money">{money(order.remainingAmount, hideNumbers, moneySettings)}</span> : null}
        {canEdit ? (
          <>
            <span className="schedule-order-grip" aria-hidden="true">≡</span>
            <span
              className="schedule-resize-handle trailing"
              aria-hidden="true"
              onPointerDown={event => startInteraction(event, "trailing")}
              onPointerMove={updateInteraction}
              onPointerUp={finishInteraction}
              onPointerCancel={cancelInteraction}
            />
          </>
        ) : null}
      </button>
    </div>
  );
}
