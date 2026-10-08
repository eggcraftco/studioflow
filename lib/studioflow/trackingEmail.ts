// The client half of sendOrderTrackingEmail (functions/orders/trackingEmail.js).
//
// Two calls on one callable: `preview: true` returns what the e-mail would say — recipient,
// sender identity, subject, message, carrier, number and the server-built link — and sends
// nothing; a call without it sends exactly once for the number and records the result. The
// server decides the link (an allow-list of carriers, else 17TRACK's public page, https only);
// the client never sends one.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { trackingEmailRecordFrom, type TrackingEmailRecord } from "@/lib/studioflow/trackingEmailRules";

export type TrackingEmailPreview = {
  to: string;
  customerEmail: string;
  hasCustomerEmail: boolean;
  from: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  subject: string;
  message: string;
  labels: { carrier: string; number: string; link: string; closing: string };
  carrier: string;
  carrierLabel: string;
  trackingNumber: string;
  link: string;
  linkIsGeneric: boolean;
  orderReference: string;
  locale: string;
  lastResult: TrackingEmailRecord | null;
  decision: { send: boolean; reason: string };
};

export type TrackingEmailSendResult = {
  ok: boolean;
  reason: string;
  message?: string;
  trackingEmail: TrackingEmailRecord | null;
};

type RawResponse = Record<string, unknown> & { ok?: boolean; reason?: string; message?: string; trackingEmail?: unknown; lastResult?: unknown };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function previewOrderTrackingEmail(
  workspace: WorkspaceContext,
  input: { orderId: string; language: string }
): Promise<TrackingEmailPreview> {
  const callable = httpsCallable<Record<string, unknown>, RawResponse>(functions, "sendOrderTrackingEmail");
  const response = await callable({ companyId: workspace.id, orderId: input.orderId, locale: input.language, preview: true });
  const data = response.data ?? {};
  const labels = (data.labels && typeof data.labels === "object" ? data.labels : {}) as Record<string, unknown>;
  const decision = (data.decision && typeof data.decision === "object" ? data.decision : {}) as Record<string, unknown>;
  return {
    to: str(data.to),
    customerEmail: str(data.customerEmail),
    hasCustomerEmail: data.hasCustomerEmail === true,
    from: str(data.from),
    fromName: str(data.fromName),
    fromAddress: str(data.fromAddress),
    replyTo: str(data.replyTo),
    subject: str(data.subject),
    message: str(data.message),
    labels: { carrier: str(labels.carrier), number: str(labels.number), link: str(labels.link), closing: str(labels.closing) },
    carrier: str(data.carrier),
    carrierLabel: str(data.carrierLabel),
    trackingNumber: str(data.trackingNumber),
    link: /^https:\/\//i.test(str(data.link)) ? str(data.link) : "",
    linkIsGeneric: data.linkIsGeneric === true,
    orderReference: str(data.orderReference),
    locale: str(data.locale),
    lastResult: trackingEmailRecordFrom(data.lastResult),
    decision: { send: decision.send === true, reason: str(decision.reason) }
  };
}

export async function sendOrderTrackingEmail(
  workspace: WorkspaceContext,
  input: { orderId: string; to: string; subject: string; message: string; language: string; resend: boolean }
): Promise<TrackingEmailSendResult> {
  const callable = httpsCallable<Record<string, unknown>, RawResponse>(functions, "sendOrderTrackingEmail");
  const response = await callable({
    companyId: workspace.id,
    orderId: input.orderId,
    to: input.to.trim(),
    subject: input.subject,
    message: input.message,
    locale: input.language,
    resend: input.resend === true
  });
  const data = response.data ?? {};
  return {
    ok: data.ok === true,
    reason: str(data.reason),
    message: str(data.message) || undefined,
    trackingEmail: trackingEmailRecordFrom(data.trackingEmail)
  };
}
