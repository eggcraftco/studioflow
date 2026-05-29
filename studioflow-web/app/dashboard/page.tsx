"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
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
  customPendingTotal,
  dashboardCostTotal
} from "@/lib/studioflow/finance";
import { studioT } from "@/lib/studioflow/language";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";
import { saveDashboardWidgetVisibility } from "@/lib/studioflow/settingsActions";

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
};

type ChartPoint = {
  label: string;
  value: number;
};

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
  profit: true
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
  { key: "tax", title: "Tax Amount", glyph: "▦", icon: "plan", tone: "red" },
  { key: "profit", title: "Net Profit", glyph: "✓", icon: "check", tone: "green" }
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
    profit: boolSetting(mapValue.profit, boolSetting(data.dashShowProfit, true))
  };
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
    revenue: totals.revenue + order.paidAmount + order.remainingAmount,
    pending: totals.pending + order.remainingAmount + customPendingTotal(order, settings),
    cost: totals.cost + dashboardCostTotal(order, settings, {
      showFee: visibility.fee,
      showShipping: visibility.shipping,
      showTax: visibility.tax
    }),
    fee: totals.fee + order.paymentFee,
    shipping: totals.shipping + order.deliveryCost,
    tax: totals.tax + order.taxAmount,
    netProfit: totals.netProfit + adjustedDashboardNetProfit(order, settings)
  }), { received: 0, baseCost: 0, basicBalance: 0, revenue: 0, pending: 0, cost: 0, fee: 0, shipping: 0, tax: 0, netProfit: 0 });
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
  return date.toISOString().slice(0, 10);
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
    const start = parseInputDate(customStart, startOfMonth(now));
    const end = parseInputDate(customEnd, now);
    const days = Math.abs(end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    return { start: startOfDay(start), end: endOfDay(end), unit: days > 70 ? "month" as BucketUnit : "day" as BucketUnit };
  }

  return { start: startOfYear(now), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999), unit: "month" as BucketUnit };
}

function filterOrdersByWindow(orders: DashboardFinanceOrder[], start: Date, end: Date) {
  return orders.filter(order => order.paymentDate && order.paymentDate >= start && order.paymentDate <= end);
}

function bucketLabel(date: Date, unit: BucketUnit) {
  if (unit === "month") {
    return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
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
  metric: "netProfit" | "basicBalance" = "netProfit"
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

    points.push({ label: bucketLabel(visibleBucketStart, unit), value });
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
  const growth = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
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
  const currentWindow = useMemo(
    () => rangeWindow(range, financeOrders, customStart, customEnd),
    [customEnd, customStart, financeOrders, range]
  );
  const filteredFinanceOrders = useMemo(
    () => filterOrdersByWindow(financeOrders, currentWindow.start, currentWindow.end),
    [currentWindow.end, currentWindow.start, financeOrders]
  );
  const totals = useMemo(
    () => totalsForOrders(filteredFinanceOrders, settings, dashboardVisibility),
    [dashboardVisibility, filteredFinanceOrders, settings]
  );
  const currentSeries = useMemo(
    () => buildChartSeries(
      financeOrders,
      settings,
      currentWindow.start,
      currentWindow.end,
      currentWindow.unit,
      0,
      canSeeAdvancedFinance ? "netProfit" : "basicBalance"
    ),
    [canSeeAdvancedFinance, currentWindow.end, currentWindow.start, currentWindow.unit, financeOrders, settings]
  );
  const previousYearSeries = useMemo(
    () => buildChartSeries(financeOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit, 1),
    [currentWindow.end, currentWindow.start, currentWindow.unit, financeOrders, settings]
  );
  const twoYearsBackSeries = useMemo(
    () => buildChartSeries(financeOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit, 2),
    [currentWindow.end, currentWindow.start, currentWindow.unit, financeOrders, settings]
  );
  const threeYearsBackSeries = useMemo(
    () => buildChartSeries(financeOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit, 3),
    [currentWindow.end, currentWindow.start, currentWindow.unit, financeOrders, settings]
  );
  const yearly = useMemo(() => yearTotals(financeOrders, settings), [financeOrders, settings]);
  const revenueCardTitle = settings?.taxRuleNameRevenue || "Standard VAT (New)";
  const language = settings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  async function updateDashboardVisibility(key: keyof DashboardWidgetVisibility, value: boolean) {
    if (!workspace) return;
    const previous = dashboardVisibility;
    const next = { ...previous, [key]: value };
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
              <p>{workspace.billingPlanName} · {workspace.roleLabel} · {counts.activeOrderCount} {t("active orders")}</p>
            </div>
            <div className="compact-pill-row">
              <span className="studio-pill">{t("Orders")} {counts.orderCount}</span>
              <span className="studio-pill">{t("Customers")} {counts.customerCount}</span>
              <span className="studio-pill">{t("Due soon")} {counts.dueSoonCount}</span>
            </div>
          </section>

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

            {range === "custom" ? (
              <div className="dashboard-date-controls">
                <label>
                  {t("Start")}
                  <input className="input" type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} />
                </label>
                <label>
                  {t("End")}
                  <input className="input" type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} />
                </label>
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
                    {dashboardVisibility.revenue ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.revenue.icon} title={t(revenueCardTitle)} value={money(totals.revenue, hideNumbers, settings)} tone="blue" /> : null}
                    {dashboardVisibility.pending ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.pending.icon} title={t("Pending")} value={money(totals.pending, hideNumbers, settings)} tone="orange" /> : null}
                    {dashboardVisibility.cost ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.cost.icon} title={t("Cost")} value={money(totals.cost, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.fee ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.fee.icon} title={t("Platform Fee")} value={money(totals.fee, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.shipping ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.shipping.icon} title={t("Shipping")} value={money(totals.shipping, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.tax ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.tax.icon} title={t("Tax Amount")} value={money(totals.tax, hideNumbers, settings)} tone="red" /> : null}
                    {dashboardVisibility.profit ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.profit.icon} title={t("Net Profit")} value={money(totals.netProfit, hideNumbers, settings)} tone="green" /> : null}
                  </>
                ) : (
                  <>
                    <DashboardSummaryCard icon="finance" title={t("Received")} value={money(totals.received, hideNumbers, settings)} tone="blue" />
                    <DashboardSummaryCard icon="shippingBox" title={t("Base Cost")} value={money(totals.baseCost, hideNumbers, settings)} tone="red" />
                    <DashboardSummaryCard icon="check" title={t("Basic Balance")} value={money(totals.basicBalance, hideNumbers, settings)} tone="green" />
                  </>
                )}
              </section>

              {canSeeAdvancedFinance && (
                <ExtraSpendingSection orders={financeOrders} settings={settings} hideNumbers={hideNumbers} />
              )}

              <section className="card app-card dashboard-chart-card">
                <CardTitle icon="finance" title={t(canSeeAdvancedFinance ? "Net Profit Analysis" : "Basic Balance Analysis")} />
                <ProfitChart
                  current={currentSeries}
                  previous={canSeeAdvancedFinance && (compareOneYear || compareThreeYears) ? previousYearSeries : []}
                  twoBack={canSeeAdvancedFinance && compareThreeYears ? twoYearsBackSeries : []}
                  threeBack={canSeeAdvancedFinance && compareThreeYears ? threeYearsBackSeries : []}
                  settings={settings}
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
                      <YearSummary title={t("Growth")} value={`${Math.abs(yearly.growth).toFixed(1)}%`} trend={yearly.growth >= 0 ? "up" : "down"} />
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
                  <button className="ghost-button" type="button" onClick={() => setShowCustomize(false)}>
                    {t("Close")}
                  </button>
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

