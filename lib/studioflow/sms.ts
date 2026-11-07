import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";

// The browser's whole view of customer SMS.
//
// Two callables, both already deployed and untouched by this file: one reads
// the workspace's settings, one saves them (owner only). Nothing here talks to
// Twilio, holds a credential, or decides whether a sender ID is verified — the
// aggregator decides that, which is why `senderStatus` is a thing to read and
// never a thing to set.
//
// The distinction the screens are built on lives in this shape: three separate
// booleans that are easy to confuse and mean different things.
//
//   providerConfigured — the Twilio credentials exist. They do.
//   available          — the plan allows SMS (Pro and Team).
//   sendingLive        — a text would actually arrive.
//
// Only the last one may be read as "this works". The platform sender ID
// "NivaDesk" needs no registration in the UK (Twilio ticket 29160398, 25 Aug
// 2026) and Twilio approved the business profile on 24 Oct 2026.
//
// Twilio SMS r4 (7 Nov 2026; owner-approved texts in
// docs/legal/TWILIO-SMS-METINLER-2026-11-07.md): on top of that, a text needs
// the workspace owner's one-time attestation, the RECIPIENT's recorded
// agreement, and it waits for the morning between 21:00 and 08:00 UK time.
// Every field below that came with r4 is optional: an older server simply
// does not send it, and the screens then show nothing they cannot stand behind.

export type SmsSenderStatus = "unset" | "pending" | "verified";
export type SmsPlatformSenderStatus = "pending" | "verified";

export const SMS_TRIGGER_KEYS = [
  "estimateReady",
  "workStarted",
  "readyForCollection",
  "everyStatusChange"
] as const;

export type SmsTriggerKey = (typeof SMS_TRIGGER_KEYS)[number];
export type SmsTriggers = Record<SmsTriggerKey, boolean>;

// Mirrors cleanSmsTriggers in functions/index.js. The three milestones are on;
// telling a customer about every internal step is a choice a business makes,
// not one made for them.
export const SMS_TRIGGER_DEFAULTS: SmsTriggers = {
  estimateReady: true,
  workStarted: true,
  readyForCollection: true,
  everyStatusChange: false
};

export type SmsUsage = {
  /** "YYYY-MM". */
  month: string;
  messages: number;
  segments: number;
  spendUsd: number;
};

/** The wording versions the owner approved on 7 Nov 2026; the server stores which one a person saw. */
export const SMS_TEXT_VERSIONS = {
  attestation: "sms-attestation-2026-11",
  staffConsent: "sms-consent-staff-2026-11",
  portalConsent: "sms-consent-portal-2026-11"
} as const;

export type SmsQuotaState = "ok" | "near" | "full" | "not_configured" | "unavailable";
export type SmsQuota = {
  state: SmsQuotaState;
  limitSegments?: number;
  usedSegments?: number;
  usedMessages?: number;
  remainingSegments?: number;
  resetsAtMs?: number;
  platformState?: "ok" | "near" | "full";
  sendingBlockedByQuota?: boolean;
};

export type SmsQuietHours = { enabled: true; startHour: number; endHour: number; timeZone: string } | { enabled: false };

export type WorkspaceSmsSettings = {
  ok: boolean;
  /**
   * The sender a customer would see today: the workspace's own name if it is
   * verified, otherwise the platform's. It is NOT the workspace's own name in
   * any other state, so it must never be written back into an input whose
   * contents get saved as the workspace's own sender ID.
   */
  senderId: string;
  /** The status of the WORKSPACE's own sender ID — not of `senderId` above. */
  senderStatus: SmsSenderStatus;
  /** Digits, no plus sign. "44" is the United Kingdom. */
  defaultCallingCode: string;
  triggers: SmsTriggers;
  /** The plan allows SMS: Pro and Team only. */
  available: boolean;
  /** Twilio credentials are set on the server. Not the same as being able to send. */
  providerConfigured: boolean;
  platformSenderId: string;
  platformSenderStatus: SmsPlatformSenderStatus;
  /** The one field that may be read as "a text would actually arrive". */
  sendingLive: boolean;
  usage: SmsUsage;
  // r4 and the general-open candidate; absent on older servers.
  rollout?: "pilot" | "general";
  /** True when this workspace may send in the current rollout (always true once it is general). */
  pilotIncluded?: boolean;
  staffConsentEnabled?: boolean;
  customerOptInOpen?: boolean;
  quota?: SmsQuota;
  attestation?: { textVersion: string; atMs: number } | null;
  attestationRequiredVersion?: string;
  attestationCurrent?: boolean;
  quietHours?: SmsQuietHours;
};

export type SaveWorkspaceSmsInput = {
  senderId: string;
  triggers: SmsTriggers;
  defaultCallingCode: string;
  /** The owner's attestation, sent with the save that confirms it (r4). */
  attestationTextVersion?: string;
};

export type SavedWorkspaceSmsSettings = {
  ok: boolean;
  senderId: string;
  senderStatus: SmsSenderStatus;
  triggers: SmsTriggers;
  attestation?: { textVersion: string; atMs: number } | null;
  attestationCurrent?: boolean;
};

