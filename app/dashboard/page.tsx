"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { AppShell } from "@/components/AppShell";
import { CardIconGlyph, CardTitle, type CardIcon } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  loadDashboardCounts,
  loadDashboardFinanceOrders,
  loadWorkspaceSettingsOverview,
  loadWorkspaceContext,
  workspaceAccessAllows,
  type DashboardWidgetVisibility,
  type DashboardCounts,
  type DashboardFinanceOrder,
  type WorkspaceSettingsOverview,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import {
  adjustedDashboardNetProfit,
  baseCostTotal,
  customExpenseTotal,
  customPendingTotal,
  dashboardCostTotal,
  orderSalesTotal
} from "@/lib/studioflow/finance";
import { studioT, studioLocaleTag } from "@/lib/studioflow/language";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";
import { saveDashboardWidgetVisibility } from "@/lib/studioflow/settingsActions";
import { detectRecurringSpends, monthlyFixedTotal, reclaimableVatForTx } from "@/lib/studioflow/bankInsights";

type RangeKey = "week" | "month" | "year" | "all" | "custom";
type BucketUnit = "day" | "month";

type FinanceTotals = {
  received: number;
  baseCost: number;
  basicBalance: number;
  revenue: number;
  pending: number;
  cost: number;
  fee: number;
  shipping: number;
  tax: number;
  netProfit: number;
  corporationTax: number;
  // Clean components for the Financial Breakdown (per-order overrides applied,
  // nothing rolled in from hidden cards): they reconcile exactly to netProfit.
  breakdownBaseCost: number;
  expenses: number;
};

type ChartPoint = {
  label: string;
  value: number;
  /** Local start of the bucket this point aggregates — drill-down target. */
  start: Date;
};

type BankTx = {
  id: string;
  amount: number;
  currency: string;
  bookingDate: string;
  description: string;
  counterparty: string;
  category: string;
  categoryAuto: string;
  vatCode: string;
  vatCodeAuto: string;
  splits: Array<{ amount: number; vatCode: string }>;
};

// Activation checklist (first-run report): the dashboard is where a brand-new
// owner looks first, and an empty KPI wall says nothing. Five small steps with
// live ticks where the data can prove them (orders, customers) and click-ticks
// for the rest. Dismissal is a per-workspace device convenience.
const GETTING_STARTED_STEPS: { id: string; labelKey: string; href: string; auto?: "orders" | "customers" }[] = [
  { id: "order", labelKey: "Create your first order", href: "/orders", auto: "orders" },
  { id: "customer", labelKey: "Add your first customer", href: "/customers", auto: "customers" },
  { id: "chatgpt", labelKey: "Import your old orders with ChatGPT", href: "/chatgpt" },
  { id: "store", labelKey: "Connect your online store", href: "/settings?section=woocommerce" },
  { id: "domain", labelKey: "Put customer links on your name", href: "/settings?section=client-domain" }
];

