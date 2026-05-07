"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OrderListCard } from "@/components/OrderListCard";
import { OrderQuickFilterBar } from "@/components/OrderQuickFilterBar";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadWorkspaceBlockHeadings,
  type BlockHeadingSettings
} from "@/lib/studioflow/blockHeadings";
import {
  loadOrderDetail,
  loadRecentOrders,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  subscribeOrderDetail,
  type OrderDetail,
  type OrderListItem,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import {
  filterAndSortOrders,
  type OrderQuickFilterId,
  type OrderSortMode
} from "@/lib/studioflow/orderFilters";
import { useResizableSidebar } from "@/lib/studioflow/useResizableSidebar";
import { OrderDetailContent } from "./OrderDetailContent";

function isWorkflowOnly(role: string) {
  const normalized = role.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "workflow" || normalized === "workflowonly";
}

export default function OrdersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [requestedOrderId, setRequestedOrderId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState<OrderQuickFilterId>("all");
  const [orderSortMode, setOrderSortMode] = useState<OrderSortMode>("smart");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [blockHeadingSettings, setBlockHeadingSettings] = useState<BlockHeadingSettings | null>(null);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const sidebar = useResizableSidebar({ storageKey: "studioflow-orders-sidebar", workspaceId: workspace?.id, initialWidth: 360, maxWidth: 720 });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedOrderId(params.get("selectedOrderId") ?? params.get("orderId") ?? "");
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingOrders(true);
      setError(null);
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        setWorkspace(loadedWorkspace);

        const [loadedOrders, loadedBlockHeadings, loadedMoneySettings] = await Promise.all([
          loadRecentOrders(loadedWorkspace.id),
          loadWorkspaceBlockHeadings(loadedWorkspace).catch(() => null),
          loadWorkspaceSettingsOverview(loadedWorkspace.id).catch(() => null)
        ]);
        if (cancelled) return;
        setOrders(loadedOrders);
        setBlockHeadingSettings(loadedBlockHeadings);
        setMoneySettings(loadedMoneySettings);
        setSelectedOrderId(current => {
          if (requestedOrderId && loadedOrders.some(order => order.id === requestedOrderId)) return requestedOrderId;
          return current || loadedOrders[0]?.id || "";
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load orders.");
        }
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [requestedOrderId, user]);

  useEffect(() => {
    if (!workspace || !selectedOrderId) {
      setSelectedOrder(null);
      return;
    }
    const currentWorkspace = workspace;

    setLoadingDetail(true);
    setDetailError(null);
    setSelectedOrder(null);
    return subscribeOrderDetail(
      currentWorkspace.id,
      selectedOrderId,
      currentWorkspace.entitlements.features.client_files,
      loadedOrder => {
        setSelectedOrder(loadedOrder);
        setDetailError(null);
        setLoadingDetail(false);
      },
      message => {
        setSelectedOrder(null);
        setDetailError(message);
        setLoadingDetail(false);
      }
    );
  }, [selectedOrderId, workspace]);

  useEffect(() => {
    if (!selectedOrderId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`orders-sidebar-order-${selectedOrderId}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [selectedOrderId]);

  const canSeeFinance = useMemo(() => workspace ? !isWorkflowOnly(workspace.role) : false, [workspace]);
  const canSeeAdvancedFinance = Boolean(workspace?.entitlements.features.financial_advanced && canSeeFinance);
  const filteredOrders = useMemo(
    () => filterAndSortOrders(orders, orderSearch, orderFilter, orderSortMode),
    [orderFilter, orderSearch, orderSortMode, orders]
  );
  useEffect(() => {
    if (loadingOrders) return;
    if (selectedOrderId && filteredOrders.some(order => order.id === selectedOrderId)) return;
    setSelectedOrderId(filteredOrders[0]?.id || "");
  }, [filteredOrders, loadingOrders, selectedOrderId]);

  useEffect(() => {
    if (!workspace) return;

    async function handleCreatedOrder(event: Event) {
      const orderId = (event as CustomEvent<{ orderId?: string }>).detail?.orderId;
      if (!orderId || !workspace) return;
      const loadedOrders = await loadRecentOrders(workspace.id);
      setOrders(loadedOrders);
      setSelectedOrderId(orderId);
    }

    window.addEventListener("studioflow-order-created", handleCreatedOrder);
    return () => window.removeEventListener("studioflow-order-created", handleCreatedOrder);
  }, [workspace]);

  async function refreshSelectedOrder() {
    if (!workspace || !selectedOrderId) return;
    const [loadedOrder, loadedOrders] = await Promise.all([
      loadOrderDetail(workspace.id, selectedOrderId, workspace.entitlements.features.client_files),
      loadRecentOrders(workspace.id)
    ]);
    setSelectedOrder(loadedOrder);
    setOrders(loadedOrders);
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingOrders ? <LoadingScreen /> : null}

      <section
        className={sidebar.collapsed ? "orders-workspace resizable-workspace is-sidebar-collapsed" : "orders-workspace resizable-workspace"}
        style={sidebar.workspaceStyle}
      >
        <aside className="orders-sidebar">
          <div className="orders-sidebar-toolbar">
            <div>
              <p className="orders-kicker">Orders</p>
              <h1>{filteredOrders.length} orders</h1>
              <p>{workspace ? `${workspace.name} - ${workspace.roleLabel}` : "Loading workspace..."}</p>
            </div>
            <div className="sidebar-toolbar-actions">
              {workspace ? <span className="studio-pill">{workspace.billingPlanName}</span> : null}
              <button
                className="sidebar-toggle-button"
                type="button"
                title={sidebar.collapsed ? "Expand order list" : "Collapse order list"}
                aria-label={sidebar.collapsed ? "Expand order list" : "Collapse order list"}
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
                value={orderSearch}
                onChange={event => setOrderSearch(event.target.value)}
                placeholder="Search..."
              />
            </label>
            <OrderQuickFilterBar
              orders={orders}
              filter={orderFilter}
              sortMode={orderSortMode}
              onFilterChange={setOrderFilter}
              onSortModeChange={setOrderSortMode}
            />
          </div>

          {error ? (
            <div className="mini-panel compact-mini-panel">
              <CardTitle icon="lock" eyebrow="Order error" title="Could not load orders" />
              <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          ) : null}

          {filteredOrders.length === 0 && !loadingOrders ? (
            <p className="muted-copy" style={{ padding: "0 14px 14px" }}>No orders found for this workspace yet.</p>
          ) : null}

          <div className="orders-list">
            {filteredOrders.map(order => (
              <div key={order.id} id={`orders-sidebar-order-${order.id}`}>
                <OrderListCard
                  order={order}
                  selected={order.id === selectedOrderId}
                  canSeeFinance={canSeeFinance}
                  canSeeAdvancedFinance={canSeeAdvancedFinance}
                  blockHeadingSettings={blockHeadingSettings}
                  moneySettings={moneySettings}
                  onSelect={() => setSelectedOrderId(order.id)}
                />
              </div>
            ))}
          </div>
        </aside>

        <button
          className="workspace-sidebar-resizer"
          type="button"
          aria-label="Resize order list"
          title="Resize order list"
          onPointerDown={sidebar.startResize}
        />

        <main className="orders-detail-pane">
          {loadingDetail ? <LoadingScreen /> : null}

          {detailError ? (
            <section className="card order-error-card">
              <CardTitle icon="lock" eyebrow="Order error" title="Could not load order" />
              <p style={{ color: "var(--danger)", margin: 0 }}>{detailError}</p>
            </section>
          ) : null}

          {!selectedOrderId && !detailError ? (
            <section className="orders-empty-detail">
              <CardTitle icon="orders" eyebrow="Select order" title="Choose an order from the list" />
              <p className="muted-copy">Order details will appear here on wider screens.</p>
            </section>
          ) : null}

          {selectedOrder && selectedOrder.id === selectedOrderId && workspace ? (
            <OrderDetailContent
              order={selectedOrder}
              workspace={workspace}
              onReloadOrder={refreshSelectedOrder}
              onOptimisticOrderPatch={patch => {
                setSelectedOrder(current => current && current.id === selectedOrderId ? { ...current, ...patch } : current);
              }}
              onBlockHeadingSettingsChange={setBlockHeadingSettings}
              moneySettings={moneySettings}
            />
          ) : null}
        </main>

        <section className="orders-mobile-list">
          <div className="orders-mobile-header">
            <div className="orders-mobile-title">
              <h2>Orders</h2>
              <p>{filteredOrders.length} orders</p>
            </div>
            <OrderQuickFilterBar
              orders={orders}
              filter={orderFilter}
              sortMode={orderSortMode}
              onFilterChange={setOrderFilter}
              onSortModeChange={setOrderSortMode}
            />
            <button
              className={mobileSearchOpen ? "orders-mobile-search-toggle is-active" : "orders-mobile-search-toggle"}
              type="button"
              aria-label={mobileSearchOpen ? "Hide search" : "Show search"}
              onClick={() => setMobileSearchOpen(open => !open)}
            >
              {mobileSearchOpen ? "×" : "⌕"}
            </button>
          </div>

          {mobileSearchOpen ? (
            <label className="orders-search orders-mobile-search">
              <span aria-hidden="true">⌕</span>
              <input value={orderSearch} onChange={event => setOrderSearch(event.target.value)} placeholder="Search..." />
              {orderSearch ? (
                <button type="button" aria-label="Clear search" onClick={() => setOrderSearch("")}>
                  ×
                </button>
              ) : null}
            </label>
          ) : null}

          <div className="orders-list">
            {filteredOrders.map(order => (
              <OrderListCard
                key={order.id}
                order={order}
                selected={order.id === selectedOrderId}
                canSeeFinance={canSeeFinance}
                canSeeAdvancedFinance={canSeeAdvancedFinance}
                blockHeadingSettings={blockHeadingSettings}
                moneySettings={moneySettings}
                onSelect={() => setSelectedOrderId(order.id)}
                mobileHref={`/orders/${order.id}`}
              />
            ))}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
