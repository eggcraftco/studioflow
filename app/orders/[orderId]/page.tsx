"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadOrderDetail,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  orderIsAssignedToCurrentUser,
  subscribeOrderDetail,
  switchActiveWorkspace,
  workspaceAccessAllows,
  workspaceAssignedProjectsOnly,
  type OrderDetail,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { OrderDetailContent } from "../OrderDetailContent";
import { studioT } from "@/lib/studioflow/language";
import { orderWorkspaceDecision, orderWorkspaceHint } from "@/lib/studioflow/orderLink";

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  // A link that names the workspace the order was listed in (the Production
  // board's Open order, lib/studioflow/orderLink.ts). When the account's active
  // workspace is another one, nothing is loaded: the page says so and offers
  // the switch, which checks the membership itself.
  const searchParams = useSearchParams();
  const workspaceHint = orderWorkspaceHint(searchParams);
  const [otherWorkspaceId, setOtherWorkspaceId] = useState("");
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [switchError, setSwitchError] = useState("");

  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user || !orderId) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingOrder(true);
      setError(null);
      setOtherWorkspaceId("");
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        const decision = orderWorkspaceDecision(workspaceHint, loadedWorkspace.id);
        if (decision.kind === "other-workspace") {
          setWorkspace(null);
          setOrder(null);
          setOtherWorkspaceId(decision.workspaceId);
          return;
        }
        // Orders are a permission of their own: the list and the Production
        // board already turn a member without it away, and the order itself
        // must not open for them either.
        if (!workspaceAccessAllows(loadedWorkspace.memberAccess, "orders")) {
          setWorkspace(null);
          setOrder(null);
          setError("Orders are not available to your role in this workspace.");
          return;
        }
        setWorkspace(loadedWorkspace);

        const [loadedOrder, loadedMoneySettings] = await Promise.all([
          loadOrderDetail(
            loadedWorkspace.id,
            orderId,
            loadedWorkspace.entitlements.features.client_files,
            loadedWorkspace
          ),
          loadWorkspaceSettingsOverview(loadedWorkspace.id).catch(() => null)
        ]);
        if (cancelled) return;
        if (workspaceAssignedProjectsOnly(loadedWorkspace.memberAccess) && !orderIsAssignedToCurrentUser(loadedOrder, user)) {
          setOrder(null);
          setMoneySettings(loadedMoneySettings);
          setError("This project is not assigned to your account.");
          return;
        }
        setOrder(loadedOrder);
        setMoneySettings(loadedMoneySettings);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load this order.");
        }
      } finally {
        if (!cancelled) setLoadingOrder(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [orderId, user, workspaceHint]);

  async function switchToHintedWorkspace() {
    if (!user || !otherWorkspaceId || switchingWorkspace) return;
    setSwitchingWorkspace(true);
    setSwitchError("");
    try {
      // Checks users/{uid}/workspaceAccess/{id} (and a paused seat) before it
      // writes anything. On success AuthProvider sees activeCompanyId change and
      // reloads this page, which then opens the order in that workspace.
      await switchActiveWorkspace(user.uid, otherWorkspaceId);
    } catch (failure) {
      setSwitchError(failure instanceof Error && failure.message ? failure.message : "Workspace could not be selected.");
      setSwitchingWorkspace(false);
    }
  }

  useEffect(() => {
    if (!workspace || !orderId) return;

    setLoadingOrder(true);
    setError(null);
    return subscribeOrderDetail(
      workspace.id,
      orderId,
      workspace.entitlements.features.client_files,
      loadedOrder => {
        if (workspaceAssignedProjectsOnly(workspace.memberAccess) && !orderIsAssignedToCurrentUser(loadedOrder, user)) {
          setOrder(null);
          setError("This project is not assigned to your account.");
          setLoadingOrder(false);
          return;
        }
        setOrder(loadedOrder);
        setError(null);
        setLoadingOrder(false);
      },
      message => {
        setOrder(null);
        setError(message);
        setLoadingOrder(false);
      },
      workspace
    );
  }, [orderId, user, workspace]);

  async function refreshOrder() {
    if (!workspace || !orderId) return;
    const loadedOrder = await loadOrderDetail(
      workspace.id,
      orderId,
      workspace.entitlements.features.client_files,
      workspace
    );
    if (workspaceAssignedProjectsOnly(workspace.memberAccess) && !orderIsAssignedToCurrentUser(loadedOrder, user)) {
      setOrder(null);
      setError("This project is not assigned to your account.");
      return;
    }
    setOrder(loadedOrder);
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingOrder ? <LoadingScreen /> : null}

      {error ? (
        <section className="card order-error-card">
          <CardTitle icon="lock" eyebrow={t("Order error")} title={t("Could not load order")} />
          <p style={{ color: "var(--danger)", margin: 0 }}>{t(error)}</p>
        </section>
      ) : null}

      {otherWorkspaceId && !error ? (
        <section className="card order-error-card" data-order-other-workspace>
          <CardTitle icon="lock" eyebrow={t("Order error")} title={t("This order is in another workspace.")} />
          <p style={{ margin: "0 0 12px" }}>{t("Switch to that workspace to open this order.")}</p>
          <button
            type="button"
            className="button"
            disabled={switchingWorkspace}
            onClick={() => { void switchToHintedWorkspace(); }}
          >
            {t("Switch workspace")}
          </button>
          {switchError ? <p style={{ color: "var(--danger)", margin: "12px 0 0" }} role="alert">{t(switchError)}</p> : null}
        </section>
      ) : null}

      {order && workspace ? (
        <OrderDetailContent
          order={order}
          workspace={workspace}
          onReloadOrder={refreshOrder}
          onOptimisticOrderPatch={patch => setOrder(current => current ? { ...current, ...patch } : current)}
          moneySettings={moneySettings}
          showBackLink
        />
      ) : null}
    </AppShell>
  );
}
