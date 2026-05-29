export type StudioBillingPlan = "demo" | "lifetime_lite" | "pro_monthly" | "team_monthly";

export type FeatureKey =
  | "orders_read"
  | "orders_create"
  | "export_data"
  | "financial_basic"
  | "financial_advanced"
  | "client_files"
  | "card_customization"
  | "team_access"
  | "storage_addons"
  | "workspace_logo_upload"
  | "chatgpt_app"
  | "personal_notes"
  | "order_notes"
  | "dashboard_summary"
  | "financial_summary"
  | "messages";

export type PlanEntitlements = {
  plan: StudioBillingPlan;
  title: string;
  purchaseModel: string;
  orderLimit: number | null;
  customerLimit: number | null;
  storageLimitMB: number;
  teamMemberLimit: number;
  includedTeamSeats?: number;
  selfServiceMaxTeamSeats?: number;
  additionalSeatMonthlyPriceGBP?: number;
  additionalSeatYearlyPriceGBP?: number;
  features: Record<FeatureKey, boolean>;
};

export const PLAN_ENTITLEMENTS: Record<StudioBillingPlan, PlanEntitlements> = {
  demo: {
    plan: "demo",
    title: "Free Demo",
    purchaseModel: "Demo",
    orderLimit: 5,
    customerLimit: 3,
    storageLimitMB: 50,
    teamMemberLimit: 1,
    features: {
      orders_read: true,
      orders_create: true,
      export_data: true,
      financial_basic: true,
      financial_advanced: false,
      client_files: false,
      card_customization: false,
      team_access: false,
      storage_addons: false,
      workspace_logo_upload: false,
      chatgpt_app: false,
      personal_notes: true,
      order_notes: true,
      dashboard_summary: true,
      financial_summary: true,
      messages: false
    }
  },
  lifetime_lite: {
    plan: "lifetime_lite",
    title: "NivaDesk Lite",
    purchaseModel: "Monthly or Annual Subscription",
    orderLimit: null,
    customerLimit: null,
    storageLimitMB: 250,
    teamMemberLimit: 1,
    features: {
      orders_read: true,
      orders_create: true,
      export_data: true,
      financial_basic: true,
      financial_advanced: false,
      client_files: false,
      card_customization: true,
      team_access: false,
      storage_addons: false,
      workspace_logo_upload: false,
      chatgpt_app: false,
      personal_notes: true,
      order_notes: true,
      dashboard_summary: true,
      financial_summary: true,
      messages: false
    }
  },
  pro_monthly: {
    plan: "pro_monthly",
    title: "NivaDesk Pro",
    purchaseModel: "Monthly Subscription",
    orderLimit: null,
    customerLimit: null,
    storageLimitMB: 10240,
    teamMemberLimit: 1,
    features: {
      orders_read: true,
      orders_create: true,
      export_data: true,
      financial_basic: true,
      financial_advanced: true,
      client_files: true,
      card_customization: true,
      team_access: false,
      storage_addons: true,
      workspace_logo_upload: true,
      chatgpt_app: true,
      personal_notes: true,
      order_notes: true,
      dashboard_summary: true,
      financial_summary: true,
      messages: false
    }
  },
  team_monthly: {
    plan: "team_monthly",
    title: "NivaDesk Team",
    purchaseModel: "Monthly Subscription",
    orderLimit: null,
    customerLimit: null,
    storageLimitMB: 51200,
    teamMemberLimit: 5,
    includedTeamSeats: 5,
    selfServiceMaxTeamSeats: 10,
    additionalSeatMonthlyPriceGBP: 5,
    additionalSeatYearlyPriceGBP: 50,
    features: {
      orders_read: true,
      orders_create: true,
      export_data: true,
      financial_basic: true,
      financial_advanced: true,
      client_files: true,
      card_customization: true,
      team_access: true,
      storage_addons: true,
      workspace_logo_upload: true,
      chatgpt_app: true,
      personal_notes: true,
      order_notes: true,
      dashboard_summary: true,
      financial_summary: true,
      messages: true
    }
  }
};

const LEGACY_PLAN_ALIASES: Record<string, StudioBillingPlan> = {
  liteLifetime: "lifetime_lite",
  proMonthly: "pro_monthly",
  teamMonthly: "team_monthly",
  lifetimeLite: "lifetime_lite"
};

export function normalizeBillingPlan(plan: string | undefined | null): StudioBillingPlan | null {
  if (!plan) return null;
  if (plan in PLAN_ENTITLEMENTS) return plan as StudioBillingPlan;
  return LEGACY_PLAN_ALIASES[plan] ?? null;
}

export function entitlementsForPlan(
  plan: StudioBillingPlan | string | undefined | null,
  fallback: StudioBillingPlan = "demo"
): PlanEntitlements {
  const normalized = normalizeBillingPlan(plan);
  return PLAN_ENTITLEMENTS[normalized ?? fallback];
}

export function storageLimitLabel(entitlements: PlanEntitlements) {
  if (entitlements.storageLimitMB >= 1024) {
    return `${Math.round(entitlements.storageLimitMB / 1024)} GB`;
  }
  return `${entitlements.storageLimitMB} MB`;
}

export function usagePercent(usedMB: number, limitMB: number) {
  if (limitMB <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((usedMB / limitMB) * 100)));
}
