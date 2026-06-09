import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type StripeBillingItemKey =
  | "lite_monthly"
  | "lite_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "team_monthly"
  | "team_yearly"
  | "additional_team_seat_monthly"
  | "additional_team_seat_yearly"
  | "storage_100gb"
  | "storage_100gb_yearly"
  | "storage_200gb"
  | "storage_200gb_yearly";

export type StripeBillingActionResult = {
  ok?: boolean;
  configured?: boolean;
  url?: string;
  sessionId?: string;
  mode?: string;
  itemKey?: string;
  message?: string;
};

export type StripeEntitlementResyncResult = {
  ok?: boolean;
  configured?: boolean;
  resynced?: boolean;
  message?: string;
  workspaceId?: string;
  foundSubscriptionCount?: number;
  recognisedSubscriptionCount?: number;
  staleRecordsDeactivated?: number;
  effectivePlan?: string;
  effectiveProvider?: string;
  activePlanSubscriptionCount?: number;
  hasMultipleActiveSubscriptions?: boolean;
};

function currentOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export async function createStripeCheckoutSession({
  itemKey,
  companyId,
  quantity,
  successUrl,
  cancelUrl
}: {
  itemKey: StripeBillingItemKey;
  companyId?: string;
  quantity?: number;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const callable = httpsCallable<Record<string, unknown>, StripeBillingActionResult>(functions, "createStripeCheckoutSession");
  const origin = currentOrigin();
  const result = await callable({
    itemKey,
    companyId,
    quantity,
    successUrl: successUrl || (origin ? origin + "/plan?billing=success" : undefined),
    cancelUrl: cancelUrl || (origin ? origin + "/pricing?billing=cancelled" : undefined)
  });
  return result.data;
}

export async function createStripeCustomerPortalSession({
  companyId,
  returnUrl
}: {
  companyId?: string;
  returnUrl?: string;
}) {
  const callable = httpsCallable<Record<string, unknown>, StripeBillingActionResult>(functions, "createStripeCustomerPortalSession");
  const origin = currentOrigin();
  const result = await callable({
    companyId,
    returnUrl: returnUrl || (origin ? origin + "/plan" : undefined)
  });
  return result.data;
}

export async function resyncStripeWorkspaceEntitlements({
  companyId
}: {
  companyId?: string;
}) {
  const callable = httpsCallable<Record<string, unknown>, StripeEntitlementResyncResult>(
    functions,
    "resyncStripeWorkspaceEntitlements"
  );
  const result = await callable({ companyId });
  return result.data;
}
