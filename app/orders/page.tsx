"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
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
  workspaceAccessAllows,
  type OrderDetail,
  type OrderListItem,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import {
  canEditOrderFullyForRole,
  canEditOrderStatusForRole,
  deleteOrderFromWeb,
  updateOrderFromWeb
} from "@/lib/studioflow/orders";
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

function applyOrderListPatch(order: OrderListItem, patch: Partial<OrderDetail>): OrderListItem {
  return {
    ...order,
    ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
    ...(patch.designName !== undefined ? { designName: patch.designName } : {}),
    ...(patch.watchRef !== undefined ? { watchRef: patch.watchRef } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.designStatus !== undefined ? { designStatus: patch.designStatus } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.risk !== undefined ? { risk: patch.risk } : {}),
    ...(patch.riskReason !== undefined ? { riskReason: patch.riskReason } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.emailAddress !== undefined ? { emailAddress: patch.emailAddress } : {}),
    ...(patch.instagramUsername !== undefined ? { instagramUsername: patch.instagramUsername } : {}),
    ...(patch.whatsappNumber !== undefined ? { whatsappNumber: patch.whatsappNumber } : {}),
    ...(patch.paidAmount !== undefined ? { paidAmount: patch.paidAmount } : {}),
    ...(patch.remainingAmount !== undefined ? { remainingAmount: patch.remainingAmount } : {}),
    ...(patch.paymentDate !== undefined ? { paymentDate: patch.paymentDate } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    ...(patch.isDispatched !== undefined ? { isDispatched: patch.isDispatched } : {}),
    ...(patch.isDelivered !== undefined ? { isDelivered: patch.isDelivered } : {}),
    ...(patch.customFields !== undefined ? { customFields: patch.customFields } : {}),
    ...(patch.extraStatuses !== undefined ? { extraStatuses: patch.extraStatuses } : {}),
    ...(patch.designLink !== undefined ? { previewImageUrl: patch.designLink } : {})
  };
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
  const [orderContextMenu, setOrderContextMenu] = useState<{ orderId: string; x: number; y: number } | null>(null);
  const [orderActionStatus, setOrderActionStatus] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
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
        if (!workspaceAccessAllows(loadedWorkspace.memberAccess, "orders")) {
          router.replace("/settings?section=account");
          return;
        }
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

  useEffect(() => {
    if (!orderContextMenu) return;
    const closeMenu = () => setOrderContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [orderContextMenu]);

  async function refreshSelectedOrder() {
    if (!workspace || !selectedOrderId) return;
    const [loadedOrder, loadedOrders] = await Promise.all([
      loadOrderDetail(workspace.id, selectedOrderId, workspace.entitlements.features.client_files),
      loadRecentOrders(workspace.id)
    ]);
    setSelectedOrder(loadedOrder);
    setOrders(loadedOrders);
  }

  function applyOptimisticOrderPatch(patch: Partial<OrderDetail>) {
    setSelectedOrder(current => current && current.id === selectedOrderId ? { ...current, ...patch } : current);
    setOrders(current => current.map(order => order.id === selectedOrderId ? applyOrderListPatch(order, patch) : order));
  }

  function contextMenuPosition(x: number, y: number) {
    const width = 230;
    const height = 190;
    return {
      x: Math.min(x, window.innerWidth - width - 12),
      y: Math.min(y, window.innerHeight - height - 12)
    };
  }

  function openOrderContextMenu(event: MouseEvent, order: OrderListItem) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedOrderId(order.id);
    const nextPosition = contextMenuPosition(event.clientX, event.clientY);
    setOrderContextMenu({ orderId: order.id, ...nextPosition });
  }

  function optimisticStatusPatch(orderId: string, status: string) {
    const extraStatuses = orders.find(order => order.id === orderId)?.extraStatuses ?? {};
    const nextExtraStatuses = Object.fromEntries(Object.keys(extraStatuses).map(key => [key, status]));
    setOrders(current => current.map(order => order.id === orderId
      ? { ...order, designStatus: status, status, extraStatuses: nextExtraStatuses }
      : order
    ));
    setSelectedOrder(current => current?.id === orderId
      ? { ...current, designStatus: status, status, extraStatuses: nextExtraStatuses }
      : current
    );
    return nextExtraStatuses;
  }

  async function saveOrderStatusFromMenu(order: OrderListItem, status: "Done" | "Cancelled") {
    if (!workspace) return;
    if (!canEditOrderStatusForRole(workspace.role)) {
      setOrderActionError("Your workspace role cannot edit this order.");
      return;
    }

    setOrderContextMenu(null);
    setOrderActionError(null);
    setOrderActionStatus(status === "Done" ? "Marking order as done..." : "Cancelling order...");
    const nextExtraStatuses = optimisticStatusPatch(order.id, status);
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        designStatus: status,
        paintingStatus: status,
        details: { extraStatuses: nextExtraStatuses }
      });
      setOrderActionStatus(status === "Done" ? "Order marked as done." : "Order cancelled.");
    } catch (actionError) {
      setOrderActionStatus(null);
      setOrderActionError(actionError instanceof Error ? actionError.message : "Could not update this order.");
      if (workspace && selectedOrderId === order.id) {
        await refreshSelectedOrder().catch(() => undefined);
      } else {
        loadRecentOrders(workspace.id).then(setOrders).catch(() => undefined);
      }
    }
  }

  async function deleteOrderFromMenu(order: OrderListItem) {
    if (!workspace) return;
    if (!canEditOrderFullyForRole(workspace.role)) {
      setOrderActionError("Your workspace role cannot delete orders.");
      return;
    }
    const confirmed = window.confirm(`Delete "${order.customerName || "this order"}"? This cannot be undone.`);
    if (!confirmed) return;

    setOrderContextMenu(null);
    setOrderActionError(null);
    setOrderActionStatus("Deleting order...");
    const nextOrders = orders.filter(item => item.id !== order.id);
    setOrders(nextOrders);
    if (selectedOrderId === order.id) {
      setSelectedOrder(null);
      setSelectedOrderId(nextOrders[0]?.id || "");
    }

    try {
      await deleteOrderFromWeb(workspace, order.id);
      setOrderActionStatus("Order deleted.");
    } catch (deleteError) {
      setOrderActionStatus(null);
      setOrderActionError(deleteError instanceof Error ? deleteError.message : "Could not delete this order.");
      loadRecentOrders(workspace.id).then(setOrders).catch(() => undefined);
    }
  }

  const contextOrder = orderContextMenu ? orders.find(order => order.id === orderContextMenu.orderId) ?? null : null;
  const canUseOrderContextActions = workspace ? canEditOrderStatusForRole(workspace.role) : false;
  const canDeleteOrders = workspace ? canEditOrderFullyForRole(workspace.role) : false;

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

          {orderActionStatus ? <p className="orders-sidebar-message">{orderActionStatus}</p> : null}
          {orderActionError ? <p className="orders-sidebar-error">{orderActionError}</p> : null}

          {filteredOrders.length === 0 && !loadingOrders ? (
            <p className="muted-copy" style={{ padding: "0 14px 14px" }}>No orders found for this workspace yet.</p>
          ) : null}

          <div className="orders-list">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                id={`orders-sidebar-order-${order.id}`}
                onContextMenu={event => openOrderContextMenu(event, order)}
              >
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

          {orderContextMenu && contextOrder ? (
            <div
              className="order-list-context-menu"
              style={{ left: orderContextMenu.x, top: orderContextMenu.y }}
              role="menu"
              onClick={event => event.stopPropagation()}
            >
              {contextOrder.customerName.trim() ? (
                <a
                  role="menuitem"
                  href={`/customers?customerName=${encodeURIComponent(contextOrder.customerName.trim())}`}
                  className="order-list-context-row"
                >
                  <span aria-hidden="true">◉</span>
                  Open Customer
                </a>
              ) : null}
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row"
                disabled={!canUseOrderContextActions}
                onClick={() => void saveOrderStatusFromMenu(contextOrder, "Done")}
              >
                <span aria-hidden="true">✓</span>
                Mark as Done
              </button>
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row"
                disabled={!canUseOrderContextActions}
                onClick={() => void saveOrderStatusFromMenu(contextOrder, "Cancelled")}
              >
                <span aria-hidden="true">×</span>
                Cancel Order
              </button>
              <div className="order-list-context-divider" />
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row danger"
                disabled={!canDeleteOrders}
                onClick={() => void deleteOrderFromMenu(contextOrder)}
              >
                <span aria-hidden="true">⌫</span>
                Delete
              </button>
            </div>
          ) : null}
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
              onOptimisticOrderPatch={applyOptimisticOrderPatch}
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
