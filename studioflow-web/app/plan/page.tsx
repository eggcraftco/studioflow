"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PlanComparisonCard } from "@/components/PlanComparisonCard";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  PLAN_ENTITLEMENTS,
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
  resyncStripeWorkspaceEntitlements,
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
  messages: "Messages"
};

const ADD_ONS: {
  title: string;
  storageGB: number;
  note: string;
  monthly: { itemKey: StripeBillingItemKey; label: string };
  yearly: { itemKey: StripeBillingItemKey; label: string };
}[] = [
  {
    title: "100 GB Extra Storage",
    storageGB: 100,
    note: "For studios uploading larger client file libraries.",
    monthly: { itemKey: "storage_100gb", label: "£9 / month" },
    yearly: { itemKey: "storage_100gb_yearly", label: "£90 / year" }
  },
  {
    title: "200 GB Extra Storage",
    storageGB: 200,
    note: "For heavier teams and long-term archive use.",
    monthly: { itemKey: "storage_200gb", label: "£15 / month" },
    yearly: { itemKey: "storage_200gb_yearly", label: "£150 / year" }
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

function isWorkspaceOwner(role: string) {
  return role.toLowerCase() === "owner";
}

function showInternalBillingControls(email: string) {
  if (process.env.NEXT_PUBLIC_NIVADESK_INTERNAL_BILLING_TESTS !== "true") return false;
  const allowedEmails = String(process.env.NEXT_PUBLIC_NIVADESK_INTERNAL_BILLING_TEST_EMAILS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(email.trim().toLowerCase());
}

export default function PlanPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [subscriptionRefreshLoading, setSubscriptionRefreshLoading] = useState(false);
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

  const allowInternalBillingTests = showInternalBillingControls(user?.email || "");
  // When live billing is enabled, real purchase buttons are shown to every
  // workspace owner. Otherwise only internal test accounts see (test) buttons.
  const liveBillingEnabled = process.env.NEXT_PUBLIC_NIVADESK_BILLING_LIVE === "true";
  const purchasesEnabled = liveBillingEnabled || allowInternalBillingTests;
  const purchaseLabel = (label: string) => (liveBillingEnabled ? label : `Test ${label}`);

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

  async function handleRefreshSubscriptionAccess() {
    if (!workspace || !user || subscriptionRefreshLoading || !isWorkspaceOwner(workspace.role)) return;
    setSubscriptionRefreshLoading(true);
    setBillingMessage(null);
    try {
      const result = await resyncStripeWorkspaceEntitlements({ companyId: workspace.id });
      if (!result.configured || !result.resynced) {
        setBillingMessage(result.message || "No verified Stripe subscription is connected to this workspace yet.");
        return;
      }

      const refreshedWorkspace = await loadWorkspaceContext(user.uid);
      setWorkspace(refreshedWorkspace);

      if (result.hasMultipleActiveSubscriptions) {
        setBillingMessage(
          "Subscription access refreshed. Multiple active plan subscriptions were found. The highest verified plan is active; review your subscriptions to avoid duplicate billing."
        );
      } else {
        setBillingMessage("Subscription access refreshed from the verified Stripe billing record.");
      }
    } catch (refreshError) {
      setBillingMessage(refreshError instanceof Error ? refreshError.message : "Could not refresh subscription access.");
    } finally {
      setSubscriptionRefreshLoading(false);
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
          Compare access levels, review your workspace allowance and manage a connected subscription securely.
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
                <MiniMetric
                  title={workspace.entitlements.features.team_access ? "Current seat allowance" : "Users"}
                  value={workspace.entitlements.features.team_access ? String(workspace.billingTeamMemberLimit) : "1 included"}
                  note={workspace.entitlements.features.team_access ? "Team includes 5 seats · up to 10 self-service" : "Solo workspace"}
                />
                <MiniMetric
                  title={workspace.entitlements.features.client_files ? "Client Files storage" : "Client Files"}
                  value={workspace.entitlements.features.client_files ? formatStorageFromMB(workspace.billingStorageLimitMB) : "Not included"}
                  note={workspace.entitlements.features.client_files ? "Base storage allowance" : "Available on Pro and Team"}
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
                <button className="button secondary" type="button" onClick={handleManageBilling} disabled={!isWorkspaceOwner(workspace.role) || billingLoading || subscriptionRefreshLoading}>
                  {billingLoading ? "Opening billing..." : "Manage Billing"}
                </button>
                {isWorkspaceOwner(workspace.role) ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={handleRefreshSubscriptionAccess}
                    disabled={billingLoading || subscriptionRefreshLoading}
                  >
                    {subscriptionRefreshLoading ? "Refreshing access..." : "Refresh Subscription Access"}
                  </button>
                ) : null}
                <Link className="button secondary" href="/pricing">View Pricing</Link>
                {!isWorkspaceOwner(workspace.role) ? (
                  <span className="pill">Owner only</span>
                ) : null}
              </div>
              {billingMessage ? <p style={{ color: "var(--muted)", marginBottom: 0 }}>{billingMessage}</p> : null}
              <p style={{ color: "var(--muted)", marginBottom: 0, fontSize: 13 }}>
                Billing provider: {workspace.billingEffectiveProvider || "none"} · Subscription: {workspace.billingSubscriptionId || "not connected"}
              </p>
              {workspace.billingHasMultipleActiveSubscriptions ? (
                <p style={{ color: "var(--danger)", marginBottom: 0, fontSize: 13, fontWeight: 700 }}>
                  Multiple active subscriptions detected across {workspace.billingActivePlanProviders.join(", ") || "billing providers"}. Your highest verified plan is active; manage any duplicate subscriptions to avoid duplicate billing.
                </p>
              ) : null}
            </article>

            {workspace.entitlements.features.client_files ? (
              <article className="card" style={{ padding: 22 }}>
                <div className="pill">Client Files storage</div>
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
            ) : (
              <article className="card" style={{ padding: 22 }}>
                <div className="pill">Client Files</div>
                <h2 style={{ margin: "12px 0 6px" }}>Not included</h2>
                <p style={{ color: "var(--muted)", marginTop: 0 }}>
                  Cloud file storage and file management are available on NivaDesk Pro and Team.
                </p>
                <Link className="button secondary" href="/pricing">Compare plans</Link>
              </article>
            )}
          </section>

          <section className="card" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div className="pill">Important rule</div>
                <h2 style={{ margin: "12px 0 6px" }}>Expired subscriptions fall back to Free/Demo</h2>
                <p style={{ color: "var(--muted)", margin: 0, maxWidth: 760 }}>
                  If a Lite, Pro or Team subscription expires, the workspace falls back to Free Demo access. Existing orders, customers and permitted basic data remain viewable and exportable.
                </p>
                <p style={{ color: "var(--muted)", margin: "10px 0 0", maxWidth: 760, fontSize: 13 }}>
                  Client Files and message attachment files require an active eligible paid plan. When paid access ends, opening, previewing, downloading, uploading and deleting those cloud files stops at the end of the billing period. Download files you need before your subscription ends. Stored files may be retained for up to 90 days to restore access if you resubscribe.
                </p>
              </div>
              <Link className="button secondary" href="/export">Open Export</Link>
            </div>
          </section>

          <section className="plan-compare-grid" style={{ marginBottom: 18 }}>
            {Object.values(PLAN_ENTITLEMENTS).map(plan => {
              const checkout = PLAN_CHECKOUT_OPTIONS[plan.plan];
              const isActive = plan.plan === workspace.billingPlan;
              const canManage = isWorkspaceOwner(workspace.role);
              const footer = isActive ? (
                <span>Your workspace is using this plan.</span>
              ) : checkout && purchasesEnabled ? (
                <div style={{ display: "grid", gap: 8, width: "100%" }}>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!canManage || checkoutLoadingKey !== null}
                    onClick={() => handleTestCheckout(checkout.monthly.itemKey)}
                  >
                    {checkoutLoadingKey === checkout.monthly.itemKey ? "Opening checkout..." : purchaseLabel(checkout.monthly.label)}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!canManage || checkoutLoadingKey !== null}
                    onClick={() => handleTestCheckout(checkout.yearly.itemKey)}
                  >
                    {checkoutLoadingKey === checkout.yearly.itemKey ? "Opening checkout..." : purchaseLabel(checkout.yearly.label)}
                  </button>
                </div>
              ) : null;
              return (
                <PlanComparisonCard
                  key={plan.plan}
                  plan={plan}
                  currentPlanKey={workspace.billingPlan}
                  footer={footer}
                />
              );
            })}
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
                        <td key={plan.plan + "-" + featureKey}>
                          {featureKey === "storage_addons" ? "Coming soon" : plan.features[featureKey] ? "Included" : "Locked"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ padding: 22 }}>
            <div className="pill">Storage add-ons</div>
            <h2 style={{ margin: "12px 0 6px" }}>100 GB / 200 GB packages</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Storage add-ons increase your Client Files allowance on top of the base plan without changing your plan. They require a plan that includes Client Files (Pro or Team).
            </p>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
              {ADD_ONS.map(addon => {
                const canBuyAddon =
                  isWorkspaceOwner(workspace.role) &&
                  workspace.entitlements.features.client_files;
                return (
                  <article key={addon.storageGB} className="card" style={{ padding: 18, background: "var(--panel)", boxShadow: "none" }}>
                    <div className="pill">+{addon.storageGB} GB</div>
                    <h3 style={{ margin: "12px 0 6px" }}>{addon.title}</h3>
                    <p style={{ color: "var(--muted)", marginTop: 0 }}>{addon.note}</p>
                    <p style={{ margin: "0 0 12px", fontWeight: 600 }}>
                      {addon.monthly.label} · {addon.yearly.label}
                    </p>
                    {purchasesEnabled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {([addon.monthly, addon.yearly] as const).map(option => {
                          const isCurrentAddon = workspace.storageAddonKey === option.itemKey;
                          return (
                            <button
                              key={option.itemKey}
                              className="button secondary"
                              disabled={isCurrentAddon || !canBuyAddon || checkoutLoadingKey !== null}
                              onClick={() => handleTestCheckout(option.itemKey)}
                            >
                              {isCurrentAddon
                                ? "Current add-on"
                                : checkoutLoadingKey === option.itemKey
                                  ? "Opening checkout..."
                                  : purchaseLabel(option.label)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button className="button secondary" disabled>
                        Billing setup coming soon
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            {!isWorkspaceOwner(workspace.role) ? (
              <p style={{ color: "var(--muted)", marginBottom: 0 }}>
                Only the workspace owner can manage billing or add-ons.
              </p>
            ) : !workspace.entitlements.features.client_files ? (
              <p style={{ color: "var(--muted)", marginBottom: 0 }}>
                Upgrade to Pro or Team (which include Client Files) to add extra storage.
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
    <article className="card" style={{ padding: 16, background: "var(--panel)", boxShadow: "none" }}>
      <div className="pill">{title}</div>
      <div className="metric" style={{ fontSize: 24 }}>{value}</div>
      <p style={{ color: "var(--muted)", margin: 0 }}>{note}</p>
    </article>
  );
}

