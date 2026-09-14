import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { StripeConnectionSummary } from "@/lib/studioflow/integrations";

// The workspace's OWN Stripe account (Connect) — not NivaDesk's subscription
// billing, which is a different Stripe account entirely.
//
// Every value here comes from the server. The account id is deliberately not
// among them: `publicSummary()` has no field for it and no callable returns it,
// so there is nothing for a screen to leak. `requirementsSummary` is a COUNT
// and a list of Stripe's own requirement KEYS — never the values a person
// submitted.

const call = <TIn, TOut>(name: string) => httpsCallable<TIn, TOut>(functions, name);

export type StripeConnectionView = {
  configured: boolean;
  connection: StripeConnectionSummary | null;
};

/** Anyone in the workspace may ask whether payments work. */
export async function getStripeConnection(companyId: string): Promise<StripeConnectionView> {
  const result = await call<{ companyId: string }, { ok: boolean; configured: boolean; connection: StripeConnectionSummary }>(
    "getStripePaymentConnection")({ companyId });
  return {
    configured: result.data?.configured === true,
    connection: result.data?.connection ?? null,
  };
}

/**
 * Start (or resume) onboarding. Owner only.
 *
 * The URL is Stripe's own hosted page, single-use and short-lived by their
 * design — it is the one provider value a client is meant to hold. Resuming an
 * existing account reuses it rather than opening a second one.
 */
export async function beginStripeOnboarding(companyId: string) {
  return (await call<{ companyId: string }, { ok: boolean; url: string; expiresAt: number; connection: StripeConnectionSummary }>(
    "beginStripeConnectOnboarding")({ companyId })).data;
}

/** Re-read the account from Stripe and re-derive the status. Owner only. */
export async function refreshStripeConnection(companyId: string) {
  return (await call<{ companyId: string }, { ok: boolean; connection: StripeConnectionSummary }>(
    "refreshStripePaymentConnection")({ companyId })).data;
}

/**
 * Remove our link. Owner only.
 *
 * `accountKeptAtProvider` is the server telling the truth about what it did NOT
 * do: the Stripe account still exists, because it is the workspace's and holds
 * their money. Deleting it is theirs to do in their own Stripe dashboard.
 */
export async function disconnectStripeConnection(companyId: string) {
  return (await call<{ companyId: string }, { ok: boolean; connection: StripeConnectionSummary; accountKeptAtProvider: boolean }>(
    "disconnectStripePaymentConnection")({ companyId })).data;
}

/**
 * What each status means to the person reading it.
 *
 * Mirrors `payments/connectionState.js capabilitiesFor()` rather than deciding
 * anything of its own: if that table changes, this reads wrong and the fix is
 * there, not here.
 */
export function stripeStatusLabel(status: StripeConnectionSummary["status"] | ""): string {
  switch (status) {
    case "ready": return "Ready to take payments";
    case "restricted": return "Stripe needs more information";
    case "onboarding": return "Finish setting up with Stripe";
    case "error": return "Stripe could not be reached";
    default: return "Not connected";
  }
}