function GettingStartedCard({ workspaceId, orderCount, customerCount, t }: {
  workspaceId: string;
  orderCount: number;
  customerCount: number;
  t: (text: string) => string;
}) {
  const router = useRouter();
  const dismissKey = `nivadesk-getting-started-dismissed:${workspaceId}`;
  const clickedKey = `nivadesk-getting-started-clicked:${workspaceId}`;
  const [dismissed, setDismissed] = useState(true);
  const [clicked, setClicked] = useState<string[]>([]);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey) === "1");
      setClicked(JSON.parse(window.localStorage.getItem(clickedKey) || "[]"));
    } catch {
      setDismissed(false);
    }
  }, [dismissKey, clickedKey]);

  const doneFor = (step: (typeof GETTING_STARTED_STEPS)[number]) => {
    if (step.auto === "orders") return orderCount > 0;
    if (step.auto === "customers") return customerCount > 0;
    return clicked.includes(step.id);
  };
  const doneCount = GETTING_STARTED_STEPS.filter(doneFor).length;
  if (dismissed || doneCount >= GETTING_STARTED_STEPS.length) return null;

  return (
    <section className="card app-card getting-started-card">
      <div className="getting-started-head">
        <CardTitle icon="checklist" eyebrow={t("Getting started")} title={t("Set up your workspace in five small steps.")} />
        <div className="getting-started-meta">
          <span className="studio-pill">{doneCount}/{GETTING_STARTED_STEPS.length}</span>
          <button
            type="button"
            className="getting-started-hide"
            onClick={() => {
              try { window.localStorage.setItem(dismissKey, "1"); } catch { /* storage unavailable */ }
              setDismissed(true);
            }}
          >
            {t("Hide this checklist")}
          </button>
        </div>
      </div>
      <ol className="getting-started-steps">
        {GETTING_STARTED_STEPS.map(step => {
          const done = doneFor(step);
          return (
            <li key={step.id} data-done={done ? "true" : "false"}>
              <button
                type="button"
                onClick={() => {
                  if (!step.auto && !clicked.includes(step.id)) {
                    const next = [...clicked, step.id];
                    setClicked(next);
                    try { window.localStorage.setItem(clickedKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
                  }
                  router.push(step.href);
                }}
              >
                <span className="getting-started-tick" aria-hidden="true">{done ? "✓" : ""}</span>
                {t(step.labelKey)}
                <span className="getting-started-arrow" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type DashboardChannel = "all" | "shopify" | "woocommerce" | "manual";

// Workspace currency is stored as a display symbol; imported orders carry ISO
// codes. Real conversion needs exchange-rate decisions that belong to the
// owner (which rate, which date) — until then, foreign-currency orders are
// SHOWN in their own breakdown rows, never silently converted.
const DASHBOARD_SYMBOL_TO_ISO: Record<string, string> = {
  "£": "GBP", "$": "USD", "€": "EUR", "₺": "TRY", "¥": "JPY",
  "A$": "AUD", "C$": "CAD", "CHF": "CHF", "د.إ": "AED"
};

function dashboardOrderCurrency(order: DashboardFinanceOrder): string {
  return (
    order.customFields["Shopify Currency"]
    || order.customFields["WooCommerce Currency"]
    || order.customFields["Currency"]
    || ""
  ).trim().toUpperCase();
}

function dashboardOrderChannel(order: DashboardFinanceOrder): DashboardChannel {
  const source = (order.customFields["Source"] || "").trim().toLowerCase();
  if (source === "shopify") return "shopify";
  if (source === "woocommerce") return "woocommerce";
  return "manual";
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" }
];

const DEFAULT_DASHBOARD_VISIBILITY: DashboardWidgetVisibility = {
  revenue: true,
  pending: true,
  cost: true,
  fee: true,
  shipping: true,
  tax: true,
  profit: true,
  bankSpending: true
};

const DASHBOARD_WIDGET_ROWS: Array<{
  key: keyof DashboardWidgetVisibility;
  title: string;
  glyph: string;
  icon: CardIcon;
  tone: "blue" | "green" | "orange" | "red";
}> = [
  { key: "revenue", title: "Revenue", glyph: "£", icon: "finance", tone: "blue" },
  { key: "pending", title: "Pending", glyph: "◷", icon: "historyClock", tone: "orange" },
  { key: "cost", title: "Cost", glyph: "⌑", icon: "shippingBox", tone: "red" },
  { key: "fee", title: "Platform Fee", glyph: "%", icon: "finance", tone: "red" },
  { key: "shipping", title: "Shipping", glyph: "↗", icon: "airplane", tone: "red" },
  { key: "tax", title: "VAT Amount", glyph: "▦", icon: "plan", tone: "red" },
  { key: "profit", title: "Net Profit", glyph: "✓", icon: "check", tone: "green" },
  { key: "bankSpending", title: "Bank Spending", glyph: "🏦", icon: "finance", tone: "red" }
];

const DASHBOARD_WIDGET_META = DASHBOARD_WIDGET_ROWS.reduce(
  (result, row) => ({ ...result, [row.key]: row }),
  {} as Record<keyof DashboardWidgetVisibility, (typeof DASHBOARD_WIDGET_ROWS)[number]>
);

function money(value: number, hidden: boolean, settings: StudioMoneySettings) {
  if (hidden) return hiddenMoneyLabel(moneySymbol(settings));
  return formatStudioMoney(value, settings);
}

function boolSetting(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function dashboardVisibilityFromData(data: Record<string, unknown>): DashboardWidgetVisibility {
  const mapValue = data.dashboardWidgetVisibility && typeof data.dashboardWidgetVisibility === "object"
    ? data.dashboardWidgetVisibility as Record<string, unknown>
    : {};

  return {
    revenue: boolSetting(mapValue.revenue, boolSetting(data.dashShowRevenue, true)),
    pending: boolSetting(mapValue.pending, boolSetting(data.dashShowPending, true)),
    cost: boolSetting(mapValue.cost, boolSetting(data.dashShowCost, true)),
    fee: boolSetting(mapValue.fee, boolSetting(data.dashShowFee, true)),
    shipping: boolSetting(mapValue.shipping, boolSetting(data.dashShowShipping, true)),
    tax: boolSetting(mapValue.tax, boolSetting(data.dashShowTax, true)),
    profit: boolSetting(mapValue.profit, boolSetting(data.dashShowProfit, true)),
    bankSpending: boolSetting(mapValue.bankSpending, true)
  };
}

function BreakdownRow({ label, amount, negative, strong, tone, hideNumbers, settings, valueOverride }: {
  label: string;
  amount: number;
  negative?: boolean;
  strong?: boolean;
  tone?: "red" | "green";
  hideNumbers: boolean;
  settings: WorkspaceSettingsOverview | null;
  valueOverride?: string;
}) {
  const text = valueOverride ?? money(amount, hideNumbers, settings);
  return (
    <div className={`financial-breakdown-row${strong ? " is-strong" : ""}`}>
      <span className="financial-breakdown-label">{label}</span>
      <span className={`financial-breakdown-value${tone ? ` is-${tone}` : ""}`}>
        {negative && !hideNumbers ? `-${text}` : text}
      </span>
    </div>
  );
}

function totalsForOrders(
  orders: DashboardFinanceOrder[],
  settings: WorkspaceSettingsOverview | null,
  visibility: DashboardWidgetVisibility
): FinanceTotals {
  return orders.reduce<FinanceTotals>((totals, order) => ({
    received: totals.received + order.paidAmount,
    baseCost: totals.baseCost + order.watchPurchasePrice,
    basicBalance: totals.basicBalance + order.paidAmount - order.watchPurchasePrice,
    revenue: totals.revenue + orderSalesTotal(order),
    pending: totals.pending + order.remainingAmount + customPendingTotal(order, settings),
    cost: totals.cost + dashboardCostTotal(order, settings, {
      showFee: visibility.fee,
      showShipping: visibility.shipping,
      showTax: visibility.tax
    }),
    fee: totals.fee + order.paymentFee,
    shipping: totals.shipping + order.deliveryCost,
    tax: totals.tax + order.taxAmount,
    netProfit: totals.netProfit + adjustedDashboardNetProfit(order, settings),
    corporationTax: totals.corporationTax + (settings?.corporationTaxEnabled
      ? Math.round(Math.max(0, adjustedDashboardNetProfit(order, settings)) * (settings.corporationTaxRate ?? 19)) / 100
      : 0),
    breakdownBaseCost: totals.breakdownBaseCost + baseCostTotal(order, settings),
    expenses: totals.expenses + customExpenseTotal(order, settings)
  }), { received: 0, baseCost: 0, basicBalance: 0, revenue: 0, pending: 0, cost: 0, fee: 0, shipping: 0, tax: 0, netProfit: 0, corporationTax: 0, breakdownBaseCost: 0, expenses: 0 });
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  return addDays(start, -mondayOffset);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addYears(date: Date, years: number) {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

function dateInputValue(date: Date) {
  // Local calendar date, never toISOString: in BST, July 1st 00:00 local is
  // June 30th in UTC, and the picker would land a day early (the same drift
  // the schedule's Created Date bug came from).
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseInputDate(value: string, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function rangeWindow(range: RangeKey, orders: DashboardFinanceOrder[], customStart: string, customEnd: string) {
  const now = new Date();
  const datedOrders = orders.filter(order => order.paymentDate);
  const firstOrderDate = datedOrders.reduce<Date | null>((earliest, order) => {
    if (!order.paymentDate) return earliest;
    return !earliest || order.paymentDate < earliest ? order.paymentDate : earliest;
  }, null);

  if (range === "week") {
    const start = startOfWeek(now);
    return { start, end: endOfDay(addDays(start, 6)), unit: "day" as BucketUnit };
  }

  if (range === "month") {
    return { start: startOfMonth(now), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999), unit: "day" as BucketUnit };
  }

  if (range === "all") {
    return { start: startOfMonth(firstOrderDate ?? addYears(now, -1)), end: endOfDay(now), unit: "month" as BucketUnit };
  }

  if (range === "custom") {
    let start = parseInputDate(customStart, startOfMonth(now));
    let end = parseInputDate(customEnd, now);
    // A backwards range is always a typo, never an intent: swap, don't zero.
    if (start > end) [start, end] = [end, start];
    const days = Math.abs(end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    return { start: startOfDay(start), end: endOfDay(end), unit: days > 70 ? "month" as BucketUnit : "day" as BucketUnit };
  }

  return { start: startOfYear(now), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999), unit: "month" as BucketUnit };
}

function filterOrdersByWindow(orders: DashboardFinanceOrder[], start: Date, end: Date) {
  return orders.filter(order => order.paymentDate && order.paymentDate >= start && order.paymentDate <= end);
}

function bucketLabel(date: Date, unit: BucketUnit, locale: string = "en-GB") {
  if (unit === "month") {
    return new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(date);
}

function nextBucket(date: Date, unit: BucketUnit) {
  return unit === "month" ? addMonths(date, 1) : addDays(date, 1);
}

function buildChartSeries(
  orders: DashboardFinanceOrder[],
  settings: WorkspaceSettingsOverview | null,
  start: Date,
  end: Date,
  unit: BucketUnit,
  yearsBack = 0,
  metric: "netProfit" | "basicBalance" = "netProfit",
  locale: string = "en-GB"
): ChartPoint[] {
  const points: ChartPoint[] = [];
  let cursor = unit === "month" ? startOfMonth(start) : startOfDay(start);

  while (cursor <= end && points.length < 80) {
    const visibleBucketStart = new Date(cursor);
    const visibleBucketEnd = nextBucket(visibleBucketStart, unit);
    const sourceStart = addYears(visibleBucketStart, -yearsBack);
    const sourceEnd = addYears(visibleBucketEnd, -yearsBack);
    const value = orders.reduce((total, order) => {
      if (!order.paymentDate || order.paymentDate < sourceStart || order.paymentDate >= sourceEnd) return total;
      return total + (metric === "basicBalance"
        ? order.paidAmount - order.watchPurchasePrice
        : adjustedDashboardNetProfit(order, settings));
    }, 0);

    points.push({ label: bucketLabel(visibleBucketStart, unit, locale), value, start: visibleBucketStart });
    cursor = visibleBucketEnd;
  }

  return points;
}

function yearTotals(orders: DashboardFinanceOrder[], settings: WorkspaceSettingsOverview | null) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const current = orders
    .filter(order => order.paymentDate?.getFullYear() === thisYear)
    .reduce((total, order) => total + adjustedDashboardNetProfit(order, settings), 0);
  const previous = orders
    .filter(order => order.paymentDate?.getFullYear() === thisYear - 1)
    .reduce((total, order) => total + adjustedDashboardNetProfit(order, settings), 0);
  // Divide by the magnitude, not the signed value: after a loss year a
  // recovery is growth, and a signed denominator flips the arrow.
  const growth = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / Math.abs(previous)) * 100;
  const basicOrders = orders.filter(order => order.paymentDate?.getFullYear() === thisYear);
  const received = basicOrders.reduce((total, order) => total + order.paidAmount, 0);
  const baseCost = basicOrders.reduce((total, order) => total + order.watchPurchasePrice, 0);
  return { current, previous, growth, received, baseCost, basicBalance: received - baseCost };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { hideNumbers } = usePricePrivacy();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [financeOrders, setFinanceOrders] = useState<DashboardFinanceOrder[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [range, setRange] = useState<RangeKey>("year");
  const [compareOneYear, setCompareOneYear] = useState(false);
  const [compareThreeYears, setCompareThreeYears] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [dashboardVisibility, setDashboardVisibility] = useState<DashboardWidgetVisibility>(DEFAULT_DASHBOARD_VISIBILITY);
  const [customizeStatus, setCustomizeStatus] = useState<string | null>(null);
  const [customizeError, setCustomizeError] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState(dateInputValue(addMonths(new Date(), -1)));
  const [customEnd, setCustomEnd] = useState(dateInputValue(new Date()));
  const [bankTransactions, setBankTransactions] = useState<BankTx[]>([]);
  const [bankLastSync, setBankLastSync] = useState<Date | null>(null);

  // Owner-only live bank feed — shared by the Bank Activity card and the red
  // spending line on the profit chart. Rules deny other roles, so the error
  // handler simply keeps the feed empty for them.
  const isWorkspaceOwner = workspace?.role === "owner";
  const canViewBankFeed = isWorkspaceOwner || Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "bankFeed"));
  const workspaceId = workspace?.id ?? "";
  useEffect(() => {
    if (!workspaceId || !canViewBankFeed) return;
    const unsubTx = onSnapshot(
      query(collection(db, "companies", workspaceId, "bankTransactions"), orderBy("bookingDate", "desc")),
      snap => {
        setBankTransactions(snap.docs.map(txDoc => {
          const data = txDoc.data() as Record<string, unknown>;
          return {
            id: txDoc.id,
            amount: Number(data.amount) || 0,
            currency: String(data.currency || "GBP"),
            bookingDate: String(data.bookingDate || ""),
            description: String(data.description || ""),
            counterparty: String(data.counterparty || ""),
            category: String(data.category || ""),
            categoryAuto: String(data.categoryAuto || ""),
            vatCode: String(data.vatCode || ""),
            vatCodeAuto: String(data.vatCodeAuto || ""),
            // Split lines carry their own VAT treatment (amounts stored
            // positive on the bank page) — same shape /bank reads.
            splits: Array.isArray(data.splits)
              ? (data.splits as Array<Record<string, unknown>>).map(row => ({
                  amount: Number(row?.amount) || 0,
                  vatCode: String(row?.vatCode || "")
                }))
              : []
          };
        }));
      },
      () => setBankTransactions([])
    );
    const unsubConnections = onSnapshot(
      collection(db, "companies", workspaceId, "bankConnections"),
      snap => {
        let latest: Date | null = null;
        snap.docs.forEach(connDoc => {
          const raw = (connDoc.data() as Record<string, unknown>).lastSyncedAt as { toDate?: () => Date } | undefined;
          const when = raw && typeof raw.toDate === "function" ? raw.toDate() : null;
          if (when && (!latest || when > latest)) latest = when;
        });
        setBankLastSync(latest);
      },
      () => setBankLastSync(null)
    );
    return () => { unsubTx(); unsubConnections(); };
  }, [workspaceId, canViewBankFeed]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingWorkspace(true);
      setError(null);
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        setWorkspace(loadedWorkspace);
        if (
          !workspaceAccessAllows(loadedWorkspace.memberAccess, "dashboard") ||
          !workspaceAccessAllows(loadedWorkspace.memberAccess, "financialInfo")
        ) {
          router.replace("/orders");
          return;
        }
        const [loadedCounts, loadedFinanceOrders, loadedSettings] = await Promise.all([
          loadDashboardCounts(loadedWorkspace.id),
          loadDashboardFinanceOrders(loadedWorkspace.id),
          loadWorkspaceSettingsOverview(loadedWorkspace.id)
        ]);
        if (cancelled) return;
        setCounts(loadedCounts);
        setFinanceOrders(loadedFinanceOrders);
        setSettings(loadedSettings);
        setDashboardVisibility(loadedSettings.dashboardWidgetVisibility);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load workspace data.");
        }
      } finally {
        if (!cancelled) setLoadingWorkspace(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, user]);

  useEffect(() => {
    if (!workspace?.id) return;
    return onSnapshot(doc(db, "companySettings", workspace.id), snapshot => {
      if (!snapshot.exists()) return;
      const nextVisibility = dashboardVisibilityFromData(snapshot.data());
      setDashboardVisibility(nextVisibility);
      setSettings(current => current ? { ...current, dashboardWidgetVisibility: nextVisibility } : current);
    });
  }, [workspace?.id]);

  const canSeeFinance = Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "financialInfo"));
  const canSeeAdvancedFinance = Boolean(workspace?.entitlements.features.financial_advanced && canSeeFinance);
  // Store-channel filter (dashboard report): every money view can be scoped
  // to Shopify, WooCommerce or manually created orders. The pills only render
  // when an integration channel actually exists in the workspace.
  const [channelFilter, setChannelFilter] = useState<DashboardChannel>("all");
  const availableChannels = useMemo(() => {
    const found = new Set<DashboardChannel>();
    for (const order of financeOrders) found.add(dashboardOrderChannel(order));
    return found;
  }, [financeOrders]);
  const channelOrders = useMemo(
    () => channelFilter === "all"
      ? financeOrders
      : financeOrders.filter(order => dashboardOrderChannel(order) === channelFilter),
    [channelFilter, financeOrders]
  );
  const currentWindow = useMemo(
    () => rangeWindow(range, channelOrders, customStart, customEnd),
    [customEnd, customStart, channelOrders, range]
  );
  // Cancelled/refunded orders (countsTowardBalance === false) are excluded
  // from every money aggregate — Revenue, Payments Received, Outstanding,
  // Net, the chart, YoY and the tax set-aside — and surfaced as their own
  // visible line instead, mirroring the customers page.
  const countingFinanceOrders = useMemo(
    () => channelOrders.filter(order => order.countsTowardBalance !== false),
    [channelOrders]
  );
  const filteredFinanceOrders = useMemo(
    () => filterOrdersByWindow(channelOrders, currentWindow.start, currentWindow.end),
    [currentWindow.end, currentWindow.start, channelOrders]
  );
  const filteredCountingOrders = useMemo(
    () => filteredFinanceOrders.filter(order => order.countsTowardBalance !== false),
    [filteredFinanceOrders]
  );
  // Money sitting on non-counting orders in the visible range — same figure
  // the customers page reports as "cancelled or refunded".
  const cancelledSummary = useMemo(() => {
    const excluded = filteredFinanceOrders.filter(order => order.countsTowardBalance === false);
    return {
      count: excluded.length,
      amount: excluded.reduce((total, order) => total + orderSalesTotal(order), 0)
    };
  }, [filteredFinanceOrders]);
  const totals = useMemo(
    () => totalsForOrders(filteredCountingOrders, settings, dashboardVisibility),
    [dashboardVisibility, filteredCountingOrders, settings]
  );
  const workspaceCurrencyIso = DASHBOARD_SYMBOL_TO_ISO[(settings?.selectedCurrency || "£").trim()] || "";
  const foreignCurrencies = useMemo(() => {
    if (!workspaceCurrencyIso) return [] as Array<[string, { amount: number; count: number }]>;
    const map = new Map<string, { amount: number; count: number }>();
    for (const order of filteredCountingOrders) {
      const code = dashboardOrderCurrency(order);
      if (!code || code === workspaceCurrencyIso) continue;
      const row = map.get(code) ?? { amount: 0, count: 0 };
      row.amount += orderSalesTotal(order);
      row.count += 1;
      map.set(code, row);
    }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount);
  }, [filteredCountingOrders, workspaceCurrencyIso]);
  // Average order value and the new/returning split follow the same
  // exclusions as Revenue: cancelled/refunded orders are out, foreign-currency
  // orders count at face value (the card's hint already discloses that).
  const averageOrderValue = useMemo(
    () => (filteredCountingOrders.length > 0 ? totals.revenue / filteredCountingOrders.length : 0),
    [filteredCountingOrders.length, totals.revenue]
  );
  const customerSplit = useMemo(() => {
    // First-order history looks across ALL channels on purpose: a customer
    // who bought in the shop last year is returning even if this range is
    // filtered to Shopify.
    const firstSeen = new Map<string, number>();
    for (const order of financeOrders) {
      if (order.countsTowardBalance === false || !order.paymentDate) continue;
      const key = order.customerName.trim().toLowerCase();
      if (!key) continue;
      const at = order.paymentDate.getTime();
      const prev = firstSeen.get(key);
      if (prev === undefined || at < prev) firstSeen.set(key, at);
    }
    const inWindow = new Set<string>();
    for (const order of filteredCountingOrders) {
      const key = order.customerName.trim().toLowerCase();
      if (key) inWindow.add(key);
    }
    let newCount = 0;
    let returningCount = 0;
    const startMs = currentWindow.start.getTime();
    for (const key of inWindow) {
      const first = firstSeen.get(key);
      if (first === undefined) continue;
      if (first < startMs) returningCount += 1;
      else newCount += 1;
    }
    return { newCount, returningCount };
  }, [financeOrders, filteredCountingOrders, currentWindow.start]);
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const currentSeries = useMemo(
    () => buildChartSeries(
      countingFinanceOrders,
      settings,
      currentWindow.start,
      currentWindow.end,
      currentWindow.unit,
      0,
      canSeeAdvancedFinance ? "netProfit" : "basicBalance",
      locale
    ),
    [canSeeAdvancedFinance, currentWindow.end, currentWindow.start, currentWindow.unit, countingFinanceOrders, settings, locale]
  );
  const previousYearSeries = useMemo(
    () => buildChartSeries(countingFinanceOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit, 1, "netProfit", locale),
    [currentWindow.end, currentWindow.start, currentWindow.unit, countingFinanceOrders, settings, locale]
  );
  const twoYearsBackSeries = useMemo(
    () => buildChartSeries(countingFinanceOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit, 2, "netProfit", locale),
    [currentWindow.end, currentWindow.start, currentWindow.unit, countingFinanceOrders, settings, locale]
  );
  const threeYearsBackSeries = useMemo(
    () => buildChartSeries(countingFinanceOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit, 3, "netProfit", locale),
    [currentWindow.end, currentWindow.start, currentWindow.unit, countingFinanceOrders, settings, locale]
  );
  // Bank spending per chart bucket (red line). Buckets mirror buildChartSeries
  // exactly so the series lines up point-for-point with the profit line.
  const bankSeries = useMemo<ChartPoint[]>(() => {
    if (!canViewBankFeed || !dashboardVisibility.bankSpending || bankTransactions.length === 0) return [];
    const spends = bankTransactions
      .filter(item => item.amount < 0 && item.bookingDate)
      .map(item => {
        const [y, m, d] = item.bookingDate.split("-").map(Number);
        return { when: new Date(y, (m || 1) - 1, d || 1), amount: Math.abs(item.amount) };
      });
    const points: ChartPoint[] = [];
    let cursor = currentWindow.unit === "month" ? startOfMonth(currentWindow.start) : startOfDay(currentWindow.start);
    let any = false;
    while (cursor <= currentWindow.end && points.length < 80) {
      const bucketStart = new Date(cursor);
      const bucketEnd = nextBucket(bucketStart, currentWindow.unit);
      const value = spends.reduce((total, item) => (item.when >= bucketStart && item.when < bucketEnd ? total + item.amount : total), 0);
      if (value > 0) any = true;
      points.push({ label: bucketLabel(bucketStart, currentWindow.unit, locale), value, start: bucketStart });
      cursor = bucketEnd;
    }
    return any ? points : [];
  }, [bankTransactions, currentWindow.end, currentWindow.start, currentWindow.unit, dashboardVisibility.bankSpending, canViewBankFeed, locale]);

  const yearly = useMemo(() => yearTotals(countingFinanceOrders, settings), [countingFinanceOrders, settings]);
  const revenueCardTitle = settings?.taxRuleNameRevenue || "Standard VAT (New)";

  async function persistDashboardVisibility(next: DashboardWidgetVisibility) {
    if (!workspace) return;
    const previous = dashboardVisibility;
    setDashboardVisibility(next);
    setSettings(current => current ? { ...current, dashboardWidgetVisibility: next } : current);
    setCustomizeStatus(null);
    setCustomizeError(null);

    try {
      const saved = await saveDashboardWidgetVisibility(workspace, next);
      const savedVisibility = saved.visibility ?? next;
      setDashboardVisibility(savedVisibility);
      setSettings(current => current ? { ...current, dashboardWidgetVisibility: savedVisibility } : current);
      setCustomizeStatus(saved.message || "Dashboard customization saved.");
    } catch (saveError) {
      setDashboardVisibility(previous);
      setSettings(current => current ? { ...current, dashboardWidgetVisibility: previous } : current);
      setCustomizeError(saveError instanceof Error ? saveError.message : "Dashboard customization could not be saved.");
    }
  }

  function updateDashboardVisibility(key: keyof DashboardWidgetVisibility, value: boolean) {
    return persistDashboardVisibility({ ...dashboardVisibility, [key]: value });
  }

  const isDefaultDashboardLayout = DASHBOARD_WIDGET_ROWS.every(
    row => dashboardVisibility[row.key] === DEFAULT_DASHBOARD_VISIBILITY[row.key]
  );

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingWorkspace ? <LoadingScreen /> : null}
      {error ? (
        <section className="card app-card dashboard-error-card">
          <CardTitle icon="lock" eyebrow={t("Workspace error")} title={t("Could not load your workspace")} />
          <p className="layout-error">{error}</p>
        </section>
      ) : null}

      {workspace && counts ? (
        <div className="dashboard-workspace">
          <section className="dashboard-header-card">
            <div>
              <p className="orders-kicker">{t("Dashboard")}</p>
              <h1>{workspace.name}</h1>
              <p>
                {workspace.billingPlanName} · {workspace.roleLabel} ·{" "}
                <span title={t("Excludes Done, Completed and Cancelled orders.")}>{counts.activeOrderCount} {t("active orders")}</span>
              </p>
            </div>
            <div className="compact-pill-row">
              <button type="button" className="studio-pill" style={{ cursor: "pointer", border: "none" }} onClick={() => router.push("/orders")} title={t("Open the orders list")}>{t("Orders")} {counts.orderCount}</button>
              <button type="button" className="studio-pill" style={{ cursor: "pointer", border: "none" }} onClick={() => router.push("/customers")} title={t("Open the customer directory")}>{t("Customers")} {counts.customerCount}</button>
              <button type="button" className="studio-pill" style={{ cursor: "pointer", border: "none" }} onClick={() => router.push("/orders")} title={t("Delivery due within the next 14 days, excluding closed orders.")}>{t("Due soon")} {counts.dueSoonCount}</button>
              <button
                type="button"
                className="studio-pill"
                onClick={() => router.push("/export")}
                style={{ cursor: "pointer", border: "none" }}
                title={t("Export orders to CSV")}
              >
                {t("Export CSV")}
              </button>
            </div>
          </section>

          {workspace ? (
            <GettingStartedCard
              workspaceId={workspace.id}
              orderCount={counts.orderCount}
              customerCount={counts.customerCount}
              t={t}
            />
          ) : null}

          <section className="dashboard-filter-card">
            <div className="segmented-control" aria-label={t("Dashboard time range")}>
              {(canSeeAdvancedFinance ? RANGE_OPTIONS : RANGE_OPTIONS.filter(option => option.key !== "custom")).map(option => (
                <button
                  key={option.key}
                  className={range === option.key ? "active" : ""}
                  type="button"
                  onClick={() => setRange(option.key)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>

            {availableChannels.has("shopify") || availableChannels.has("woocommerce") ? (
              <div className="segmented-control dashboard-channel-control" aria-label={t("Sales channel")}>
                {([
                  ["all", t("All channels")],
                  ...(availableChannels.has("shopify") ? [["shopify", "Shopify"] as const] : []),
                  ...(availableChannels.has("woocommerce") ? [["woocommerce", "WooCommerce"] as const] : []),
                  ["manual", t("Manual")]
                ] as Array<readonly [DashboardChannel, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    className={channelFilter === key ? "active" : ""}
                    type="button"
                    onClick={() => setChannelFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {range === "custom" ? (
              <div className="dashboard-date-controls">
                <label>
                  {t("Start")}
                  <input className="input" type="date" value={customStart} max={customEnd || undefined} onChange={event => setCustomStart(event.target.value)} />
                </label>
                <label>
                  {t("End")}
                  <input className="input" type="date" value={customEnd} min={customStart || undefined} onChange={event => setCustomEnd(event.target.value)} />
                </label>
                {/* The ranges an owner actually reaches for (§3), one tap each.
                    Tax year = UK personal tax year, 6 April to 5 April. */}
                <div className="dashboard-range-presets">
                  {([
                    ["last7", t("Last 7 days")],
                    ["last30", t("Last 30 days")],
                    ["thisQuarter", t("This quarter")],
                    ["lastQuarter", t("Last quarter")],
                    ["taxYear", t("Tax year")]
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className="compare-pill"
                      onClick={() => {
                        const now = new Date();
                        const day = 24 * 60 * 60 * 1000;
                        let start = now;
                        let end = now;
                        if (key === "last7") start = new Date(now.getTime() - 6 * day);
                        else if (key === "last30") start = new Date(now.getTime() - 29 * day);
                        else if (key === "thisQuarter") {
                          start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                        } else if (key === "lastQuarter") {
                          const quarterStart = Math.floor(now.getMonth() / 3) * 3;
                          start = new Date(now.getFullYear(), quarterStart - 3, 1);
                          end = new Date(now.getFullYear(), quarterStart, 0);
                        } else if (key === "taxYear") {
                          const yearStart = now >= new Date(now.getFullYear(), 3, 6)
                            ? new Date(now.getFullYear(), 3, 6)
                            : new Date(now.getFullYear() - 1, 3, 6);
                          start = yearStart;
                        }
                        setCustomStart(dateInputValue(start));
                        setCustomEnd(dateInputValue(end));
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {canSeeAdvancedFinance ? (
            <div className="dashboard-compare-controls">
              <button
                className={compareOneYear ? "compare-pill active" : "compare-pill"}
                type="button"
                onClick={() => setCompareOneYear(value => !value)}
              >
                {t("1 Yr Compare")}
              </button>
              <button
                className={compareThreeYears ? "compare-pill active" : "compare-pill"}
                type="button"
                onClick={() => {
                  setCompareThreeYears(value => {
                    if (!value) setCompareOneYear(true);
                    return !value;
                  });
                }}
              >
                {t("3 Yrs Compare")}
              </button>
              <button className={showCustomize ? "compare-pill active" : "compare-pill"} type="button" onClick={() => setShowCustomize(value => !value)}>
                {t("Customize")}
              </button>
            </div>
            ) : (
              <div className="dashboard-compare-controls" aria-label={t("Advanced comparison available on Pro")} style={{ alignItems: "center", gap: 12 }}>
                <span
                  className="compare-pill"
                  aria-disabled="true"
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, opacity: 0.78 }}
                >
                  <span aria-hidden="true" style={{ display: "inline-flex", width: 13, height: 13 }}>
                    <CardIconGlyph icon="lock" />
                  </span>
                  {t("1Y / 3Y Compare")}
                  <span className="studio-pill" style={{ padding: "2px 8px", fontSize: 11 }}>{t("Pro")}</span>
                </span>
                <button
                  className="compare-pill active"
                  style={{ borderRadius: 12, paddingInline: 17 }}
                  type="button"
                  onClick={() => setShowCustomize(value => !value)}
                >
                  {t("Customize")}
                </button>
              </div>
            )}
          </section>

          {!canSeeFinance ? (
            <section className="card app-card locked-panel">
              <CardTitle icon="lock" eyebrow={t("Role locked")} title={t("Finance dashboard is hidden for Workflow Only.")} />
              <p className="muted-copy">{t("Orders, workflow and Client Files remain available according to your workspace permissions.")}</p>
            </section>
          ) : (
            <>
              <section className="dashboard-summary-grid">
                {canSeeAdvancedFinance ? (
                  <>
                    {/* Revenue is invoiced order value; Payments Received is
                        the cash that actually arrived — the report's accrual
                        vs cash split, side by side instead of blended. */}
                    {dashboardVisibility.revenue ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.revenue.icon} title={t("Revenue")} sub={revenueCardTitle} hint={`${t("Invoiced order value in this range: paid + still owed (accrual basis).")} ${t("Cancelled and refunded orders are not counted.")}${foreignCurrencies.length ? ` ${t("Some orders are in other currencies; the breakdown lists their original amounts without conversion.")}` : ""}`} value={money(totals.revenue, hideNumbers, settings)} tone="blue" /> : null}
                    {dashboardVisibility.revenue ? <DashboardSummaryCard icon="check" title={t("Payments Received")} hint={t("Money actually collected on these orders (cash basis).")} value={money(totals.received, hideNumbers, settings)} tone="blue" /> : null}
                    {dashboardVisibility.pending ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.pending.icon} title={t("Outstanding Balance")} hint={t("What customers still owe on orders in this range — cancelled and refunded orders owe nothing.")} value={money(totals.pending, hideNumbers, settings)} tone="orange" /> : null}
                    {dashboardVisibility.cost ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.cost.icon} title={t("Cost")} hint={t("Base cost + extra spending, plus any fee/shipping/VAT cards you have hidden.")} value={money(totals.cost, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.fee ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.fee.icon} title={t("Platform Fee")} value={money(totals.fee, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.shipping ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.shipping.icon} title={t("Shipping")} value={money(totals.shipping, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.tax ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.tax.icon} title={t("VAT Amount")} hint={t("VAT recorded on these orders and set aside — not yet paid to HMRC.")} value={money(totals.tax, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.profit ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.profit.icon} title={t(settings?.corporationTaxEnabled ? "Profit before Corporation Tax" : "Net Profit")} hint={t("Revenue − base cost − extra spending − platform fee − shipping − VAT.")} value={money(totals.netProfit, hideNumbers, settings)} tone="green" /> : null}
                    {dashboardVisibility.profit && settings?.corporationTaxEnabled ? <DashboardSummaryCard icon="plan" title={`${t("Corporation Tax")} (${Math.round(settings.corporationTaxRate ?? 19)}%)`} value={money(totals.corporationTax, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.profit && settings?.corporationTaxEnabled ? <DashboardSummaryCard icon="check" title={t("Profit after CT")} value={money(totals.netProfit - totals.corporationTax, hideNumbers, settings)} tone="green" /> : null}
                  </>
                ) : (
                  <>
                    <DashboardSummaryCard icon="finance" title={t("Received")} value={money(totals.received, hideNumbers, settings)} tone="blue" />
                    <DashboardSummaryCard icon="shippingBox" title={t("Base Cost")} value={money(totals.baseCost, hideNumbers, settings)} tone="red" />
                    <DashboardSummaryCard icon="check" title={t("Basic Balance")} value={money(totals.basicBalance, hideNumbers, settings)} tone="green" />
                  </>
                )}
              </section>

              <BankSpendingCard
                transactions={bankTransactions}
                lastSync={bankLastSync}
                isOwner={canViewBankFeed}
                t={t}
                hideNumbers={hideNumbers}
                localeTag={locale}
              />

              {canSeeAdvancedFinance ? (
                <TaxSetAsideCard
                  orders={countingFinanceOrders}
                  settings={settings}
                  bankTransactions={bankTransactions}
                  isOwner={canViewBankFeed}
                  t={t}
                  hideNumbers={hideNumbers}
                />
              ) : null}

              {canSeeAdvancedFinance ? (
                <section className="card app-card">
                  <CardTitle icon="finance" title={t("Financial Breakdown")} />
                  <div className="financial-breakdown-grid">
                    <div className="financial-breakdown-col">
                      <BreakdownRow label={t("Revenue")} amount={totals.revenue} hideNumbers={hideNumbers} settings={settings} />
                      {/* Visibility line, not part of the reconciliation: money
                          sitting on cancelled/refunded orders in this range,
                          already excluded from every figure above and below. */}
                      {cancelledSummary.count > 0 ? (
                        <BreakdownRow
                          label={`${t("Cancelled or refunded")} (${cancelledSummary.count})`}
                          amount={cancelledSummary.amount}
                          hideNumbers={hideNumbers}
                          settings={settings}
                        />
                      ) : null}
                      {/* Foreign-currency orders stay in the totals numerically
                          but are surfaced here in their own currency, honest
                          and unconverted, until real FX rules exist. */}
                      {foreignCurrencies.map(([code, row]) => (
                        <BreakdownRow
                          key={code}
                          label={`${code} ${t("(not converted)")} (${row.count})`}
                          amount={row.amount}
                          hideNumbers={hideNumbers}
                          settings={settings}
                          valueOverride={hideNumbers ? undefined : `${row.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`}
                        />
                      ))}
                      <BreakdownRow
                        label={`${t("Average order value")} (${filteredCountingOrders.length})`}
                        amount={averageOrderValue}
                        hideNumbers={hideNumbers}
                        settings={settings}
                      />
                      <BreakdownRow label={t("Base Cost")} amount={totals.breakdownBaseCost} negative tone="red" hideNumbers={hideNumbers} settings={settings} />
                      <BreakdownRow label={t("Extra Spending")} amount={totals.expenses} negative tone="red" hideNumbers={hideNumbers} settings={settings} />
                      <BreakdownRow label={t("Platform Fee")} amount={totals.fee} negative tone="red" hideNumbers={hideNumbers} settings={settings} />
                      <BreakdownRow label={t("Shipping")} amount={totals.shipping} negative tone="red" hideNumbers={hideNumbers} settings={settings} />
                    </div>
                    <div className="financial-breakdown-col">
                      <BreakdownRow label={t("VAT Amount")} amount={totals.tax} negative tone="red" hideNumbers={hideNumbers} settings={settings} />
                      {settings?.corporationTaxEnabled ? (
                        <>
                          <BreakdownRow label={t("Profit before Corporation Tax")} amount={totals.netProfit} tone="green" hideNumbers={hideNumbers} settings={settings} />
                          <BreakdownRow label={`${t("Corporation Tax")} (${Math.round(settings.corporationTaxRate ?? 19)}%)`} amount={totals.corporationTax} negative tone="red" hideNumbers={hideNumbers} settings={settings} />
                          <BreakdownRow label={t("Net Profit (after CT)")} amount={totals.netProfit - totals.corporationTax} tone="green" strong hideNumbers={hideNumbers} settings={settings} />
                        </>
                      ) : (
                        <BreakdownRow label={t("Net Profit")} amount={totals.netProfit} tone="green" strong hideNumbers={hideNumbers} settings={settings} />
                      )}
                      <BreakdownRow
                        label={t("New customers")}
                        amount={0}
                        hideNumbers={hideNumbers}
                        settings={settings}
                        valueOverride={hideNumbers ? undefined : String(customerSplit.newCount)}
                      />
                      <BreakdownRow
                        label={t("Returning customers")}
                        amount={0}
                        hideNumbers={hideNumbers}
                        settings={settings}
                        valueOverride={hideNumbers ? undefined : String(customerSplit.returningCount)}
                      />
                      <p className="muted-copy" style={{ margin: "4px 0 0", fontSize: 11.5 }}>
                        {t("New means the customer's first order falls inside this range — counted across all sales channels.")}
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {canSeeAdvancedFinance && (
                <ExtraSpendingSection orders={financeOrders} settings={settings} hideNumbers={hideNumbers} pageRange={range} />
              )}

              <section className="card app-card dashboard-chart-card">
                <CardTitle icon="finance" title={t(canSeeAdvancedFinance ? "Net Profit Analysis" : "Basic Balance Analysis")} />
                <ProfitChart
                  current={currentSeries}
                  previous={canSeeAdvancedFinance && (compareOneYear || compareThreeYears) ? previousYearSeries : []}
                  twoBack={canSeeAdvancedFinance && compareThreeYears ? twoYearsBackSeries : []}
                  threeBack={canSeeAdvancedFinance && compareThreeYears ? threeYearsBackSeries : []}
                  bank={bankSeries}
                  settings={settings}
                  t={t}
                  // Drill-down rides the custom range, which is Pro-only —
                  // same gate as the Custom pill in the range control.
                  onSelectPeriod={canSeeAdvancedFinance ? point => {
                    // Zoom to exactly the clicked bucket: a day point becomes
                    // that single day, a month point that calendar month.
                    // Local date strings via dateInputValue — never
                    // toISOString (the BST day-shift trap).
                    const start = point.start;
                    const end = currentWindow.unit === "month"
                      ? new Date(start.getFullYear(), start.getMonth() + 1, 0)
                      : start;
                    setCustomStart(dateInputValue(start));
                    setCustomEnd(dateInputValue(end));
                    setRange("custom");
                  } : undefined}
                />
                {!canSeeAdvancedFinance ? (
                  <div className="dashboard-chart-locked">
                    <p className="muted-copy">{t("Received minus Base Cost only. Detailed profit and year comparisons are available on Pro.")}</p>
                  </div>
                ) : null}
              </section>

              <section className="card app-card yearly-summary-card">
                <CardTitle icon="calendar" title={t("Year-over-Year Summary")} />
                <div className="yearly-summary-grid">
                  {canSeeAdvancedFinance ? (
                    <>
                      <YearSummary title={t("This Year")} value={money(yearly.current, hideNumbers, settings)} />
                      <YearSummary title={t("Last Year")} value={money(yearly.previous, hideNumbers, settings)} />
                      <YearSummary
                        title={t("Growth")}
                        value={growthDisplay(yearly.growth)}
                        srLabel={growthDirection(yearly.growth) === 0
                          ? undefined
                          : `${Math.abs(yearly.growth).toFixed(1)}% ${growthDirection(yearly.growth) > 0 ? t("up on last year") : t("down on last year")}`}
                        trend={growthDirection(yearly.growth) === 0 ? undefined : growthDirection(yearly.growth) > 0 ? "up" : "down"}
                      />
                    </>
                  ) : (
                    <>
                      <YearSummary title={t("This Year Received")} value={money(yearly.received, hideNumbers, settings)} />
                      <YearSummary title={t("This Year Base Cost")} value={money(yearly.baseCost, hideNumbers, settings)} />
                      <YearSummary title={t("This Year Basic Balance")} value={money(yearly.basicBalance, hideNumbers, settings)} />
                    </>
                  )}
                </div>
              </section>

            </>
          )}

          {showCustomize ? (
            <div className="modal-backdrop dashboard-customize-backdrop" onClick={() => setShowCustomize(false)}>
              <section className="add-order-modal dashboard-customize-modal" onClick={event => event.stopPropagation()}>
                <div className="add-order-header">
                  <CardTitle icon="dashboard" eyebrow={t("Customize")} title={t("Dashboard")} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={isDefaultDashboardLayout}
                      title={t("Show every dashboard card again.")}
                      onClick={() => persistDashboardVisibility(DEFAULT_DASHBOARD_VISIBILITY)}
                    >
                      {t("Reset layout")}
                    </button>
                    <button className="ghost-button" type="button" onClick={() => setShowCustomize(false)}>
                      {t("Close")}
                    </button>
                  </div>
                </div>
                <div className="dashboard-widget-list">
                  {DASHBOARD_WIDGET_ROWS.map(row => (
                    <label className="dashboard-widget-row" key={row.key} data-tone={row.tone}>
                      <span className="dashboard-widget-icon" aria-hidden="true">
                        <CardIconGlyph icon={row.icon} />
                      </span>
                      <span>{row.key === "revenue" ? t(revenueCardTitle) : t(row.title)}</span>
                      <input
                        checked={dashboardVisibility[row.key]}
                        type="checkbox"
                        onChange={event => updateDashboardVisibility(row.key, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
                {customizeStatus ? <p className="settings-status">{customizeStatus}</p> : null}
                {customizeError ? <p className="layout-error">{customizeError}</p> : null}
              </section>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

// Bank Activity card — fed by the page-level Open Banking subscription.
// Two stat tiles with sparklines + a recent-activity list, matching the
// finance-app style the owner asked for. Renders nothing without data.
function BankSparkline({ values, color, height = 46 }: { values: number[]; color: string; height?: number }) {
  const W = 220;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? W / 2 : (index / (values.length - 1)) * W;
    const y = height - 4 - (value / max) * (height - 10);
    return `${x},${y}`;
  });
  const area = `0,${height} ${points.join(" ")} ${W},${height}`;
  const gradientId = `bank-spark-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height }} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BankSpendingCard({ transactions, lastSync, isOwner, t, hideNumbers, localeTag }: {
  transactions: BankTx[];
  lastSync: Date | null;
  isOwner: boolean;
  t: (text: string) => string;
  hideNumbers: boolean;
  localeTag: string;
}) {
  const summary = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const thisPrefix = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthDate = new Date(year, now.getMonth() - 1, 1);
    const lastPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const spendIn = (prefix: string) => transactions
      .filter(item => item.amount < 0 && item.bookingDate.startsWith(prefix))
      .reduce((acc, item) => acc + Math.abs(item.amount), 0);
    const incomeIn = (prefix: string) => transactions
      .filter(item => item.amount > 0 && item.bookingDate.startsWith(prefix))
      .reduce((acc, item) => acc + item.amount, 0);
    // Monthly incoming curve for this year (money in).
    const incomingMonthly = Array.from({ length: 12 }, () => 0);
    for (const item of transactions) {
      if (item.amount <= 0 || !item.bookingDate.startsWith(String(year))) continue;
      const month = Number(item.bookingDate.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) incomingMonthly[month] += item.amount;
    }

    // Daily spending curve for this month + monthly curve for this year.
    const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    const daily = Array.from({ length: daysInMonth }, () => 0);
    const monthly = Array.from({ length: 12 }, () => 0);
    for (const item of transactions) {
      if (item.amount >= 0 || !item.bookingDate.startsWith(String(year))) continue;
      const month = Number(item.bookingDate.slice(5, 7)) - 1;
      if (month >= 0 && month < 12) monthly[month] += Math.abs(item.amount);
      if (item.bookingDate.startsWith(thisPrefix)) {
        const day = Number(item.bookingDate.slice(8, 10)) - 1;
        if (day >= 0 && day < daysInMonth) daily[day] += Math.abs(item.amount);
      }
    }
    const monthsWithData = monthly.filter((value, index) => value > 0 || index <= now.getMonth()).length || 1;
    const yearTotal = monthly.reduce((acc, value) => acc + value, 0);
    return {
      thisMonth: spendIn(thisPrefix),
      lastMonth: spendIn(lastPrefix),
      yearTotal,
      monthlyAvg: yearTotal / monthsWithData,
      daily: daily.slice(0, Math.max(now.getDate(), 2)),
      monthly: monthly.slice(0, now.getMonth() + 1),
      recent: transactions.slice(0, 3),
      incomingThisMonth: incomeIn(thisPrefix),
      incomingLastMonth: incomeIn(lastPrefix),
      incomingYear: incomingMonthly.reduce((acc, value) => acc + value, 0),
      incomingMonthly: incomingMonthly.slice(0, now.getMonth() + 1),
      incomingCountThisMonth: transactions.filter(item => item.amount > 0 && item.bookingDate.startsWith(thisPrefix)).length
    };
  }, [transactions]);

  const fixedMonthly = useMemo(() => monthlyFixedTotal(detectRecurringSpends(transactions)), [transactions]);

  if (!isOwner || transactions.length === 0) return null;

  const currency = transactions[0]?.currency || "GBP";
  const bankMoney = (value: number, digits = 2) => hideNumbers
    ? hiddenMoneyLabel()
    : new Intl.NumberFormat(localeTag, { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  const delta = summary.lastMonth > 0 ? ((summary.thisMonth - summary.lastMonth) / summary.lastMonth) * 100 : null;
  const incomingDelta = summary.incomingLastMonth > 0 ? ((summary.incomingThisMonth - summary.incomingLastMonth) / summary.incomingLastMonth) * 100 : null;
  const syncedRecently = lastSync !== null && Date.now() - lastSync.getTime() < 12 * 60 * 60 * 1000;
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0] ?? "").join("").toUpperCase() || "•";
  const tileStyle: React.CSSProperties = { flex: "1 1 220px", maxWidth: 320, border: "1px solid rgba(120,120,140,0.18)", borderRadius: 12, padding: "14px 16px 8px" };

  return (
    <section className="card app-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 10, background: "rgba(37,99,235,0.1)", fontSize: 16 }}>🏦</span>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{t("Bank Activity")}</h2>
        {lastSync ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, opacity: 0.75 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: syncedRecently ? "#16a34a" : "#f59e0b", display: "inline-block" }} />
            {syncedRecently
              ? `${t("Synced")} · ${t("Updated recently")}`
              : `${t("Last synced")} ${formatSyncAge(Date.now() - lastSync.getTime(), t)}`}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <a href="/bank" style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>{t("View all")} →</a>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={tileStyle}>
          <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }} title={t("Total money out of the bank this calendar month.")}>{t("Spent this month")}</p>
          <strong style={{ fontSize: 27, fontVariantNumeric: "tabular-nums", display: "block", margin: "2px 0" }}>{bankMoney(summary.thisMonth)}</strong>
          {delta !== null ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: delta <= 0 ? "#16a34a" : "#dc2626" }}>
              {delta <= 0 ? "↓" : "↑"} {Math.abs(delta).toFixed(0)}% {t("vs last month")}
            </span>
          ) : <span style={{ fontSize: 12, opacity: 0.6 }}>{t("First month of data")}</span>}
          {fixedMonthly > 0 ? (
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#b45309", marginTop: 2 }}>
              ↻ {t("Fixed")} ≈ {bankMoney(fixedMonthly, 0)} / {t("month")}
            </span>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <BankSparkline values={summary.daily} color="#16a34a" />
          </div>
        </div>
        <div style={tileStyle}>
          <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }} title={t("Total money out of the bank this calendar year.")}>{t("Spent this year")}</p>
          <strong style={{ fontSize: 27, fontVariantNumeric: "tabular-nums", display: "block", margin: "2px 0" }}>{bankMoney(summary.yearTotal)}</strong>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{t("Avg.")} {bankMoney(summary.monthlyAvg, 0)} / {t("month")}</span>
          <div style={{ marginTop: 8 }}>
            <BankSparkline values={summary.monthly.length > 1 ? summary.monthly : [0, summary.yearTotal]} color="#2563eb" />
          </div>
        </div>
        <div style={{ ...tileStyle, borderColor: "rgba(22,163,74,0.35)" }}>
          <p className="muted-copy" style={{ margin: 0, fontSize: 12.5, color: "#16a34a", fontWeight: 700 }}>↗ {t("Incoming")} · {t("This Month")}</p>
          <strong style={{ fontSize: 27, fontVariantNumeric: "tabular-nums", display: "block", margin: "2px 0", color: "#16a34a" }}>+{bankMoney(summary.incomingThisMonth)}</strong>
          {incomingDelta !== null ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: incomingDelta >= 0 ? "#16a34a" : "#dc2626" }}>
              {incomingDelta >= 0 ? "↑" : "↓"} {Math.abs(incomingDelta).toFixed(0)}% {t("vs last month")}
            </span>
          ) : <span style={{ fontSize: 12, opacity: 0.6 }}>{summary.incomingCountThisMonth} {t("payments received")}</span>}
          <span style={{ display: "block", fontSize: 11.5, opacity: 0.7, marginTop: 2 }}>{t("This Year")}: {bankMoney(summary.incomingYear, 0)}</span>
          <div style={{ marginTop: 8 }}>
            <BankSparkline values={summary.incomingMonthly.length > 1 ? summary.incomingMonthly : [0, summary.incomingYear]} color="#16a34a" />
          </div>
          <a href="/bank?flow=in" style={{ display: "inline-block", marginTop: 6, fontSize: 12, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>{t("View all incoming")} →</a>
        </div>
        <div style={{ flex: "2 1 300px", minWidth: 260 }}>
          <p className="muted-copy" style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700 }}>{t("Recent activity")}</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {summary.recent.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: "1px solid rgba(120,120,140,0.14)" }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(120,120,140,0.13)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                  {initials(item.counterparty || item.description)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.counterparty || item.description || "—"}</div>
                  {item.counterparty && item.description ? (
                    <div style={{ fontSize: 11.5, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                  ) : null}
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: item.amount < 0 ? "#dc2626" : "#16a34a", whiteSpace: "nowrap" }}>
                  {item.amount < 0 ? "−" : "+"}{bankMoney(Math.abs(item.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Tax set-aside — built from the SAME per-order figures the dashboard already
// aggregates (order taxAmount = output VAT, plus the Corporation Tax estimate
// from workspace settings), minus the reclaimable input VAT found in the bank
// feed's VAT treatments — not a rough percentage of bank inflows. Bank
// payments the owner categorised as "Tax" count as already paid.
function TaxSetAsideCard({ orders, settings, bankTransactions, isOwner, t, hideNumbers }: {
  orders: DashboardFinanceOrder[];
  settings: WorkspaceSettingsOverview | null;
  bankTransactions: BankTx[];
  isOwner: boolean;
  t: (text: string) => string;
  hideNumbers: boolean;
}) {
  const summary = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const ctEnabled = settings?.corporationTaxEnabled === true;
    const ctRate = settings?.corporationTaxRate ?? 19;

    let vatYtd = 0;
    let ctYtd = 0;
    let vatMonth = 0;
    let ctMonth = 0;
    for (const order of orders) {
      if (!order.paymentDate || order.paymentDate.getFullYear() !== year) continue;
      const ct = ctEnabled ? Math.round(Math.max(0, adjustedDashboardNetProfit(order, settings)) * ctRate) / 100 : 0;
      vatYtd += order.taxAmount;
      ctYtd += ct;
      if (order.paymentDate.getMonth() === month) {
        vatMonth += order.taxAmount;
        ctMonth += ct;
      }
    }

    // Input VAT: reclaimable VAT sitting inside outgoing bank payments whose
    // treatment (vatCode, else vatCodeAuto; split lines per line) is Standard
    // or Reduced rate — extracted from the gross with the same VAT-inclusive
    // maths invoices use. Reclaimed on the return, so it reduces what must be
    // set aside. No bank feed data → 0 → the card behaves exactly as before.
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    let inputVatYtd = 0;
    let inputVatMonth = 0;
    for (const item of bankTransactions) {
      if (item.amount >= 0 || !item.bookingDate.startsWith(String(year))) continue;
      const reclaim = reclaimableVatForTx(item);
      if (reclaim <= 0) continue;
      inputVatYtd += reclaim;
      if (item.bookingDate.startsWith(monthPrefix)) inputVatMonth += reclaim;
    }
    const netVatYtd = Math.max(0, vatYtd - inputVatYtd);
    const netVatMonth = Math.max(0, vatMonth - inputVatMonth);

    const paidYtd = bankTransactions
      .filter(item => item.amount < 0
        && item.bookingDate.startsWith(String(year))
        && (item.category || item.categoryAuto) === "Tax")
      .reduce((acc, item) => acc + Math.abs(item.amount), 0);

    return {
      vatYtd,
      inputVatYtd,
      netVatYtd,
      ctYtd,
      totalYtd: netVatYtd + ctYtd,
      monthTotal: netVatMonth + ctMonth,
      paidYtd,
      ctEnabled,
      ctRate
    };
  }, [orders, settings, bankTransactions]);

  // Keyed off the gross figures, not the netted total: a year whose output VAT
  // is fully covered by reclaimable input VAT should still show the card (with
  // £0 to set aside), while a workspace with no VAT at all still hides it.
  if (summary.vatYtd + summary.ctYtd <= 0.005) return null;

  const remaining = Math.max(0, summary.totalYtd - summary.paidYtd);
  const paidShare = summary.totalYtd > 0 ? Math.min(100, (summary.paidYtd / summary.totalYtd) * 100) : 0;
  const showMoney = (value: number) => money(value, hideNumbers, settings);
  const hasInputVat = summary.inputVatYtd > 0.005;

  return (
    <section className="card app-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 10, background: "rgba(180,83,9,0.12)", fontSize: 16 }}>🏛</span>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{t("Tax set-aside")}</h2>
        <span style={{ fontSize: 11.5, opacity: 0.65 }}>{t("Keep this money apart — it already belongs to the tax office.")}</span>
      </div>
      <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          {/* Both sums above key off getFullYear(), so say "calendar year" out
              loud — owners think in tax years and would misread a bare "year". */}
          <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }} title={t("Counted over the calendar year (1 January – 31 December), not the tax year.")}>{t("Set aside this calendar year")}</p>
          <strong
            style={{ fontSize: 26, fontVariantNumeric: "tabular-nums", display: "block", margin: "2px 0" }}
            title={hasInputVat ? t("Net VAT (VAT collected minus reclaimable VAT on spending, never below zero) plus Corporation Tax.") : undefined}
          >
            {showMoney(summary.totalYtd)}
          </strong>
          <span style={{ fontSize: 11.5, opacity: 0.7 }}>
            {hasInputVat ? (
              <>
                {t("VAT collected")}: {showMoney(summary.vatYtd)}
                {" · "}
                <span title={t("Reclaimable VAT inside outgoing bank payments marked Standard rate (20%) or Reduced rate (5%), including split lines.")}>
                  {t("VAT on spending")}: {hideNumbers ? "" : "−"}{showMoney(summary.inputVatYtd)}
                </span>
                {" · "}{t("Net VAT")}: {showMoney(summary.netVatYtd)}
              </>
            ) : (
              <>{t("VAT Amount")}: {showMoney(summary.vatYtd)}</>
            )}
            {summary.ctEnabled ? <> · {t("Corporation Tax")} ({Math.round(summary.ctRate)}%): {showMoney(summary.ctYtd)}</> : null}
          </span>
        </div>
        <div>
          <p className="muted-copy" style={{ margin: 0, fontSize: 12.5 }}>{t("This Month")}</p>
          <strong style={{ fontSize: 26, fontVariantNumeric: "tabular-nums", display: "block", margin: "2px 0" }}>{showMoney(summary.monthTotal)}</strong>
        </div>
        {isOwner ? (
          <div style={{ flex: "1 1 240px", minWidth: 220 }}>
            <p className="muted-copy" style={{ margin: "0 0 4px", fontSize: 12.5 }}>
              {t("Paid from the bank")} <span style={{ opacity: 0.6 }}>({t("transactions categorised as Tax")})</span>
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ fontSize: 17, fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>{showMoney(summary.paidYtd)}</strong>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: remaining > 0.005 ? "#b45309" : "#16a34a" }}>
                {remaining > 0.005 ? `${t("Still to hold")}: ${showMoney(remaining)}` : t("Fully covered")}
              </span>
            </div>
            <div style={{ marginTop: 7, height: 7, borderRadius: 999, background: "rgba(120,120,140,0.16)", overflow: "hidden" }}>
              <div style={{ width: `${paidShare}%`, height: "100%", borderRadius: 999, background: "#16a34a", transition: "width 0.25s ease" }} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DashboardSummaryCard({ icon, title, value, tone, locked = false, hint, sub }: { icon: CardIcon; title: string; value: string; tone: "blue" | "green" | "orange" | "red"; locked?: boolean; hint?: string; sub?: string }) {
  return (
    // The report's trust rule: every money figure explains itself on hover.
    <article className={locked ? "dashboard-summary-card is-locked" : "dashboard-summary-card"} data-tone={tone} title={hint}>
      <div className="summary-icon" aria-hidden="true"><CardIconGlyph icon={icon} /></div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        {sub ? <span className="dashboard-summary-sub">{sub}</span> : null}
      </div>
    </article>
  );
}

// Four-day-old bank data saying only "Synced" is how trust dies quietly; say
// the age out loud once it is no longer fresh.
function formatSyncAge(ms: number, t: (text: string) => string) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 48) return `${hours} ${t("hours ago")}`;
  return `${Math.floor(hours / 24)} ${t("days ago")}`;
}

// Rounded to one decimal for display, so direction is read off the rounded
// figure: a change too small to print must not draw an arrow.
function growthDirection(growth: number): -1 | 0 | 1 {
  const rounded = Number(growth.toFixed(1));
  if (rounded > 0) return 1;
  if (rounded < 0) return -1;
  return 0;
}

function growthDisplay(growth: number) {
  const magnitude = `${Math.abs(growth).toFixed(1)}%`;
  const direction = growthDirection(growth);
  if (direction === 0) return magnitude;
  return `${direction > 0 ? "\u2191 +" : "\u2193 \u2212"}${magnitude}`;
}

function YearSummary({ title, value, trend, srLabel }: { title: string; value: string; trend?: "up" | "down"; srLabel?: string }) {
  return (
    <article className="year-summary-item">
      <span>{title}</span>
      <strong className={trend ? `trend-${trend}` : ""} aria-label={srLabel}>{value}</strong>
    </article>
  );
}

function pointsForSeries(
  series: ChartPoint[],
  min: number,
  max: number,
  padX = 20,
  padY = 18,
  width = 640,
  height = 240,
  padXRight = padX
) {
  if (series.length === 0) return "";
  const range = max - min || 1;
  return series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : padX + (index / (series.length - 1)) * (width - padX - padXRight);
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return `${x},${y}`;
  }).join(" ");
}

function ProfitChart({
  current,
  previous,
  twoBack,
  threeBack,
  bank = [],
  settings,
  t,
  onSelectPeriod
}: {
  current: ChartPoint[];
  previous: ChartPoint[];
  twoBack: ChartPoint[];
  threeBack: ChartPoint[];
  bank?: ChartPoint[];
  settings: StudioMoneySettings;
  t: (text: string) => string;
  /** Drill-down: called with the clicked point of the current series. */
  onSelectPeriod?: (point: ChartPoint) => void;
}) {
  const allValues = [...current, ...previous, ...twoBack, ...threeBack, ...bank].map(point => point.value);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);

  if (current.length === 0) {
    return <div className="dashboard-chart-empty">{t("No data available.")}</div>;
  }

  const symbol = moneySymbol(settings);
  // Tooltip figures use the workspace money format (currency symbol + decimal
  // separator), not the browser locale, so they match the KPI cards exactly.
  const tooltipMoney = (value: number) => formatStudioMoney(value, settings);
  // Nice y-axis ticks: 4 evenly spaced levels including 0 and max-rounded
  const niceMax = niceCeil(max);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  // Dynamic width matched to container so text/dots stay proportional
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(640);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setW(el.clientWidth || 640);
    const ro = new ResizeObserver(() => setW(el.clientWidth || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 328;
  const padXLeft = 8;
  const padXRight = 56; // room for y-axis labels on the right
  const padX = padXLeft;
  const padY = 18;
  // X-axis labels: show every 3rd point (Jan / Apr / Jul / Oct / next Jan-ish)
  const xLabelIndices = current.length > 1
    ? Array.from(new Set([0, ...current.map((_, i) => i).filter((i) => i % Math.max(1, Math.floor(current.length / 4)) === 0), current.length - 1]))
    : [0];

  function yForValue(v: number) {
    const range = niceMax - 0 || 1;
    return H - padY - ((v - 0) / range) * (H - padY * 2);
  }
  function xForIndex(i: number) {
    return current.length === 1 ? W / 2 : padXLeft + (i / (current.length - 1)) * (W - padXLeft - padXRight);
  }

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null);

  function indexForClientX(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    if (current.length <= 1) return 0;
    const usable = W - padXLeft - padXRight;
    const rel = Math.max(0, Math.min(usable, svgX - padXLeft));
    return Math.round((rel / usable) * (current.length - 1));
  }

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setHoverPx({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setHoverIdx(indexForClientX(e.clientX));
  }

  // Drill-down: a click zooms the whole dashboard to the clicked bucket.
  // Index comes from the click position itself (not hover state), so taps on
  // touch screens work without a preceding mousemove.
  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onSelectPeriod) return;
    const idx = indexForClientX(e.clientX);
    if (idx != null && current[idx]) onSelectPeriod(current[idx]);
  }

  return (
    <div className="dashboard-chart" ref={containerRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H + 22}`}
        role="img"
        aria-label={onSelectPeriod
          ? t("Net profit chart. Click a point to zoom the dashboard to that period.")
          : t("Net profit chart")}
        onMouseMove={handleMove}
        onMouseLeave={() => { setHoverIdx(null); setHoverPx(null); }}
        onClick={handleClick}
        style={{ cursor: onSelectPeriod ? "pointer" : "crosshair", width: "100%", height: 350 }}
      >
        {/* gridlines + Y labels */}
        {yTicks.map((tick, idx) => {
          const y = yForValue(tick);
          return (
            <g key={idx}>
              <line x1={padXLeft} x2={W - 8} y1={y} y2={y} />
              <text x={W - 4} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7280" fontWeight="700">
                {formatAxisCurrency(tick, symbol)}
              </text>
            </g>
          );
        })}
        {/* lines */}
        <polyline className="chart-line current" points={pointsForSeries(current, 0, niceMax, padXLeft, padY, W, H, padXRight)} />
        {previous.length ? <polyline className="chart-line previous" points={pointsForSeries(previous, 0, niceMax, padXLeft, padY, W, H, padXRight)} /> : null}
        {twoBack.length ? <polyline className="chart-line two-back" points={pointsForSeries(twoBack, 0, niceMax, padXLeft, padY, W, H, padXRight)} /> : null}
        {threeBack.length ? <polyline className="chart-line three-back" points={pointsForSeries(threeBack, 0, niceMax, padXLeft, padY, W, H, padXRight)} /> : null}
        {bank.length ? <polyline points={pointsForSeries(bank, 0, niceMax, padXLeft, padY, W, H, padXRight)} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {/* data point dots on current line */}
        {current.map((point, i) => (
          <circle key={i} cx={xForIndex(i)} cy={yForValue(point.value)} r={4} fill="#16a34a" />
        ))}
        {/* X-axis labels */}
        {xLabelIndices.map((i) => (
          <text key={i} x={xForIndex(i)} y={H + 16} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="700">
            {current[i]?.label}
          </text>
        ))}
        {/* Hover indicator */}
        {hoverIdx != null && current[hoverIdx] && (
          <g>
            <line
              x1={xForIndex(hoverIdx)}
              x2={xForIndex(hoverIdx)}
              y1={padY}
              y2={H - padY}
              stroke="#9ca3af"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {previous[hoverIdx] ? (
              <circle cx={xForIndex(hoverIdx)} cy={yForValue(previous[hoverIdx].value)} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
            ) : null}
            {twoBack[hoverIdx] ? (
              <circle cx={xForIndex(hoverIdx)} cy={yForValue(twoBack[hoverIdx].value)} r={5} fill="#7c3aed" stroke="#fff" strokeWidth={2} />
            ) : null}
            {threeBack[hoverIdx] ? (
              <circle cx={xForIndex(hoverIdx)} cy={yForValue(threeBack[hoverIdx].value)} r={5} fill="#6b7280" stroke="#fff" strokeWidth={2} />
            ) : null}
            {bank[hoverIdx] ? (
              <circle cx={xForIndex(hoverIdx)} cy={yForValue(bank[hoverIdx].value)} r={5} fill="#dc2626" stroke="#fff" strokeWidth={2} />
            ) : null}
            <circle cx={xForIndex(hoverIdx)} cy={yForValue(current[hoverIdx].value)} r={6} fill="#16a34a" stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hoverIdx != null && current[hoverIdx] && hoverPx && (
        <div
          className="dashboard-chart-tooltip"
          style={{
            left: hoverPx.x > W - 190 ? `${hoverPx.x - 14}px` : `${hoverPx.x + 14}px`,
            top: `${hoverPx.y + 14}px`,
            // Flip to the left of the cursor near the right edge so the
            // breakdown never gets clipped by the card boundary.
            transform: hoverPx.x > W - 190 ? "translateX(-100%)" : "none",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280" }}>{current[hoverIdx].label}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#16a34a", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#16a34a" }} />
            {t("Net")}: {tooltipMoney(current[hoverIdx].value)}
          </div>
          {bank[hoverIdx] ? (
            <div style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "#dc2626" }} />
              {t("Bank")}: {tooltipMoney(bank[hoverIdx].value)}
            </div>
          ) : null}
          {previous[hoverIdx] ? (
            <div style={{ fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "#f59e0b" }} />
              {t("-1 Yr")}: {tooltipMoney(previous[hoverIdx].value)}
            </div>
          ) : null}
          {twoBack[hoverIdx] ? (
            <div style={{ fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "#7c3aed" }} />
              {t("-2 Yrs")}: {tooltipMoney(twoBack[hoverIdx].value)}
            </div>
          ) : null}
          {threeBack[hoverIdx] ? (
            <div style={{ fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "#6b7280" }} />
              {t("-3 Yrs")}: {tooltipMoney(threeBack[hoverIdx].value)}
            </div>
          ) : null}
        </div>
      )}
      <div className="dashboard-chart-legend">
        <span><i className="legend-current" /> {t("Current")}</span>
        {bank.length ? <span><i style={{ background: "#dc2626" }} /> {t("Bank")}</span> : null}
        {previous.length ? <span><i className="legend-previous" /> {t("-1 Yr")}</span> : null}
        {twoBack.length ? <span><i className="legend-two" /> {t("-2 Yrs")}</span> : null}
        {threeBack.length ? <span><i className="legend-three" /> {t("-3 Yrs")}</span> : null}
      </div>
    </div>
  );
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return niceNorm * pow;
}

function formatAxisCurrency(value: number, symbol: string): string {
  if (value === 0) return `${symbol}0`;
  if (Math.abs(value) >= 1000) {
    return `${symbol}${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  }
  return `${symbol}${Math.round(value)}`;
}

type SpendingScope = "thisMonth" | "thisYear" | "customRange" | "allTime";

type ExtraSpendingEntry = {
  orderId: string;
  customerName: string;
  designName: string;
  watchRef: string;
  heading: string;
  description: string;
  amount: number;
  paymentDate: Date | null;
};

type ExtraSpendingGroup = {
  orderId: string;
  title: string;
  subtitle: string;
  entries: ExtraSpendingEntry[];
  total: number;
};

function parseCustomExpenseTitles(json: string): string[] {
  if (!json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const title = obj.title ?? obj.name ?? obj.label;
            return typeof title === "string" ? title : "";
          }
          return "";
        })
        .filter(t => t.length > 0);
    }
  } catch {
    // ignore
  }
  return [];
}

function ExtraSpendingSection({
  orders,
  settings,
  hideNumbers,
  pageRange,
}: {
  orders: DashboardFinanceOrder[];
  settings: WorkspaceSettingsOverview | null;
  hideNumbers: boolean;
  /** The dashboard's active range — this section follows it by default so the
   * two never silently show different periods (the report's §15). */
  pageRange?: RangeKey;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<SpendingScope>("thisMonth");

  useEffect(() => {
    if (!pageRange) return;
    if (pageRange === "week" || pageRange === "month") setScope("thisMonth");
    else if (pageRange === "year") setScope("thisYear");
    else if (pageRange === "all") setScope("allTime");
    // "custom" keeps whatever the section itself has — its own picker wins.
  }, [pageRange]);
  const [customStart, setCustomStart] = useState(dateInputValue(startOfMonth(new Date())));
  const [customEnd, setCustomEnd] = useState(dateInputValue(new Date()));
  const [incBase, setIncBase] = useState(true);
  const [incShipping, setIncShipping] = useState(true);
  const [incFee, setIncFee] = useState(true);
  const [incTax, setIncTax] = useState(true);
  const [page, setPage] = useState(0);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const pageSize = isPhone ? 12 : 20;

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (scope === "thisMonth") return { start: startOfMonth(now), end: endOfDay(now) };
    if (scope === "thisYear") return { start: startOfYear(now), end: endOfDay(now) };
    if (scope === "customRange") {
      return {
        start: startOfDay(parseInputDate(customStart, startOfMonth(now))),
        end: endOfDay(parseInputDate(customEnd, now)),
      };
    }
    return { start: new Date(0), end: endOfDay(now) };
  }, [scope, customStart, customEnd]);

  const customTitles = useMemo(
    () => parseCustomExpenseTitles(settings?.financialExpenseItemsJSON ?? ""),
    [settings?.financialExpenseItemsJSON]
  );

  const filteredOrders = useMemo(
    () => orders.filter(o => o.paymentDate && o.paymentDate >= start && o.paymentDate <= end),
    [orders, start, end]
  );

  const groups: ExtraSpendingGroup[] = useMemo(() => {
    const out: ExtraSpendingGroup[] = [];
    for (const o of filteredOrders) {
      const entries: ExtraSpendingEntry[] = [];
      const push = (heading: string, description: string, amount: number) => {
        if (amount > 0) {
          entries.push({
            orderId: o.id,
            customerName: o.customerName,
            designName: o.designName,
            watchRef: o.watchRef,
            heading,
            description,
            amount,
            paymentDate: o.paymentDate,
          });
        }
      };
      if (incBase) push(t("Base Cost"), t("Purchase price"), o.watchPurchasePrice);
      if (incShipping) push(t("Shipping"), t("Delivery cost"), o.deliveryCost);
      if (incFee) push(t("Platform Fee"), t("Payment fee"), o.paymentFee);
      if (incTax) push(t("Tax"), t("VAT / Tax"), o.taxAmount);
      // Per-order spending headings (this order's own list, else workspace template).
      const orderExpenseRaw = (o.customFields["orderExpenseItemsJSON"] ?? "").trim();
      const titlesForOrder = orderExpenseRaw ? parseCustomExpenseTitles(orderExpenseRaw) : customTitles;
      for (const title of titlesForOrder) {
        const raw = o.customFields[`financialExpense::${title}`];
        const amount = raw ? parseFloat(raw.replace(/,/g, "")) : 0;
        if (!Number.isNaN(amount) && amount > 0) {
          push(title, t("Custom expense"), amount);
        }
      }
      if (entries.length > 0) {
        const total = entries.reduce((s, e) => s + e.amount, 0);
        const subtitleParts = [o.customerName, o.designName, o.watchRef].filter(p => p && p.length > 0);
        out.push({
          orderId: o.id,
          title: o.customerName || o.designName || `#${o.id.slice(0, 6)}`,
          subtitle: subtitleParts.slice(1).join(" · "),
          entries,
          total,
        });
      }
    }
    return out.sort((a, b) => b.total - a.total);
  }, [filteredOrders, incBase, incShipping, incFee, incTax, customTitles, t]);

  const totalAmount = useMemo(() => groups.reduce((s, g) => s + g.total, 0), [groups]);
  const entryCount = useMemo(() => groups.reduce((s, g) => s + g.entries.length, 0), [groups]);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageGroups = groups.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  useEffect(() => {
    setPage(0);
  }, [scope, incBase, incShipping, incFee, incTax, customStart, customEnd]);

  const exportCsv = () => {
    const rows = [["Order", "Customer", "Design", "Ref", "Heading", "Description", "Date", "Amount"]];
    for (const g of groups) {
      for (const e of g.entries) {
        rows.push([
          e.orderId,
          e.customerName,
          e.designName,
          e.watchRef,
          e.heading,
          e.description,
          // Local calendar date — toISOString shifts the day around midnight in BST.
          e.paymentDate ? dateInputValue(e.paymentDate) : "",
          e.amount.toFixed(2),
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Name the file after the range it covers, not the day it was clicked.
    const rangeSlug = scope === "thisMonth" ? "this-month"
      : scope === "thisYear" ? "this-year"
      : scope === "allTime" ? "all-time"
      : `${dateInputValue(start)}_${dateInputValue(end)}`;
    a.download = `extra-spending-${rangeSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const compactCard = (
    <button type="button" className="extra-spending-compact" onClick={() => setExpanded(true)}>
      <span className="extra-spending-compact-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </span>
      <span className="extra-spending-compact-text">
        <span className="extra-spending-compact-title">{t("Extra Spending Summary")}</span>
        <span className="extra-spending-compact-subtitle">
          {t("Open a detailed page for monthly, yearly and order-based extra spending with descriptions.")}
        </span>
      </span>
      <span className="extra-spending-compact-meta">
        <span className="extra-spending-compact-amount">{money(totalAmount, hideNumbers, settings)}</span>
        <span className="extra-spending-compact-count">{entryCount} {t("entries")}</span>
      </span>
      <span className="extra-spending-compact-chevron" aria-hidden="true">›</span>
    </button>
  );

  if (!expanded) return compactCard;

  return (
    <>
      {compactCard}
      <div className="modal-backdrop extra-spending-backdrop" onClick={() => setExpanded(false)}>
        <section className="extra-spending-modal" onClick={e => e.stopPropagation()}>
      <div className="extra-spending-header">
        <CardTitle icon="finance" eyebrow={t("Spending")} title={t("Extra Spending Summary")} />
        <div className="extra-spending-header-actions">
          <button className="ghost-button" type="button" onClick={exportCsv}>
            {t("Export CSV")}
          </button>
          <button className="ghost-button" type="button" onClick={() => setExpanded(false)}>
            {t("Close")}
          </button>
        </div>
      </div>

      <div className="segmented-control" role="tablist" aria-label={t("Spending scope")}>
        {([
          ["thisMonth", t("This Month")],
          ["thisYear", t("This Year")],
          ["customRange", t("Custom Range")],
          ["allTime", t("All Time")],
        ] as Array<[SpendingScope, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={scope === key ? "is-active" : ""}
            onClick={() => setScope(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {scope === "customRange" && (
        <div className="dashboard-range-fields">
          <label className="dashboard-range-field">
            {t("From")}
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
          </label>
          <label className="dashboard-range-field">
            {t("To")}
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </label>
        </div>
      )}

      <div className="extra-spending-toggles">
        <label><input type="checkbox" checked={incBase} onChange={e => setIncBase(e.target.checked)} /> {t("Base Cost")}</label>
        <label><input type="checkbox" checked={incShipping} onChange={e => setIncShipping(e.target.checked)} /> {t("Shipping")}</label>
        <label><input type="checkbox" checked={incFee} onChange={e => setIncFee(e.target.checked)} /> {t("Platform Fee")}</label>
        <label><input type="checkbox" checked={incTax} onChange={e => setIncTax(e.target.checked)} /> {t("VAT / Tax")}</label>
      </div>

      <div className="extra-spending-metrics">
        <div className="extra-spending-metric">
          <p className="muted-copy">{t("Total")}</p>
          <p className="extra-spending-amount">{money(totalAmount, hideNumbers, settings)}</p>
        </div>
        <div className="extra-spending-metric">
          <p className="muted-copy">{t("Orders")}</p>
          <p className="extra-spending-amount">{groups.length}</p>
        </div>
        <div className="extra-spending-metric">
          <p className="muted-copy">{t("Entries")}</p>
          <p className="extra-spending-amount">{entryCount}</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="muted-copy" style={{ padding: "24px 0", textAlign: "center" }}>
          {t("No extra spending in this period.")}
        </p>
      ) : (
        <>
          <div className="extra-spending-groups">
            {pageGroups.map(g => (
              <div className="extra-spending-group" key={g.orderId}>
                <div className="extra-spending-group-header">
                  <div>
                    <p className="extra-spending-group-title">{g.title}</p>
                    {g.subtitle ? <p className="muted-copy">{g.subtitle}</p> : null}
                  </div>
                  <p className="extra-spending-group-total">{money(g.total, hideNumbers, settings)}</p>
                </div>
                <ul className="extra-spending-entries">
                  {g.entries.map((e, i) => (
                    <li key={i} className="extra-spending-entry">
                      <div>
                        <span className="extra-spending-entry-heading">{t(e.heading)}</span>
                        <span className="muted-copy"> · {t(e.description)}</span>
                        {e.paymentDate ? (
                          <span className="muted-copy"> · {e.paymentDate.toLocaleDateString(locale)}</span>
                        ) : null}
                      </div>
                      <span>{money(e.amount, hideNumbers, settings)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="extra-spending-pagination">
              <button
                className="ghost-button"
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                {t("Previous")}
              </button>
              <span className="muted-copy">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              >
                {t("Next")}
              </button>
            </div>
          )}
        </>
      )}
        </section>
      </div>
    </>
  );
}
