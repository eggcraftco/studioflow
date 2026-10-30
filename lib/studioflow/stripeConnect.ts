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
  /** Why `configured` is false, when it is: "not_in_pilot" (this workspace is
   *  outside the Payment Links pilot), "rail_disabled" (the server has the
   *  rail switched off) or "not_connected" (no Stripe account yet — asked
   *  without purpose "settings"). "" when configured. */
  reason: string;
  connection: StripeConnectionSummary | null;
  /** Settings only (SC-8): the workspace's own country if Stripe serves it, and
   *  the ISO codes the owner may choose from before the first connect. */
  onboarding: { country: string; supportedCountries: string[] } | null;
};

/**
 * Anyone in the workspace may ask whether payments work.
 *
 * `purpose: "settings"` is the Settings card asking, where connecting starts:
 * it hears `configured: true` before any account exists. Every other surface
 * (the order card, Banking — and the store apps, which send no purpose) hears
 * `configured: false, reason: "not_connected"` until the workspace has a
 * Stripe account, so it draws nothing rather than a button that cannot work.
 */
export async function getStripeConnection(companyId: string, purpose: "" | "settings" = ""): Promise<StripeConnectionView> {
  const result = await call<{ companyId: string; purpose?: string }, {
    ok: boolean; configured: boolean; reason?: string; connection: StripeConnectionSummary;
    onboarding?: { country?: string; supportedCountries?: string[] };
  }>("getStripePaymentConnection")(purpose ? { companyId, purpose } : { companyId });
  const onboarding = result.data?.onboarding;
  return {
    configured: result.data?.configured === true,
    reason: String(result.data?.reason ?? ""),
    connection: result.data?.connection ?? null,
    onboarding: onboarding
      ? {
          country: String(onboarding.country ?? ""),
          supportedCountries: Array.isArray(onboarding.supportedCountries) ? onboarding.supportedCountries.map(String) : [],
        }
      : null,
  };
}

/**
 * Whether this workspace may see Payment Links at all (S2 pilot gate).
 *
 * The SERVER decides — getStripePaymentConnection says `configured: false` with
 * reason "not_in_pilot" for every workspace outside the pilot, and refuses the
 * other eight callables for them. This is how the screens follow that answer:
 * a surface renders nothing until this resolves true, so a workspace outside
 * the pilot sees no tab, no card, no button and no error.
 *
 * One read per workspace per page load, shared by every surface that asks. A
 * failed read answers false and is not remembered, so the next surface to ask
 * tries again — hiding is the safe direction, and an error is never shown for
 * a feature the workspace may not have.
 */
const availability = new Map<string, Promise<boolean>>();
export function paymentLinksAvailable(companyId: string): Promise<boolean> {
  const id = String(companyId || "").trim();
  if (!id) return Promise.resolve(false);
  const known = availability.get(id);
  if (known) return known;
  const pending = getStripeConnection(id)
    .then((view) => view.configured === true)
    .catch(() => {
      availability.delete(id);
      return false;
    });
  availability.set(id, pending);
  return pending;
}

/**
 * Start (or resume) onboarding. Owner only.
 *
 * The URL is Stripe's own hosted page, single-use and short-lived by their
 * design — it is the one provider value a client is meant to hold. Resuming an
 * existing account reuses it rather than opening a second one.
 */
