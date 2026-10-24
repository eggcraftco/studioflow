// ET-E3 b2.1 (24 Oct 2026): an order save the server could not finish for a TEMPORARY reason is never shown as the
// plan limit. The server (functions/orders/capacityTransaction.js) answers:
//   - failed-precondition + its sentence  -> a real capacity refusal (the count re-read inside the transaction is full)
//   - aborted     -> several saves at the same moment; retried on the server, still not settled
//   - unavailable / deadline-exceeded -> a database / connection problem
// The order callers' own mappings look at the message text ("plan…limit", "permission", "workflow" …); this check
// runs FIRST, on the code, so a temporary failure always reads "The server is busy. Please try again." (11 languages).

const TRANSIENT_CODES = new Set(["functions/aborted", "functions/unavailable", "functions/deadline-exceeded"]);

export const TEMPORARY_ORDER_SAVE_MESSAGE = "The server is busy. Please try again.";

/** The sentence for a temporary failure, or null when the error is not one (then the caller's own mapping applies). */
export function temporaryOrderSaveMessage(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return null;
  return TRANSIENT_CODES.has(code.trim().toLowerCase()) ? TEMPORARY_ORDER_SAVE_MESSAGE : null;
}
