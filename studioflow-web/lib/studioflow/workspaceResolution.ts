// The decision behind "which workspace opens after sign-in", kept free of
// Firebase so scripts/check-workspace-resolution.mjs can run it under plain
// node. Mirror of EGGcraft/WorkspaceResolution.swift and the Android
// WorkspaceResolution.kt.
//
// The rule: a read that did not reach the server proves nothing. It never turns
// into "open the personal workspace instead", and nothing is written back. Only
// a first sign-in confirmed by the server (no stored workspace at all) or the
// person's explicit choice may open the personal workspace on their behalf.

export type WorkspaceStoredRead =
  | { kind: "server"; activeCompanyId: string | null | undefined }
  | { kind: "cache"; activeCompanyId: string | null | undefined }
  | { kind: "failed" };

export type WorkspaceAccessOutcome = "granted" | "denied" | "unavailable";

export type WorkspaceRetryReason = "stored-workspace-unavailable" | "workspace-unavailable";

export type WorkspacePreferredStep =
  | { kind: "check"; companyId: string; persistIfPersonal: boolean }
  | { kind: "retry"; reason: WorkspaceRetryReason };

export type WorkspaceDecision =
  | { kind: "activate"; companyId: string; persist: boolean }
  | { kind: "retry"; reason: WorkspaceRetryReason }
  | { kind: "access-lost"; companyId: string };

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function preferredWorkspace(uid: string, stored: WorkspaceStoredRead): WorkspacePreferredStep {
  if (stored.kind === "failed") return { kind: "retry", reason: "stored-workspace-unavailable" };
  const active = clean(stored.activeCompanyId);
  if (stored.kind === "server") {
    // First setup, confirmed by the server: the personal workspace is the only
    // one this account has, and recording it is correct.
    if (!active) return { kind: "check", companyId: uid, persistIfPersonal: true };
    return { kind: "check", companyId: active, persistIfPersonal: false };
  }
  // An empty cache is not proof of a first setup.
  if (!active) return { kind: "retry", reason: "stored-workspace-unavailable" };
  return { kind: "check", companyId: active, persistIfPersonal: false };
}

export function decideWorkspace(uid: string, step: WorkspacePreferredStep, access: WorkspaceAccessOutcome): WorkspaceDecision {
  if (step.kind === "retry") return { kind: "retry", reason: step.reason };
  if (step.companyId === uid) return { kind: "activate", companyId: uid, persist: step.persistIfPersonal };
  if (access === "granted") return { kind: "activate", companyId: step.companyId, persist: false };
  if (access === "denied") return { kind: "access-lost", companyId: step.companyId };
  return { kind: "retry", reason: "workspace-unavailable" };
}

/** A result may only be applied to the account and load it was started for. */
export function workspaceResultApplies(
  startedForUid: string,
  startedGeneration: number,
  currentUid: string | null | undefined,
  currentGeneration: number,
): boolean {
  return startedForUid === currentUid && startedGeneration === currentGeneration;
}

/** Thrown by the loader instead of opening a workspace the read did not confirm. */
export class WorkspaceUnavailableError extends Error {
  readonly reason: WorkspaceRetryReason;
  constructor(reason: WorkspaceRetryReason) {
    super("Could not open your workspace. Check your connection and try again.");
    this.name = "WorkspaceUnavailableError";
    this.reason = reason;
  }
}

/** Thrown when the server confirmed the stored workspace no longer admits this person. */
export class WorkspaceAccessLostError extends Error {
  readonly companyId: string;
  constructor(companyId: string) {
    super("Your access to this workspace has changed. Try again, or open your own workspace.");
    this.name = "WorkspaceAccessLostError";
    this.companyId = companyId;
  }
}
