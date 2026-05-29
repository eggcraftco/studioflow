"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  PLAN_ENTITLEMENTS,
  storageLimitLabel,
  usagePercent,
  type FeatureKey,
  type PlanEntitlements
} from "@/lib/studioflow/plans";
import {
  loadDashboardCounts,
  loadWorkspaceContext,
  type DashboardCounts,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import {
  createStripeCheckoutSession,
  createStripeCustomerPortalSession,
  type StripeBillingItemKey
} from "@/lib/studioflow/billingActions";

const FEATURE_LABELS: Record<FeatureKey, string> = {
  orders_read: "View existing orders",
  orders_create: "Create new projects",
  export_data: "Export existing data",
  financial_basic: "Basic finance: Paid + Cost",
  financial_advanced: "Advanced finance: VAT, fees, remaining, profit",
  client_files: "Client Files cloud access",
  card_customization: "Order card customization",
  team_access: "Team access and roles",
  storage_addons: "Storage add-ons",
  workspace_logo_upload: "Workspace logo upload",
  chatgpt_app: "ChatGPT App integration",
  personal_notes: "Personal notes",
  order_notes: "Order notes",
  dashboard_summary: "Dashboard summary",
  financial_summary: "Financial summaries",
  messages: "Messages and quick replies"
};

const ADD_ONS = [
  {
    id: "storage_100gb",
    title: "100 GB Storage Add-on",
    storageGB: 100,
    note: "For studios uploading larger client file libraries."
  },
  {
    id: "storage_200gb",
    title: "200 GB Storage Add-on",
    storageGB: 200,
    note: "For heavier teams and long-term archive use."
  }
];

const PLAN_CHECKOUT_OPTIONS: Partial<Record<string, {
  monthly: { itemKey: StripeBillingItemKey; label: string };
  yearly: { itemKey: StripeBillingItemKey; label: string };
}>> = {
  lifetime_lite: {
    monthly: { itemKey: "lite_monthly", label: "£9 monthly" },
    yearly: { itemKey: "lite_yearly", label: "£90 yearly" }
  },
  pro_monthly: {
    monthly: { itemKey: "pro_monthly", label: "£19 monthly" },
    yearly: { itemKey: "pro_yearly", label: "£190 yearly" }
  },
  team_monthly: {
    monthly: { itemKey: "team_monthly", label: "£49 monthly" },
    yearly: { itemKey: "team_yearly", label: "£490 yearly" }
  }
};

function formatStorageFromMB(valueMB: number) {
  if (!Number.isFinite(valueMB) || valueMB <= 0) return "0 MB";
  if (valueMB >= 1024) return Math.round((valueMB / 1024) * 10) / 10 + " GB";
  return Math.round(valueMB) + " MB";
}

function isOwnerLike(role: string) {
  const normalized = role.toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

export default function PlanPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [checkoutLoadingKey, setCheckoutLoadingKey] = useState<StripeBillingItemKey | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);

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
        const loadedCounts = await loadDashboardCounts(loadedWorkspace.id);
        if (cancelled) return;
        setCounts(loadedCounts);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load billing data.");
        }
      } finally {
        if (!cancelled) setLoadingWorkspace(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const storagePercent = useMemo(() => {
    if (!workspace || !counts) return 0;
    return usagePercent(counts.estimatedFileUsageMB, workspace.billingStorageLimitMB);
  }, [counts, workspace]);

  async function handleManageBilling() {
    if (!workspace || billingLoading) return;
    setBillingLoading(true);
    setBillingMessage(null);
    try {
      const result = await createStripeCustomerPortalSession({ companyId: workspace.id });
      if (result.configured && result.url) {
        window.location.assign(result.url);
        return;
      }
      setBillingMessage(result.message || "Billing setup coming soon.");
    } catch (portalError) {
      setBillingMessage(portalError instanceof Error ? portalError.message : "Could not open billing portal.");
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleTestCheckout(itemKey: StripeBillingItemKey) {
    if (!workspace || checkoutLoadingKey) return;
    setCheckoutLoadingKey(itemKey);
    setBillingMessage(null);
    try {
      const result = await createStripeCheckoutSession({ itemKey, companyId: workspace.id });
      if (result.configured && result.url) {
        window.location.assign(result.url);
        return;
      }
      setBillingMessage(result.message || "Stripe test checkout is not configured yet.");
    } catch (checkoutError) {
      setBillingMessage(checkoutError instanceof Error ? checkoutError.message : "Could not create checkout session.");
    } finally {
      setCheckoutLoadingKey(null);
    }
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingWorkspace ? <LoadingScreen /> : null}

      <section className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div className="pill">Plan & Billing</div>
        <h1 style={{ fontSize: 36, lineHeight: 1.05, margin: "14px 0 8px" }}>Membership, storage and access</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Test-mode subscription checkout for Lite, Pro and Team can be configured here. No live charges are enabled until the live billing switch is deliberately activated.
        </p>
      </section>

      {error ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <div className="pill">Billing error</div>
          <h2 style={{ margin: "12px 0 6px" }}>Could not load plan information</h2>
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        </section>
      ) : null}

      {workspace && counts ? (
        <>
          <section className="grid" style={{ gridTemplateColumns: "1.35fr 0.65fr", gap: 18, marginBottom: 18 }}>
            <article className="card" style={{ padding: 22 }}>
              <div className="pill">Current plan</div>
              <h2 style={{ margin: "12px 0 6px", fontSize: 30 }}>{workspace.billingPlanName}</h2>
              <p style={{ color: "var(--muted)", marginTop: 0 }}>
                Workspace: <strong>{workspace.name}</strong> · Role: <strong>{workspace.roleLabel}</strong> · Source: <strong>{workspace.billingPlanSource}</strong>
              </p>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginTop: 18 }}>
                <MiniMetric title="Status" value={workspace.billingStatus} note={workspace.billingProviderRawStatus || "Workspace billing state"} />
                <MiniMetric title="Orders" value={String(counts.orderCount)} note="Existing data" />
                <MiniMetric title="Team limit" value={String(workspace.billingTeamMemberLimit)} note="Members allowed" />
                <MiniMetric title="Storage" value={formatStorageFromMB(workspace.billingStorageLimitMB)} note="Base + add-ons" />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
                <button className="button secondary" type="button" onClick={handleManageBilling} disabled={!isOwnerLike(workspace.role) || billingLoading}>
                  {billingLoading ? "Opening billing..." : "Manage Billing"}
                </button>
                <Link className="button secondary" href="/pricing">View Pricing</Link>
                {!isOwnerLike(workspace.role) ? (
                  <span className="pill">Owner/admin only</span>
                ) : null}
              </div>
              {billingMessage ? <p style={{ color: "var(--muted)", marginBottom: 0 }}>{billingMessage}</p> : null}
              <p style={{ color: "var(--muted)", marginBottom: 0, fontSize: 13 }}>
                Stripe customer: {workspace.billingCustomerId || "not connected"} · Subscription: {workspace.billingSubscriptionId || "not connected"}
              </p>
            </article>

            <article className="card" style={{ padding: 22 }}>
              <div className="pill">Storage usage</div>
              <h2 style={{ margin: "12px 0 6px" }}>{storagePercent}% used</h2>
              <p style={{ color: "var(--muted)", marginTop: 0 }}>
                {counts.estimatedFileUsageMB} MB used of {formatStorageFromMB(workspace.billingStorageLimitMB)}.
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: storagePercent + "%" }} />
              </div>
              <p style={{ color: "var(--muted)", marginBottom: 0, fontSize: 13 }}>
                This estimate uses file metadata from loaded orders. Server-side recalculation can be connected later.
              </p>
            </article>
          </section>

          <section className="card" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div className="pill">Important rule</div>
                <h2 style={{ margin: "12px 0 6px" }}>Expired subscriptions fall back to Free/Demo</h2>
                <p style={{ color: "var(--muted)", margin: 0, maxWidth: 760 }}>
                  If a Lite, Pro or Team subscription expires, the workspace falls back to Free Demo access. Existing orders and customers remain viewable and exportable, so users are never locked out of their own data.
                </p>
              </div>
              <Link className="button secondary" href="/export">Open Export</Link>
            </div>
          </section>

          <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", marginBottom: 18 }}>
            {Object.values(PLAN_ENTITLEMENTS).map(plan => (
              <PlanCard
                key={plan.plan}
                plan={plan}
                active={plan.plan === workspace.billingPlan}
                canManage={isOwnerLike(workspace.role)}
                checkoutLoadingKey={checkoutLoadingKey}
                onCheckout={handleTestCheckout}
              />
            ))}
          </section>

          <section className="card" style={{ padding: 22, marginBottom: 18 }}>
            <div className="pill">Feature matrix</div>
            <h2 style={{ margin: "12px 0 6px" }}>What each plan unlocks</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              These keys should stay shared between the app, web portal and Firebase plan guards.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    {Object.values(PLAN_ENTITLEMENTS).map(plan => <th key={plan.plan}>{plan.title}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map(featureKey => (
                    <tr key={featureKey}>
                      <td style={{ fontWeight: 900 }}>{FEATURE_LABELS[featureKey]}</td>
                      {Object.values(PLAN_ENTITLEMENTS).map(plan => (
                        <td key={plan.plan + "-" + featureKey}>{plan.features[featureKey] ? "Included" : "Locked"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ padding: 22 }}>
            <div className="pill">Storage add-ons</div>
            <h2 style={{ margin: "12px 0 6px" }}>Future 100 GB / 200 GB packages</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              These packages are placeholders for the web billing phase. They should increase storage on top of the base plan instead of changing the whole plan.
            </p>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
              {ADD_ONS.map(addon => (
                <article key={addon.id} className="card" style={{ padding: 18, background: "rgba(255,255,255,0.62)", boxShadow: "none" }}>
                  <div className="pill">+{addon.storageGB} GB</div>
                  <h3 style={{ margin: "12px 0 6px" }}>{addon.title}</h3>
                  <p style={{ color: "var(--muted)", marginTop: 0 }}>{addon.note}</p>
                  <button className="button secondary" disabled>
                    Billing setup coming soon
                  </button>
                </article>
              ))}
            </div>
            {!isOwnerLike(workspace.role) ? (
              <p style={{ color: "var(--muted)", marginBottom: 0 }}>
                Only workspace owners/admins should be able to manage billing or add-ons.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function MiniMetric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="card" style={{ padding: 16, background: "rgba(255,255,255,0.62)", boxShadow: "none" }}>
      <div className="pill">{title}</div>
      <div className="metric" style={{ fontSize: 24 }}>{value}</div>
      <p style={{ color: "var(--muted)", margin: 0 }}>{note}</p>
    </article>
  );
}

function PlanCard({
  plan,
  active,
  canManage,
  checkoutLoadingKey,
  onCheckout
}: {
  plan: PlanEntitlements;
  active: boolean;
  canManage: boolean;
  checkoutLoadingKey: StripeBillingItemKey | null;
  onCheckout: (itemKey: StripeBillingItemKey) => void;
}) {
  const checkout = PLAN_CHECKOUT_OPTIONS[plan.plan];

  return (
    <article className="card" style={{ padding: 20, background: active ? "var(--accent-soft)" : "rgba(255,255,255,0.62)" }}>
      <div className="pill">{active ? "Current plan" : plan.purchaseModel}</div>
      <h3 style={{ margin: "12px 0 6px", fontSize: 23 }}>{plan.title}</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Orders: {plan.orderLimit ?? "Unlimited"}<br />
        Customers: {plan.customerLimit ?? "Unlimited"}<br />
        Client Files storage: {plan.features.client_files ? storageLimitLabel(plan) : "Not included"}<br />
        Team members: {plan.teamMemberLimit}
      </p>
      <div className="grid" style={{ gap: 8 }}>
        {Object.entries(plan.features).filter(([, enabled]) => enabled).slice(0, 4).map(([key]) => (
          <span key={key} className="pill">{FEATURE_LABELS[key as FeatureKey]}</span>
        ))}
      </div>
      {checkout ? (
        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          <div className="pill">Stripe test mode</div>
          <button
            className="button secondary"
            type="button"
            disabled={!canManage || checkoutLoadingKey !== null}
            onClick={() => onCheckout(checkout.monthly.itemKey)}
          >
            {checkoutLoadingKey === checkout.monthly.itemKey ? "Opening checkout..." : `Test ${checkout.monthly.label}`}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!canManage || checkoutLoadingKey !== null}
            onClick={() => onCheckout(checkout.yearly.itemKey)}
          >
            {checkoutLoadingKey === checkout.yearly.itemKey ? "Opening checkout..." : `Test ${checkout.yearly.label}`}
          </button>
        </div>
      ) : null}
    </article>
  );
}
