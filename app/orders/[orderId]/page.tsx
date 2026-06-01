"use client";

import { useParams, useRouter } from "next/navigation";
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
  workspaceAssignedProjectsOnly,
  type OrderDetail,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { OrderDetailContent } from "../OrderDetailContent";

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

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
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
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
  }, [orderId, user]);

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
          <CardTitle icon="lock" eyebrow="Order error" title="Could not load order" />
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
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
