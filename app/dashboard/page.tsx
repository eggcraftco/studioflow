"use client";

import { useEffect, useMemo, useState } from "react";
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
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";
import { saveDashboardWidgetVisibility } from "@/lib/studioflow/settingsActions";

type RangeKey = "week" | "month" | "year" | "all" | "custom";
type BucketUnit = "day" | "month";

type FinanceTotals = {
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

function isWorkflowOnly(role: string) {
  const normalized = role.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "workflow" || normalized === "workflowonly";
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
  }), { revenue: 0, pending: 0, cost: 0, fee: 0, shipping: 0, tax: 0, netProfit: 0 });
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
  yearsBack = 0
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
      return total + adjustedDashboardNetProfit(order, settings);
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
  return { current, previous, growth };
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
          isWorkflowOnly(loadedWorkspace.role) ||
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

  const canSeeFinance = Boolean(workspace && !isWorkflowOnly(workspace.role));
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
    () => buildChartSeries(financeOrders, settings, currentWindow.start, currentWindow.end, currentWindow.unit),
    [currentWindow.end, currentWindow.start, currentWindow.unit, financeOrders, settings]
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
          <CardTitle icon="lock" eyebrow="Workspace error" title="Could not load your workspace" />
          <p className="layout-error">{error}</p>
        </section>
      ) : null}

      {workspace && counts ? (
        <div className="dashboard-workspace">
          <section className="dashboard-header-card">
            <div>
              <p className="orders-kicker">Dashboard</p>
              <h1>{workspace.name}</h1>
              <p>{workspace.billingPlanName} · {workspace.roleLabel} · {counts.activeOrderCount} active orders</p>
            </div>
            <div className="compact-pill-row">
              <span className="studio-pill">Orders {counts.orderCount}</span>
              <span className="studio-pill">Customers {counts.customerCount}</span>
              <span className="studio-pill">Due soon {counts.dueSoonCount}</span>
            </div>
          </section>

          <section className="dashboard-filter-card">
            <div className="segmented-control" aria-label="Dashboard time range">
              {RANGE_OPTIONS.map(option => (
                <button
                  key={option.key}
                  className={range === option.key ? "active" : ""}
                  type="button"
                  onClick={() => setRange(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {range === "custom" ? (
              <div className="dashboard-date-controls">
                <label>
                  Start
                  <input className="input" type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} />
                </label>
                <label>
                  End
                  <input className="input" type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} />
                </label>
              </div>
            ) : null}

            <div className="dashboard-compare-controls">
              <button
                className={compareOneYear ? "compare-pill active" : "compare-pill"}
                type="button"
                onClick={() => setCompareOneYear(value => !value)}
              >
                1 Yr Compare
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
                3 Yrs Compare
              </button>
              <button className={showCustomize ? "compare-pill active" : "compare-pill"} type="button" onClick={() => setShowCustomize(value => !value)}>
                Customize
              </button>
            </div>
          </section>

          {!canSeeFinance ? (
            <section className="card app-card locked-panel">
              <CardTitle icon="lock" eyebrow="Role locked" title="Finance dashboard is hidden for Workflow Only." />
              <p className="muted-copy">Orders, workflow and Client Files remain available according to your workspace permissions.</p>
            </section>
          ) : (
            <>
              <section className="dashboard-summary-grid">
                {dashboardVisibility.revenue ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.revenue.icon} title={revenueCardTitle} value={canSeeAdvancedFinance ? money(totals.revenue, hideNumbers, settings) : "Locked"} tone="blue" locked={!canSeeAdvancedFinance} /> : null}
                {dashboardVisibility.pending ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.pending.icon} title="Pending" value={canSeeAdvancedFinance ? money(totals.pending, hideNumbers, settings) : "Locked"} tone="orange" locked={!canSeeAdvancedFinance} /> : null}
                {dashboardVisibility.cost ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.cost.icon} title="Cost" value={money(totals.cost, hideNumbers, settings)} tone="red" /> : null}
                {dashboardVisibility.fee ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.fee.icon} title="Platform Fee" value={canSeeAdvancedFinance ? money(totals.fee, hideNumbers, settings) : "Locked"} tone="red" locked={!canSeeAdvancedFinance} /> : null}
                {dashboardVisibility.shipping ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.shipping.icon} title="Shipping" value={canSeeAdvancedFinance ? money(totals.shipping, hideNumbers, settings) : "Locked"} tone="red" locked={!canSeeAdvancedFinance} /> : null}
                {dashboardVisibility.tax ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.tax.icon} title="Tax Amount" value={canSeeAdvancedFinance ? money(totals.tax, hideNumbers, settings) : "Locked"} tone="red" locked={!canSeeAdvancedFinance} /> : null}
                {dashboardVisibility.profit ? <DashboardSummaryCard icon={DASHBOARD_WIDGET_META.profit.icon} title="Net Profit" value={canSeeAdvancedFinance ? money(totals.netProfit, hideNumbers, settings) : "Locked"} tone="green" locked={!canSeeAdvancedFinance} /> : null}
              </section>

              <section className="card app-card dashboard-chart-card">
                <CardTitle icon="finance" title="Net Profit Analysis" />
                {canSeeAdvancedFinance ? (
                  <ProfitChart
                    current={currentSeries}
                    previous={compareOneYear || compareThreeYears ? previousYearSeries : []}
                    twoBack={compareThreeYears ? twoYearsBackSeries : []}
                    threeBack={compareThreeYears ? threeYearsBackSeries : []}
                  />
                ) : (
                  <div className="dashboard-chart-locked">
                    <CardTitle icon="lock" eyebrow="Advanced finance locked" title="Net profit analysis is available from StudioFlow Lite." />
                  </div>
                )}
              </section>

              <section className="card app-card yearly-summary-card">
                <CardTitle icon="calendar" title="Year-over-Year Summary" />
                <div className="yearly-summary-grid">
                  <YearSummary title="This Year" value={canSeeAdvancedFinance ? money(yearly.current, hideNumbers, settings) : "Locked" } />
                  <YearSummary title="Last Year" value={canSeeAdvancedFinance ? money(yearly.previous, hideNumbers, settings) : "Locked" } />
                  <YearSummary title="Growth" value={canSeeAdvancedFinance ? `${Math.abs(yearly.growth).toFixed(1)}%` : "Locked"} trend={yearly.growth >= 0 ? "up" : "down"} />
                </div>
              </section>
            </>
          )}

          {showCustomize ? (
            <div className="modal-backdrop dashboard-customize-backdrop" onClick={() => setShowCustomize(false)}>
              <section className="add-order-modal dashboard-customize-modal" onClick={event => event.stopPropagation()}>
                <div className="add-order-header">
                  <CardTitle icon="dashboard" eyebrow="Customize" title="Dashboard" />
                  <button className="ghost-button" type="button" onClick={() => setShowCustomize(false)}>
                    Close
                  </button>
                </div>
                <div className="dashboard-widget-list">
                  {DASHBOARD_WIDGET_ROWS.map(row => (
                    <label className="dashboard-widget-row" key={row.key} data-tone={row.tone}>
                      <span className="dashboard-widget-icon" aria-hidden="true">
                        <CardIconGlyph icon={row.icon} />
                      </span>
                      <span>{row.key === "revenue" ? revenueCardTitle : row.title}</span>
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

function pointsForSeries(series: ChartPoint[], min: number, max: number) {
  if (series.length === 0) return "";
  const width = 640;
  const height = 240;
  const padX = 20;
  const padY = 18;
  const range = max - min || 1;
  return series.map((point, index) => {
    const x = series.length === 1 ? width / 2 : padX + (index / (series.length - 1)) * (width - padX * 2);
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return `${x},${y}`;
  }).join(" ");
}

function ProfitChart({
  current,
  previous,
  twoBack,
  threeBack
}: {
  current: ChartPoint[];
  previous: ChartPoint[];
  twoBack: ChartPoint[];
  threeBack: ChartPoint[];
}) {
  const allValues = [...current, ...previous, ...twoBack, ...threeBack].map(point => point.value);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);

  if (current.length === 0) {
    return <div className="dashboard-chart-empty">No data available.</div>;
  }

  return (
    <div className="dashboard-chart">
      <svg viewBox="0 0 640 240" role="img" aria-label="Net profit chart">
        <line x1="20" x2="620" y1="42" y2="42" />
        <line x1="20" x2="620" y1="120" y2="120" />
        <line x1="20" x2="620" y1="198" y2="198" />
        <polyline className="chart-line current" points={pointsForSeries(current, min, max)} />
        {previous.length ? <polyline className="chart-line previous" points={pointsForSeries(previous, min, max)} /> : null}
        {twoBack.length ? <polyline className="chart-line two-back" points={pointsForSeries(twoBack, min, max)} /> : null}
        {threeBack.length ? <polyline className="chart-line three-back" points={pointsForSeries(threeBack, min, max)} /> : null}
      </svg>
      <div className="dashboard-chart-labels">
        <span>{current[0]?.label}</span>
        <span>{current[current.length - 1]?.label}</span>
      </div>
      <div className="dashboard-chart-legend">
        <span><i className="legend-current" /> Current</span>
        {previous.length ? <span><i className="legend-previous" /> -1 Yr</span> : null}
        {twoBack.length ? <span><i className="legend-two" /> -2 Yrs</span> : null}
        {threeBack.length ? <span><i className="legend-three" /> -3 Yrs</span> : null}
      </div>
    </div>
  );
}