export type SmsConsentState = "active" | "none" | "revoked" | "opted_out" | "global_stop" | "no_number";
export type SmsConsent = {
  state: SmsConsentState;
  source: string;
  consentTextVersion: string;
  atMs: number;
  revokedAtMs: number;
  revokedSource: string;
  /** Masked by the server, e.g. "+44•••750". */
  number: string;
};

export type OrderSmsStatus = {
  ok: boolean;
  orderId: string;
  lastSms: null | {
    status: string;
    statusClass: "pending" | "sent" | "delivered" | "undelivered" | "failed" | "unknown";
    errorClass: string;
    trigger: string;
    createdAtMs: number;
    deliveredAtMs: number;
  };
  lastSkip: null | { reason: string; reasonClass: string; detail: string; trigger: string; status: string; atMs: number };
  consent: SmsConsent;
};

export type StaffConsentResult = { ok: boolean; already?: boolean; reason?: string; consent: SmsConsent };

/** A customer stopped texts themselves (or the network did): only the customer can switch them back on. */
export function smsConsentLockedByCustomer(consent: SmsConsent | null | undefined): boolean {
  if (!consent) return false;
  if (consent.state === "opted_out" || consent.state === "global_stop") return true;
  return consent.state === "revoked" && /^(customer_portal_opt_out|optout_link|inbound_stop|provider_21610)$/.test(consent.revokedSource || "");
}

/**
 * One call, one sentence on failure.
 *
 * The callables throw HttpsError with sentences already written for a person
 * ("Only the workspace owner can change SMS settings."), so those are kept as
 * they are; only the transport's own codes are swapped for the fallback.
 */
async function call<TResponse>(name: string, payload: Record<string, unknown>, fallback: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, TResponse>(functions, name);
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const cleaned = raw.replace(/^[a-z-]+:\s*/i, "").trim();
    if (!cleaned || /^(internal|unknown|unavailable|not-found|deadline-exceeded)$/i.test(cleaned)) {
      throw new Error(fallback);
    }
    throw new Error(cleaned);
  }
}

/** Fills in anything an older stored document is missing, rather than showing a blank switch. */
export function normalizeSmsTriggers(value: Partial<SmsTriggers> | null | undefined): SmsTriggers {
  const incoming = value && typeof value === "object" ? value : {};
  const output = { ...SMS_TRIGGER_DEFAULTS };
  for (const key of SMS_TRIGGER_KEYS) {
    if (typeof incoming[key] === "boolean") output[key] = incoming[key] as boolean;
  }
  return output;
}

/**
 * The same normalisation the server applies to a sender ID.
 *
 * Alphanumeric sender IDs are 11 characters, letters, digits and spaces only —
 * a carrier silently rejects anything else. Doing it as the owner types means
 * the box can never show a name that would not survive the save.
 */
export function cleanSmsSenderIdInput(value: string): string {
  return String(value || "").replace(/[^A-Za-z0-9 ]/g, "").slice(0, 11);
}

/** Digits only, at most four — a calling code, never a formatted number. */
export function cleanSmsCallingCodeInput(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

export async function getWorkspaceSmsSettings(workspace: WorkspaceContext) {
  return call<WorkspaceSmsSettings>(
    "getWorkspaceSmsSettings",
    { companyId: workspace.id },
    "The SMS settings could not be loaded."
  );
}

/**
 * Owner only, and only on a plan that includes SMS — the callable refuses
 * anything else rather than half-saving.
 *
 * There is no "leave the sender alone" in the contract: every save writes the
 * sender ID it is given. Changing it drops the registration back to pending,
 * because the networks approved the old name and not this one.
 */
export async function saveWorkspaceSmsSettings(workspace: WorkspaceContext, input: SaveWorkspaceSmsInput) {
  return call<SavedWorkspaceSmsSettings>(
    "saveWorkspaceSmsSettings",
    {
      companyId: workspace.id,
      senderId: cleanSmsSenderIdInput(input.senderId).trim(),
      triggers: normalizeSmsTriggers(input.triggers),
      defaultCallingCode: cleanSmsCallingCodeInput(input.defaultCallingCode),
      ...(input.attestationTextVersion ? { attestation: { textVersion: input.attestationTextVersion } } : {})
    },
    "The SMS settings could not be saved."
  );
}

/**
 * The order's last text, the reason the last one was not sent, and the customer's
 * agreement for the order's number (r4). Throws on an older server that does not
 * have the callable: callers hide the block rather than guess.
 */
export async function getOrderSmsStatus(workspace: WorkspaceContext, orderId: string) {
  return call<OrderSmsStatus>(
    "getOrderSmsStatus",
    { companyId: workspace.id, orderId },
    "The text message status could not be loaded."
  );
}

/** A member records that the customer agreed to texts (the approved staff wording). */
export async function recordSmsConsentStaff(workspace: WorkspaceContext, orderId: string) {
  return call<StaffConsentResult>(
    "recordSmsConsentStaff",
    { companyId: workspace.id, orderId, consentTextVersion: SMS_TEXT_VERSIONS.staffConsent },
    "The customer's agreement could not be saved."
  );
}

/** A member withdraws an agreement they recorded. It never undoes a customer's own stop. */
export async function revokeSmsConsentStaff(workspace: WorkspaceContext, orderId: string) {
  return call<StaffConsentResult>(
    "revokeSmsConsentStaff",
    { companyId: workspace.id, orderId },
    "The customer's agreement could not be withdrawn."
  );
}
