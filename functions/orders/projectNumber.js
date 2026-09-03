"use strict";

// A project's number, and the name built from it.
//
// The number is given once, at creation, and never given again. It is not the
// invoice number: sharing invoiceCounter would burn a real invoice number on
// every project including every mis-tap, nothing decrements it, and it resets
// each January — a project number carries no year and is an internal handle,
// not a fiscal document. Estimates reached the same conclusion and were given
// their own counter for the same reason.
//
// Its own module so the two rules that matter can be tested rather than
// inspected: that the counter only ever counts up, and that nothing — not even
// undoing the create that minted it — hands a number back.

/**
 * Mints the next number inside the caller's transaction.
 *
 * The counter is seeded the first time it is used, from however many orders the
 * workspace already has, so a studio with three hundred jobs starts at 301
 * rather than at 1. After that the seed is ignored: only the stored counter
 * matters, so a number can never be issued twice even as the order count moves
 * around it — orders arrive from webhooks and imports that mint nothing, and
 * orders are deleted.
 */
async function nextProjectNumber(transaction, companyRef, seedFloor = 0) {
  const snapshot = await transaction.get(companyRef);
  const data = snapshot.exists ? snapshot.data() || {} : {};
  const stored = Number(data.projectCounter);
  const base = Number.isFinite(stored) && stored > 0
    ? stored
    : Math.max(Number(seedFloor) || 0, 0);
  const next = base + 1;
  transaction.set(companyRef, { projectCounter: next }, { merge: true });
  return next;
}

// The placeholder names an older client still sends are not customers. A web
// client that has not shipped the form yet sends no customerName at all and the
// server falls back to "New Project" for it; reading that as a person would
// produce "New Project · Project #1", which reads like a bug because it is one.
const PLACEHOLDER_CUSTOMER_NAMES = new Set([
  "New Order", "New Project", "Yeni Sipariş", "Yeni Proje"
]);

/**
 * The name an order carries when the person did not type one.
 *
 * "John Smith · Project #1042" when there is a customer, "Project #1042" when
 * there is not — a workspace may open a job for stock or for the window with
 * nobody attached to it. Written in English whatever the workspace language,
 * because it is stored on the document and read by exports, invoices and the
 * accounting connectors rather than re-translated per reader.
 */
function generatedProjectName(customerName, projectNumber, cleanText) {
  const clean = typeof cleanText === "function"
    ? cleanText
    : (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 180);
  const cleaned = clean(customerName);
  const name = PLACEHOLDER_CUSTOMER_NAMES.has(String(cleaned).trim()) ? "" : cleaned;
  const number = Number(projectNumber) || 0;
  const tail = number > 0 ? `Project #${number}` : "Project";
  return name ? `${name} · ${tail}` : tail;
}

module.exports = { nextProjectNumber, generatedProjectName, PLACEHOLDER_CUSTOMER_NAMES };
