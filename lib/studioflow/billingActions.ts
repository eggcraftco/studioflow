import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type StripeBillingItemKey =
  | "lite_monthly"
  | "lite_yearly"
  | "pro_monthly"
  | "pro_yearly"
  | "team_monthly"
  | "team_yearly"
  | "storage_100gb"
  | "storage_200gb";

export type StripeBillingActionResult = {
  ok?: boolean;
  configured?: boolean;
  url?: string;
  sessionId?: string;
  mode?: string;
  itemKey?: string;
  message?: string;
};

function currentOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export async function createStripeCheckoutSession({
  itemKey,
  companyId,
  successUrl,
  cancelUrl
}: {
  itemKey: StripeBillingItemKey;
  companyId?: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const callable = httpsCallable<Record<string, unknown>, StripeBillingActionResult>(functions, "createStripeCheckoutSession");
  const origin = currentOrigin();
  const result = await callable({
    itemKey,
    companyId,
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
