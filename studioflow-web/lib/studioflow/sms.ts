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
// "NivaDesk" has been in review with the UK networks since 25 August 2026, so
// today the first two are true and the third is false.

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
};

export type SaveWorkspaceSmsInput = {
  senderId: string;
  triggers: SmsTriggers;
  defaultCallingCode: string;
};

export type SavedWorkspaceSmsSettings = {
  ok: boolean;
  senderId: string;
  senderStatus: SmsSenderStatus;
  triggers: SmsTriggers;
};

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
      defaultCallingCode: cleanSmsCallingCodeInput(input.defaultCallingCode)
    },
    "The SMS settings could not be saved."
  );
}