export async function beginStripeOnboarding(companyId: string, country = "") {
  // SC-8: the business's country, chosen on the Settings card before the first
  // account is opened. Ignored by the server when the workspace already has one.
  const code = country.trim().toUpperCase();
  return (await call<{ companyId: string; country?: string }, { ok: boolean; url: string; expiresAt: number; connection: StripeConnectionSummary }>(
    "beginStripeConnectOnboarding")(/^[A-Z]{2}$/.test(code) ? { companyId, country: code } : { companyId })).data;
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

// ---- Refunds from NivaDesk (SL-21 / SL-22, 30 Oct 2026) ------------------------------------------------------

/**
 * What a payment request's summary says about refunding it (SL-22), beside the
 * fields every row already has.
 *
 * All three are OPTIONAL on purpose: a server from before refunds sends none of
 * them, and a row without `canRefund === true` draws no Refund button — never a
 * button the server would refuse. The server decides all three; nothing here
 * recomputes them.
 */
export type PaymentRequestRefundFields = {
  /** The most that can still be refunded, in minor units: paid − refunds − refunds still in flight. */
  refundableMinor?: number;
  /** Refunds Stripe is holding as pending (the business's balance cannot cover them yet), in minor units. */
  refundPendingMinor?: number;
  /** THIS person may refund this row now: the owner, something left, one payment, and the deployment's own mode. */
  canRefund?: boolean;
};

/** The two reasons NivaDesk offers. "fraudulent" is Stripe's too, but it also blocks the card, so it stays in Stripe. */
export type RefundReason = "requested_by_customer" | "duplicate";

export type RefundOrderPaymentInput = {
  companyId: string;
  orderId: string;
  paymentRequestId: string;
  /** Integer minor units, > 0, at most `refundableMinor`. The server and then Stripe check again. */
  amountMinor: number;
  reason: RefundReason;
  /** Made once per submit (`newClientRefundId`) and sent again when the same submit is retried. */
  clientRefundId: string;
};

export type RefundOrderPaymentResult = {
  ok: boolean;
  /** `status` is Stripe's own: succeeded | pending | requires_action | failed | canceled. */
  refund: { status: string; amountMinor: number; currency: string };
  /** The request's summary after the refund, as the list would send it. */
  request: (PaymentRequestRefundFields & Record<string, unknown>) | null;
};

/**
 * The id that makes a refund happen once.
 *
 * The server keeps one attempt per id and passes it to Stripe as the
 * idempotency key, so the SAME id sent twice is one refund — which is why a
 * retry of the same submit must send it again rather than make a new one.
 * Letters and digits only (the server accepts `^[A-Za-z0-9_-]{8,64}$`).
 */
export function newClientRefundId(): string {
  const source = (globalThis as { crypto?: Crypto }).crypto;
  if (source && typeof source.randomUUID === "function") return source.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  if (source && typeof source.getRandomValues === "function") source.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Refund (part of) a paid payment link to the customer's card. Owner only.
 *
 * The money comes from the business's own Stripe balance and Stripe keeps its
 * fee. A `pending` answer is a refund Stripe has accepted but will send only
 * when that balance can cover it — not a refund that failed.
 */
export async function refundOrderPayment(input: RefundOrderPaymentInput): Promise<RefundOrderPaymentResult> {
  const data = (await call<RefundOrderPaymentInput, Partial<RefundOrderPaymentResult>>("refundOrderPayment")({
    companyId: input.companyId,
    orderId: input.orderId,
    paymentRequestId: input.paymentRequestId,
    amountMinor: input.amountMinor,
    reason: input.reason,
    clientRefundId: input.clientRefundId,
  })).data;
  return {
    ok: data?.ok === true,
    refund: {
      status: String(data?.refund?.status ?? ""),
      amountMinor: Math.max(0, Math.trunc(Number(data?.refund?.amountMinor) || 0)),
      currency: String(data?.refund?.currency ?? ""),
    },
    request: data?.request ?? null,
  };
}

/** Why the server refused a refund: `details.reason` on the callable error, the way orders.ts reads `pilot_off`. */
export type RefundRefusal = {
  /** `details.reason`, or "" when the error carried none (a lost reply, a network failure). */
  reason: string;
  /** The sentence to show, a key in the translation table. "{amount}" stands for the most that can be refunded. */
  text: string;
  /** `details.refundableMinor` when the server sent it (refund_amount_too_large), else null. */
  refundableMinor: number | null;
};

export function refundRefusal(error: unknown): RefundRefusal {
  const details = (error as { details?: { reason?: unknown; refundableMinor?: unknown } } | null)?.details;
  const reason = typeof details?.reason === "string" ? details.reason : "";
  const most = Number(details?.refundableMinor);
  const code = String((error as { code?: string } | null)?.code || "");
  return {
    reason,
    text: refundRefusalText(reason, code),
    refundableMinor: details?.refundableMinor != null && Number.isInteger(most) && most >= 0 ? most : null,
  };
}

/**
 * One sentence per refusal the server can give (the contract's `details.reason`
 * list). Never Stripe's own message: the server does not pass it on, and the
 * screen would not show it if it did.
 */
export function refundRefusalText(reason: string, code = ""): string {
  switch (reason) {
    case "refund_not_allowed": return "Only the workspace owner can refund a payment.";
    case "refund_not_refundable": return "This payment has nothing left to refund.";
    case "refund_disputed": return "The customer has disputed this payment, so it cannot be refunded here. Answer the dispute in your Stripe Dashboard.";
    case "refund_multiple_payments": return "This link was paid more than once. Refund it in your Stripe Dashboard.";
    case "refund_mode_mismatch": return "This payment was made in Stripe's other mode (test or live), so it cannot be refunded from here.";
    case "refund_account_changed": return "This payment went to a Stripe account that is no longer connected here. Refund it from that account's Stripe Dashboard.";
    case "refund_amount_invalid": return "That refund amount is not valid.";
    case "refund_amount_too_large": return "That is more than can be refunded. The most you can refund is {amount}.";
    case "refund_in_progress": return "Another refund for this payment is still being made. Wait a moment, then try again.";
    case "refund_provider_error": return "Stripe could not make this refund just now. Try again in a moment; if it keeps failing, refund it in your Stripe Dashboard.";
    default: break;
  }
  if (/permission-denied/.test(code)) return "Only the workspace owner can refund a payment.";
  if (/unauthenticated/.test(code)) return "Sign in again to see payment links.";
  // No reason means no answer reached the screen: the refund may or may not have been made. Trying again
  // sends the same id, so it is never made twice.
  return "The refund could not be confirmed. Try again; it will not be made twice.";
}

/** What a refund the server accepted turned into, by Stripe's status. */
export function refundResult(status: string): { tone: "done" | "pending" | "problem"; text: string } {
  switch (status) {
    case "succeeded": return { tone: "done", text: "Refunded" };
    case "pending": return { tone: "pending", text: "Refund pending. Stripe will finish this when your Stripe balance allows." };
    case "requires_action": return { tone: "problem", text: "Stripe needs something more before this refund can finish. Check it in your Stripe Dashboard." };
    default: return { tone: "problem", text: "Stripe did not complete this refund. Check it in your Stripe Dashboard." };
  }
}