function DashboardSummaryCard({ icon, title, value, tone, locked = false }: { icon: CardIcon; title: string; value: string; tone: "blue" | "green" | "orange" | "red"; locked?: boolean }) {
  return (
    <article className={locked ? "dashboard-summary-card is-locked" : "dashboard-summary-card"} data-tone={tone}>
      <div className="summary-icon" aria-hidden="true"><CardIconGlyph icon={icon} /></div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function YearSummary({ title, value, trend }: { title: string; value: string; trend?: "up" | "down" }) {
  return (
    <article className="year-summary-item">
      <span>{title}</span>
      <strong className={trend ? `trend-${trend}` : ""}>{value}</strong>
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
  settings
}: {
  current: ChartPoint[];
  previous: ChartPoint[];
  twoBack: ChartPoint[];
  threeBack: ChartPoint[];
  settings: StudioMoneySettings;
}) {
  const allValues = [...current, ...previous, ...twoBack, ...threeBack].map(point => point.value);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);

  if (current.length === 0) {
    return <div className="dashboard-chart-empty">No data available.</div>;
  }

  const symbol = moneySymbol(settings);
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

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setHoverPx({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    if (current.length <= 1) {
      setHoverIdx(0);
      return;
    }
    const usable = W - padXLeft - padXRight;
    const rel = Math.max(0, Math.min(usable, svgX - padXLeft));
    const idx = Math.round((rel / usable) * (current.length - 1));
    setHoverIdx(idx);
  }

  return (
    <div className="dashboard-chart" ref={containerRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H + 22}`}
        role="img"
        aria-label="Net profit chart"
        onMouseMove={handleMove}
        onMouseLeave={() => { setHoverIdx(null); setHoverPx(null); }}
        style={{ cursor: "crosshair", width: "100%", height: 350 }}
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
            <circle cx={xForIndex(hoverIdx)} cy={yForValue(current[hoverIdx].value)} r={6} fill="#16a34a" stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hoverIdx != null && current[hoverIdx] && hoverPx && (
        <div
          className="dashboard-chart-tooltip"
          style={{
            left: `${hoverPx.x + 14}px`,
            top: `${hoverPx.y + 14}px`,
            transform: "none",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: "#6b7280" }}>{current[hoverIdx].label}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#16a34a", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#16a34a" }} />
            Net: {symbol}{current[hoverIdx].value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      )}
      <div className="dashboard-chart-legend">
        <span><i className="legend-current" /> Current</span>
        {previous.length ? <span><i className="legend-previous" /> -1 Yr</span> : null}
        {twoBack.length ? <span><i className="legend-two" /> -2 Yrs</span> : null}
        {threeBack.length ? <span><i className="legend-three" /> -3 Yrs</span> : null}
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
}: {
  orders: DashboardFinanceOrder[];
  settings: WorkspaceSettingsOverview | null;
  hideNumbers: boolean;
}) {
  const { language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<SpendingScope>("thisMonth");
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
      for (const title of customTitles) {
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
          e.paymentDate ? e.paymentDate.toISOString().slice(0, 10) : "",
          e.amount.toFixed(2),
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extra-spending-${new Date().toISOString().slice(0, 10)}.csv`;
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
                        <span className="extra-spending-entry-heading">{e.heading}</span>
                        <span className="muted-copy"> · {e.description}</span>
                        {e.paymentDate ? (
                          <span className="muted-copy"> · {e.paymentDate.toLocaleDateString()}</span>
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
