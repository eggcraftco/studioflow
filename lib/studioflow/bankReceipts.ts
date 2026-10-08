import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase/client";

/**
 * Opening a bank receipt's bytes — the waiting list ("Waiting for the bank")
 * and the receipt on a bank transaction.
 *
 * The files live under companies/{id}/bank_receipts/… whose Storage rule is
 * owner-only, while the bank rows themselves are readable by any member the
 * live bank rule admits. getDownloadURL therefore worked for the owner only,
 * and the waiting list had no open control at all. The server now has one
 * authorised door: `openBankReceiptFile` says who may open what, and
 * `nvOpenBankReceiptFile` streams the bytes to a request that carries the
 * Firebase ID token in the Authorization HEADER. The URL is never navigated to
 * and carries no credential; the bytes arrive here as a Blob and are shown
 * from an object URL this page owns and revokes.
 */

export type BankReceiptReference = {
  companyId: string;
  inboxId?: string;
  transactionId?: string;
};

export type BankReceiptOpenReason =
  | "signed-out"
  | "permission"
  | "not-found"
  | "scanning"
  | "quarantined"
  | "too-large"
  | "network"
  | "unknown";

export class BankReceiptOpenError extends Error {
  reason: BankReceiptOpenReason;
  constructor(reason: BankReceiptOpenReason, message: string) {
    super(message);
    this.name = "BankReceiptOpenError";
    this.reason = reason;
  }
}

export type OpenedBankReceipt = {
  kind: "inbox" | "transaction";
  name: string;
  contentType: string;
  size: number;
  scan: "clean" | "unscanned";
  blob: Blob;
  objectUrl: string;
  /** How the bytes should be shown. */
  display: "image" | "pdf" | "text" | "download";
  /** Hand the object URL back when the viewer closes. */
  release: () => void;
};

type OpenBankReceiptFileResult = {
  ok: boolean;
  kind: "inbox" | "transaction";
  name: string;
  contentType: string;
  size: number;
  scan: "clean" | "unscanned";
  url: string;
  authorization: "firebase-id-token";
};

export function bankReceiptDisplayKind(contentType: string, name = ""): OpenedBankReceipt["display"] {
  const type = String(contentType || "").toLowerCase();
  const lowerName = String(name || "").toLowerCase();
  if (type.startsWith("image/") && type !== "image/svg+xml") return "image";
  if (type === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (type.startsWith("text/")) return "text";
  return "download";
}

function reasonFromCallableError(error: unknown): BankReceiptOpenReason {
  const code = String((error as { code?: unknown } | null)?.code || "").toLowerCase();
  const message = String((error as { message?: unknown } | null)?.message || "").toLowerCase();
  if (code.endsWith("unauthenticated")) return "signed-out";
  if (code.endsWith("permission-denied")) return message.includes("safety check") ? "quarantined" : "permission";
  if (code.endsWith("not-found")) return "not-found";
  if (code.endsWith("failed-precondition")) return "scanning";
  if (code.endsWith("resource-exhausted")) return "too-large";
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded")) return "network";
  return "unknown";
}

function reasonFromHttpStatus(status: number, body: string): BankReceiptOpenReason {
  if (status === 401) return "signed-out";
  if (status === 403) return /safety check/i.test(body) ? "quarantined" : "permission";
  if (status === 404) return "not-found";
  if (status === 423) return "scanning";
  if (status === 413) return "too-large";
  if (status >= 500 || status === 0) return "network";
  return "unknown";
}

/**
 * Fetches the receipt the reference points at. Resolves with the bytes and an
 * object URL; rejects with a BankReceiptOpenError whose `reason` the UI can
 * put into words. Pass an AbortSignal to drop a fetch the viewer no longer wants.
 */
export async function openBankReceiptFile(reference: BankReceiptReference, signal?: AbortSignal): Promise<OpenedBankReceipt> {
  const user = auth.currentUser;
  if (!user) throw new BankReceiptOpenError("signed-out", "You must be signed in.");

  let meta: OpenBankReceiptFileResult;
  try {
    const callable = httpsCallable<BankReceiptReference, OpenBankReceiptFileResult>(functions, "openBankReceiptFile");
    const payload: BankReceiptReference = { companyId: reference.companyId };
    if (reference.inboxId) payload.inboxId = reference.inboxId;
    else if (reference.transactionId) payload.transactionId = reference.transactionId;
    meta = (await callable(payload)).data;
  } catch (error) {
    throw new BankReceiptOpenError(reasonFromCallableError(error), error instanceof Error ? error.message : "Could not open the receipt.");
  }
  if (!meta || meta.ok !== true || !meta.url) throw new BankReceiptOpenError("unknown", "Could not open the receipt.");

  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" });
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "AbortError") throw error;
    throw new BankReceiptOpenError("network", "Could not reach the receipt.");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new BankReceiptOpenError(reasonFromHttpStatus(response.status, body), body || `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const contentType = (response.headers.get("content-type") || meta.contentType || blob.type || "application/octet-stream").split(";")[0].trim().toLowerCase();
  // The Blob's own type decides what an <iframe>/<img> does with it; the server's
  // Content-Type is the truth we trust, not whatever the browser sniffed.
  const typed = blob.type === contentType ? blob : new Blob([blob], { type: contentType });
  const objectUrl = URL.createObjectURL(typed);
  let released = false;
  return {
    kind: meta.kind,
    name: meta.name || "receipt",
    contentType,
    size: Number(meta.size) || typed.size,
    scan: meta.scan,
    blob: typed,
    objectUrl,
    display: bankReceiptDisplayKind(contentType, meta.name),
    release: () => { if (!released) { released = true; URL.revokeObjectURL(objectUrl); } }
  };
}

/** Saves the already-fetched bytes under the receipt's name. */
export function downloadOpenedBankReceipt(opened: Pick<OpenedBankReceipt, "objectUrl" | "name">) {
  const anchor = document.createElement("a");
  anchor.href = opened.objectUrl;
  anchor.download = opened.name || "receipt";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function bankReceiptErrorText(reason: BankReceiptOpenReason, t: (text: string) => string): string {
  switch (reason) {
    case "signed-out": return t("Sign in again to open this receipt.");
    case "permission": return t("Bank receipts are not available to your account in this workspace.");
    case "not-found": return t("This receipt file is no longer available — it was removed or never finished uploading.");
    case "scanning": return t("This file is still being checked for safety. Try again in a moment.");
    case "quarantined": return t("This file did not pass the safety check and cannot be opened.");
    case "too-large": return t("This file is too large to preview here.");
    case "network": return t("Could not reach the receipt. Check your connection and try again.");
    default: return t("Could not open the receipt.");
  }
}
