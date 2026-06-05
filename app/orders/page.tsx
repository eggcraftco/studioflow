"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  loadTeamAccessData,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  normalizeWorkspaceRole,
  orderIsAssignedToCurrentUser,
  subscribeOrderDetail,
  workspaceAssignedProjectsOnly,
  workspaceAccessAllows,
  type OrderDetail,
  type OrderListItem,
  type TeamMemberDetail,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import {
  canDeleteOrdersForRole,
  canEditOrderStatusForRole,
  deleteOrderFromWeb,
  requestWorkflowOrderDeletionFromWeb,
  updateOrderFromWeb
} from "@/lib/studioflow/orders";
import { saveOrderCardDisplaySettings } from "@/lib/studioflow/settingsActions";
import {
  filterAndSortOrders,
  type OrderQuickFilterId,
  type OrderSortMode
} from "@/lib/studioflow/orderFilters";
import { studioT } from "@/lib/studioflow/language";
import { useResizableSidebar } from "@/lib/studioflow/useResizableSidebar";
import { OrderDetailContent } from "./OrderDetailContent";
import {
  getFirstProjectGuideState,
  setFirstProjectGuideState,
  subscribeFirstProjectGuideState,
  type FirstProjectGuideState
} from "@/lib/studioflow/firstProjectGuide";

