import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

// The customer's side of an estimate. No sign-in: the token in the URL is the
// only thing that identifies the document, and the server decides what comes
// back. Nothing here knows the workspace or the order it belongs to.

export type PublicEstimateLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PublicEstimate = {
  number: string;
  version: number;
  status: string;
  currency: string;
  lineItems: PublicEstimateLine[];
  subtotal: number;
  taxRate: number;
  taxType: string;
  taxAmount: number;
  total: number;
  terms: string;
  notes: string;
  validUntilMs: number;
  createdAtMs: number;
  businessName: string;
  logoUrl: string;
  footerNote: string;
  customerFirstName: string;
  replacesNumber: string;
  alreadyDecided: boolean;
  decision: string;
  decidedAtMs: number;
  decidedByName: string;
  expiresAtMs: number;
};

export type EstimateDecisionResult = {
  ok?: boolean;
  alreadyDecided?: boolean;
  decision?: string;
  decidedAtMs?: number;
  decidedByName?: string;
};

// A stranger should never see a raw Firebase status code, and the message must
// not hint at whether a token exists.
function visitorError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (/resource-exhausted/i.test(raw)) {
    return "Too many attempts from this connection. Please try again a little later.";
  }
  if (/not-found/i.test(raw)) {
    return "This link is no longer available. Please ask for a new one.";
  }
  const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
  if (!cleaned || /^(internal|unknown|unavailable|cancelled|deadline-exceeded|permission-denied)$/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export async function loadEstimateForVisitor(token: string): Promise<PublicEstimate> {
  try {
    const callable = httpsCallable<{ token: string }, { ok?: boolean; estimate?: PublicEstimate }>(
      functions,
      "getEstimateForVisitor"
    );
    const result = await callable({ token });
    const estimate = result.data?.estimate;
    if (!estimate) throw new Error("This estimate could not be opened.");
    return estimate;
  } catch (error) {
    throw new Error(visitorError(error, "This estimate could not be opened just now."));
  }
}

export async function postEstimateDecision(input: {
  token: string;
  decision: "approved" | "declined";
  approvedByName: string;
  approvedByEmail?: string;
  declineReason?: string;
  signaturePngBase64?: string;
}): Promise<EstimateDecisionResult> {
  try {
    const callable = httpsCallable<Record<string, unknown>, EstimateDecisionResult>(
      functions,
      "postEstimateDecision"
    );
    const result = await callable({ ...input });
    return result.data || {};
  } catch (error) {
    throw new Error(visitorError(error, "That could not be recorded just now. Please try again."));
  }
}

export function formatEstimateMoney(value: number, currency: string) {
  const symbol = currency === "GBP" || !currency ? "£" : currency;
  const amount = Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}${symbol}${amount}`;
}

export function formatEstimateDateTime(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
