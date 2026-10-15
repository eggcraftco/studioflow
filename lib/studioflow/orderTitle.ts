// The title an order is shown under when nobody gave it one (review N09).
//
// An order with no customer name is stored — and read back by firestore.ts —
// as the literal "New Project". Four screens each had their own copy of the
// "blank or placeholder → New Project" rule and every copy returned the English
// words untranslated, so a Turkish workspace saw "New Project" on the list,
// the detail header and the Team Schedule while everything around it was
// Turkish. `|| t("New Project")` on the Orders page never fired either: the
// name is never blank by the time it gets there.
//
// Display only. What is SAVED is unchanged — the editors still store the
// English placeholder (or nothing), so no stored value depends on the reader's
// language.

const PLACEHOLDER_TITLES = new Set(["new order", "new project", "yeni sipariş", "yeni proje"]);

/** True for a blank name or one of the stored placeholders. */
export function isPlaceholderOrderTitle(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  return !cleaned || PLACEHOLDER_TITLES.has(cleaned.toLowerCase());
}

/** The name to draw: the order's own, or "New Project" in the reader's language. */
export function displayOrderTitle(value: string | null | undefined, t: (text: string) => string) {
  return isPlaceholderOrderTitle(value) ? t("New Project") : String(value ?? "").trim();
}