function applyOrderListPatch(order: OrderListItem, patch: Partial<OrderDetail>): OrderListItem {
  return {
    ...order,
    ...(patch.assignedToUid !== undefined ? { assignedToUid: patch.assignedToUid } : {}),
    ...(patch.assignedToEmail !== undefined ? { assignedToEmail: patch.assignedToEmail } : {}),
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

function initialsForMember(member: TeamMemberDetail) {
  const source = assigneeDisplayName(member);
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("") || "•";
}

function displayNameFromEmail(email = "") {
  const localPart = email.trim().replace(/@.*/, "");
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function assigneeDisplayName(member: Pick<TeamMemberDetail, "displayName" | "email" | "id"> | null | undefined) {
  if (!member) return "";
  return member.displayName.trim() || displayNameFromEmail(member.email) || member.id;
}

function normalizeWorkspaceAssignmentAccess(workspace: WorkspaceContext) {
  return normalizeWorkspaceRole(workspace.role) === "owner" ||
    (canDeleteOrdersForRole(workspace.role) && workspaceAccessAllows(workspace.memberAccess, "manageProjectAssignments"));
}

export default function OrdersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const ordersCountRef = useRef(0);
  const [teamMembers, setTeamMembers] = useState<TeamMemberDetail[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [requestedOrderId, setRequestedOrderId] = useState("");
  const [firstProjectGuide, setFirstProjectGuide] = useState<FirstProjectGuideState | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState<OrderQuickFilterId>("all");
  const [orderSortMode, setOrderSortMode] = useState<OrderSortMode>("smart");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [blockHeadingSettings, setBlockHeadingSettings] = useState<BlockHeadingSettings | null>(null);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [orderContextMenu, setOrderContextMenu] = useState<{ orderId: string; x: number; y: number } | null>(null);
  const [orderActionStatus, setOrderActionStatus] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
  const [showOrderStatusBadges, setShowOrderStatusBadges] = useState(true);
  const sidebar = useResizableSidebar({ storageKey: "studioflow-orders-sidebar", workspaceId: workspace?.id, initialWidth: 360, maxWidth: 720 });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedOrderId(params.get("selectedOrderId") ?? params.get("orderId") ?? "");
  }, []);

  useEffect(() => {
    setFirstProjectGuide(getFirstProjectGuideState());
    return subscribeFirstProjectGuideState(setFirstProjectGuide);
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
          loadRecentOrders(loadedWorkspace.id, loadedWorkspace, uid),
          loadWorkspaceBlockHeadings(loadedWorkspace).catch(() => null),
          loadWorkspaceSettingsOverview(loadedWorkspace.id).catch(() => null)
        ]);
        const loadedTeamMembers = await loadTeamAccessData(loadedWorkspace).then(data => data.members).catch(() => []);
        if (cancelled) return;
        setOrders(loadedOrders);
        setTeamMembers(loadedTeamMembers);
        setBlockHeadingSettings(loadedBlockHeadings);
        setMoneySettings(loadedMoneySettings);
        setShowOrderStatusBadges(loadedMoneySettings?.orderCardShowStatusBadges ?? true);
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
      },
      currentWorkspace
    );
  }, [selectedOrderId, workspace]);

  useEffect(() => {
    if (!selectedOrderId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`orders-sidebar-order-${selectedOrderId}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [selectedOrderId]);

  const canSeeFinance = useMemo(() => workspace ? workspaceAccessAllows(workspace.memberAccess, "financialInfo") : false, [workspace]);
  const canSeeAdvancedFinance = Boolean(workspace?.entitlements.features.financial_advanced && canSeeFinance);
  const visibleOrders = useMemo(
    () => workspace && workspaceAssignedProjectsOnly(workspace.memberAccess)
      ? orders.filter(order => orderIsAssignedToCurrentUser(order, user))
      : orders,
    [orders, user, workspace]
  );
  const filteredOrders = useMemo(
    () => filterAndSortOrders(visibleOrders, orderSearch, orderFilter, orderSortMode),
    [orderFilter, orderSearch, orderSortMode, visibleOrders]
  );
  useEffect(() => {
    ordersCountRef.current = orders.length;
  }, [orders]);

  useEffect(() => {
    if (loadingOrders) return;
    if (selectedOrderId && filteredOrders.some(order => order.id === selectedOrderId)) return;
    setSelectedOrderId(filteredOrders[0]?.id || "");
  }, [filteredOrders, loadingOrders, selectedOrderId]);

  useEffect(() => {
    if (!workspace || !user) return;
    const uid = user.uid;

    async function handleCreatedOrder(event: Event) {
      const orderId = (event as CustomEvent<{ orderId?: string }>).detail?.orderId;
      if (!orderId || !workspace) return;
      // Only run the first-project guide for a genuinely new user: their very
      // first project (no existing orders) and the guide not already completed.
      // Otherwise creating any project would keep re-triggering the info cards.
      const existingGuide = getFirstProjectGuideState();
      const isFirstEverProject = ordersCountRef.current === 0;
      if (isFirstEverProject && !existingGuide?.completed) {
        setFirstProjectGuideState({ step: 2, orderId, completed: false });
      }
      const loadedOrders = await loadRecentOrders(workspace.id, workspace, uid);
      setOrders(loadedOrders);
      setSelectedOrderId(orderId);
      setRequestedOrderId(orderId);
    }

    window.addEventListener("studioflow-order-created", handleCreatedOrder);
    return () => window.removeEventListener("studioflow-order-created", handleCreatedOrder);
  }, [workspace, user]);

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
    if (!workspace || !selectedOrderId || !user) return;
    const uid = user.uid;
    const [loadedOrder, loadedOrders] = await Promise.all([
      loadOrderDetail(workspace.id, selectedOrderId, workspace.entitlements.features.client_files, workspace),
      loadRecentOrders(workspace.id, workspace, uid)
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
    const height = 370;
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
    if (!workspace || !user) return;
    const uid = user.uid;
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
        loadRecentOrders(workspace.id, workspace, uid).then(setOrders).catch(() => undefined);
      }
    }
  }

  async function deleteOrderFromMenu(order: OrderListItem) {
    if (!workspace || !user) return;
    const uid = user.uid;
    const requiresOwnerApproval = normalizeWorkspaceRole(workspace.role) === "workflow"
      || (workspace.memberAccess.assignedProjectsOnly === true
        && workspace.memberAccess.manageProjectAssignments !== true);
    if (requiresOwnerApproval) {
      const confirmed = window.confirm(`Request deletion of "${order.customerName.trim() || "New Project"}"? The order will be deleted only after owner approval.`);
      if (!confirmed) return;
      setOrderContextMenu(null);
      setOrderActionError(null);
      setOrderActionStatus("Sending deletion request to owner...");
      try {
        const result = await requestWorkflowOrderDeletionFromWeb(workspace, order.id);
        setOrderActionStatus(result.message || "Deletion request sent to workspace owner.");
      } catch (requestError) {
        setOrderActionStatus(null);
        setOrderActionError(requestError instanceof Error ? requestError.message : "Could not send deletion request.");
      }
      return;
    }
    if (!canDeleteOrdersForRole(workspace.role)) {
      setOrderActionError("Your workspace role cannot delete orders.");
      return;
    }
    const confirmed = window.confirm(`Delete "${order.customerName.trim() || "New Project"}"? This cannot be undone.`);
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
      loadRecentOrders(workspace.id, workspace, uid).then(setOrders).catch(() => undefined);
    }
  }

  function assigneeForOrder(order: { assignedToUid?: string; assignedToEmail?: string }) {
    const assignedUid = order.assignedToUid?.trim() ?? "";
    const assignedEmail = order.assignedToEmail?.trim().toLowerCase() ?? "";
    return teamMembers.find(member => assignedUid && member.id === assignedUid)
      ?? teamMembers.find(member => assignedEmail && member.email.trim().toLowerCase() === assignedEmail)
      ?? null;
  }

  function assigneeNameForOrder(order: OrderListItem) {
    const member = assigneeForOrder(order);
    return assigneeDisplayName(member) || displayNameFromEmail(order.assignedToEmail || "");
  }

  function assigneePhotoForOrder(order: OrderListItem) {
    return assigneeForOrder(order)?.photoURL || "";
  }

  async function assignOrderFromMenu(order: OrderListItem, member: TeamMemberDetail | null) {
    if (!workspace || !user) return;
    const uid = user.uid;
    const canManageAssignments = normalizeWorkspaceAssignmentAccess(workspace);
    if (!canManageAssignments) {
      setOrderActionError("Your workspace role cannot assign projects.");
      return;
    }

    const assignedToUid = member?.id ?? "";
    const assignedToEmail = member?.email ?? "";
    setOrderContextMenu(null);
    setOrderActionError(null);
    setOrderActionStatus(member ? `Assigning project to ${assigneeDisplayName(member)}...` : "Clearing project assignment...");

    setOrders(current => current.map(item => item.id === order.id ? { ...item, assignedToUid, assignedToEmail } : item));
    setSelectedOrder(current => current?.id === order.id ? { ...current, assignedToUid, assignedToEmail } : current);

    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: { assignedToUid, assignedToEmail }
      });
      setOrderActionStatus(member ? "Project assigned." : "Project assignment cleared.");
    } catch (assignError) {
      setOrderActionStatus(null);
      setOrderActionError(assignError instanceof Error ? assignError.message : "Could not update project assignment.");
      loadRecentOrders(workspace.id, workspace, uid).then(setOrders).catch(() => undefined);
      if (selectedOrderId === order.id) refreshSelectedOrder().catch(() => undefined);
    }
  }

  async function toggleOrderStatusBadgesFromMenu() {
    if (!workspace) return;
    const nextValue = !showOrderStatusBadges;
    setShowOrderStatusBadges(nextValue);
    setOrderContextMenu(null);
    setOrderActionError(null);
    setOrderActionStatus(nextValue ? "Production status badges shown." : "Production status badges hidden.");
    try {
      await saveOrderCardDisplaySettings(workspace, { showStatusBadges: nextValue });
      setMoneySettings(current => current ? { ...current, orderCardShowStatusBadges: nextValue } : current);
    } catch (saveError) {
      setOrderActionStatus(null);
      setMoneySettings(current => current ? { ...current, orderCardShowStatusBadges: nextValue } : current);
      setOrderActionError(saveError instanceof Error ? `${saveError.message} The change is visible locally, but could not sync yet.` : "The change is visible locally, but could not sync yet.");
    }
  }

  const contextOrder = orderContextMenu ? orders.find(order => order.id === orderContextMenu.orderId) ?? null : null;
  const canUseOrderContextActions = workspace ? canEditOrderStatusForRole(workspace.role) : false;
  const canRequestOrderDeletion = workspace
    ? normalizeWorkspaceRole(workspace.role) === "workflow"
      || (workspace.memberAccess.assignedProjectsOnly === true
        && workspace.memberAccess.manageProjectAssignments !== true)
    : false;
  const canDeleteOrders = workspace ? canDeleteOrdersForRole(workspace.role) && !canRequestOrderDeletion : false;
  const canAssignOrders = workspace ? normalizeWorkspaceAssignmentAccess(workspace) : false;
  const language = moneySettings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

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
              <p className="orders-kicker">{t("Orders")}</p>
              <h1>{filteredOrders.length} {t("orders")}</h1>
              <p>{workspace ? `${workspace.name} - ${workspace.roleLabel}` : t("Loading workspace...")}</p>
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
                value={orderSearch}
                onChange={event => setOrderSearch(event.target.value)}
                placeholder={t("Search...")}
              />
            </label>
            <OrderQuickFilterBar
              orders={visibleOrders}
              filter={orderFilter}
              sortMode={orderSortMode}
              onFilterChange={setOrderFilter}
              onSortModeChange={setOrderSortMode}
              language={language}
            />
          </div>

          {error ? (
            <div className="mini-panel compact-mini-panel">
              <CardTitle icon="lock" eyebrow={t("Order error")} title={t("Could not load orders")} />
              <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          ) : null}

          {orderActionStatus ? <p className="orders-sidebar-message">{orderActionStatus}</p> : null}
          {orderActionError ? <p className="orders-sidebar-error">{orderActionError}</p> : null}

          {filteredOrders.length === 0 && !loadingOrders ? (
            <p className="muted-copy" style={{ padding: "0 14px 14px" }}>{t("No orders found for this workspace yet.")}</p>
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
                  showStatusBadges={showOrderStatusBadges}
                  assigneeName={assigneeNameForOrder(order)}
                  assigneePhotoURL={assigneePhotoForOrder(order)}
                  showFirstProjectGuideProjectBubble={firstProjectGuide?.step === 2 && firstProjectGuide.orderId === order.id}
                  onFirstProjectGuideProjectNext={() => setFirstProjectGuideState({ step: 3, orderId: order.id, completed: false })}
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
                  {t("Open Customer")}
                </a>
              ) : null}
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row"
                onClick={() => void toggleOrderStatusBadgesFromMenu()}
              >
                <span aria-hidden="true">{showOrderStatusBadges ? "✓" : "○"}</span>
                {t("Production Status")}
              </button>
              {canAssignOrders ? (
                <>
                  <div className="order-list-context-divider" />
                  <div className="order-list-context-subtitle">{t("Assign Project")}</div>
                  <button
                    role="menuitem"
                    type="button"
                    className="order-list-context-row"
                    disabled={!contextOrder.assignedToUid}
                    onClick={() => void assignOrderFromMenu(contextOrder, null)}
                  >
                    <span aria-hidden="true">○</span>
                    {t("Unassigned")}
                  </button>
                  {teamMembers
                    .filter(member => !member.isOwner)
                    .map(member => (
                      <button
                        key={member.id}
                        role="menuitem"
                        type="button"
                        className="order-list-context-row"
                        onClick={() => void assignOrderFromMenu(contextOrder, member)}
                      >
                        <span aria-hidden="true">{contextOrder.assignedToUid === member.id ? "✓" : initialsForMember(member)}</span>
                        {assigneeDisplayName(member)}
                      </button>
                    ))}
                  <div className="order-list-context-divider" />
                </>
              ) : null}
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row"
                disabled={!canUseOrderContextActions}
                onClick={() => void saveOrderStatusFromMenu(contextOrder, "Done")}
              >
                <span aria-hidden="true">✓</span>
                {t("Mark as Done")}
              </button>
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row"
                disabled={!canUseOrderContextActions}
                onClick={() => void saveOrderStatusFromMenu(contextOrder, "Cancelled")}
              >
                <span aria-hidden="true">×</span>
                {t("Cancel Order")}
              </button>
              <div className="order-list-context-divider" />
              <button
                role="menuitem"
                type="button"
                className="order-list-context-row danger"
                disabled={!canDeleteOrders && !canRequestOrderDeletion}
                onClick={() => void deleteOrderFromMenu(contextOrder)}
              >
                <span aria-hidden="true">⌫</span>
                {canRequestOrderDeletion ? "Request Deletion" : t("Delete")}
              </button>
            </div>
          ) : null}
        </aside>

        <button
          className="workspace-sidebar-resizer"
          type="button"
          aria-label={t("Resize order list")}
          title={t("Resize order list")}
          onPointerDown={sidebar.startResize}
        />

        <main className="orders-detail-pane">
          {loadingDetail ? <LoadingScreen /> : null}

          {detailError ? (
            <section className="card order-error-card">
              <CardTitle icon="lock" eyebrow={t("Order error")} title={t("Could not load order")} />
              <p style={{ color: "var(--danger)", margin: 0 }}>{detailError}</p>
            </section>
          ) : null}

          {!selectedOrderId && !detailError ? (
            <section className="orders-empty-detail">
              <CardTitle icon="orders" eyebrow={t("Select order")} title={t("Choose an order from the list")} />
              <p className="muted-copy">{t("Order details will appear here on wider screens.")}</p>
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
              <h2>{t("Orders")}</h2>
              <p>{filteredOrders.length} {t("orders")}</p>
            </div>
            <OrderQuickFilterBar
              orders={orders}
              filter={orderFilter}
              sortMode={orderSortMode}
              onFilterChange={setOrderFilter}
              onSortModeChange={setOrderSortMode}
              language={language}
            />
            <button
              className={mobileSearchOpen ? "orders-mobile-search-toggle is-active" : "orders-mobile-search-toggle"}
              type="button"
              aria-label={mobileSearchOpen ? t("Hide search") : t("Show search")}
              onClick={() => setMobileSearchOpen(open => !open)}
            >
              {mobileSearchOpen ? "×" : "⌕"}
            </button>
          </div>

          {mobileSearchOpen ? (
            <label className="orders-search orders-mobile-search">
              <span aria-hidden="true">⌕</span>
              <input value={orderSearch} onChange={event => setOrderSearch(event.target.value)} placeholder={t("Search...")} />
              {orderSearch ? (
                <button type="button" aria-label={t("Clear search")} onClick={() => setOrderSearch("")}>
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
                showStatusBadges={showOrderStatusBadges}
                assigneeName={assigneeNameForOrder(order)}
                assigneePhotoURL={assigneePhotoForOrder(order)}
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
