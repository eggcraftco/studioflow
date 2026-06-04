import type { ReactNode } from "react";
import { storageLimitLabel, type PlanEntitlements } from "@/lib/studioflow/plans";

const PLAN_ICON: Record<string, string> = {
  demo: "✦",
  lifetime_lite: "✓",
  pro_monthly: "⚡",
  team_monthly: "👥"
};

const PLAN_DESCRIPTION: Record<string, string> = {
  demo: "Best for testing the app with a small sample workspace.",
  lifetime_lite: "Best for solo makers who want unlimited order tracking without files, AI tools or team access.",
  pro_monthly: "Best for active studios that need cloud files and advanced workflows.",
  team_monthly: "Best for studios working with multiple people in one shared workspace."
};

function orderText(plan: PlanEntitlements) {
  return plan.orderLimit == null ? "Unlimited orders" : `${plan.orderLimit} orders`;
}

function customerText(plan: PlanEntitlements) {
  return plan.customerLimit == null ? "Unlimited customers" : `${plan.customerLimit} customers`;
}

function planFeatureRows(plan: PlanEntitlements) {
  const proOrTeam = plan.plan === "pro_monthly" || plan.plan === "team_monthly";
  const liteOrAbove = plan.plan !== "demo";
  return [
    { title: orderText(plan), enabled: true },
    { title: customerText(plan), enabled: true },
    { title: `Storage: ${storageLimitLabel(plan)}`, enabled: plan.features.client_files },
    { title: "Client Files", enabled: plan.features.client_files },
    { title: "Share Sheet", enabled: proOrTeam },
    { title: "Team Access", enabled: plan.features.team_access },
    { title: "Advanced Dashboard", enabled: proOrTeam },
    { title: "Card Customization", enabled: liteOrAbove },
    { title: "Card Profile Sync", enabled: plan.plan === "team_monthly" }
  ];
}

export function PlanComparisonCard({
  plan,
  currentPlanKey,
  footer
}: {
  plan: PlanEntitlements;
  currentPlanKey: string;
  footer?: ReactNode;
}) {
  const isCurrent = plan.plan === currentPlanKey;
  return (
    <article className={`plan-compare-card plan-${plan.plan}${isCurrent ? " current" : ""}`}>
      <div className="plan-compare-head">
        <span className="plan-compare-icon" aria-hidden="true">{PLAN_ICON[plan.plan] ?? "✦"}</span>
        <div className="plan-compare-titles">
          <div className="plan-compare-name">
            <strong>{plan.title}</strong>
            {isCurrent ? <span className="plan-compare-badge">Current plan</span> : null}
          </div>
          <span className="plan-compare-sub">{plan.purchaseModel}</span>
        </div>
      </div>
      <p className="plan-compare-desc">{PLAN_DESCRIPTION[plan.plan] ?? ""}</p>
      <div className="plan-compare-features">
        {planFeatureRows(plan).map(row => (
          <span key={row.title} className={row.enabled ? "feature enabled" : "feature"}>
            <i aria-hidden="true">{row.enabled ? "✓" : "🔒"}</i>
            <span>{row.title}</span>
          </span>
        ))}
      </div>
      {footer ? <div className="plan-compare-footer">{footer}</div> : null}
    </article>
  );
}
