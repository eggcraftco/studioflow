// MULTI-ASSIGN (4 Nov 2026): an order may be assigned to several people.
// The server keeps `assigneeUids` (everyone, first person first) and mirrors the first person into
// `assignedToUid` / `assignedToEmail`, which older apps and older orders carry alone. Same contract as the
// server module functions/orders/assignees.js — what each person may do comes from their own role.

export const MAX_ORDER_ASSIGNEES = 10;

export type OrderAssigneeFields = {
  assignedToUid?: string;
  assignedToEmail?: string;
  assigneeUids?: string[];
};

function cleanUid(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** The stored list from a Firestore document (anything that is not a list of strings counts as empty). */
export function assigneeUidsFromData(value: unknown): string[] {
  const out: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const uid = cleanUid(item);
    if (uid && !out.includes(uid)) out.push(uid);
  }
  return out;
}

/** Everyone on the order, first person first; an order without a list has only its first person. */
export function orderAssigneeUids(order: OrderAssigneeFields | null | undefined): string[] {
  const primary = cleanUid(order?.assignedToUid);
  const stored = assigneeUidsFromData(order?.assigneeUids);
  return primary ? [primary, ...stored.filter(uid => uid !== primary)] : stored;
}

export function isOrderAssignee(order: OrderAssigneeFields | null | undefined, uid: string | null | undefined) {
  const id = cleanUid(uid);
  return Boolean(id) && orderAssigneeUids(order).includes(id);
}

/** The list after ticking or unticking one person in the picker; a new person goes to the end. */
export function toggledAssigneeUids(order: OrderAssigneeFields | null | undefined, uid: string): string[] {
  const current = orderAssigneeUids(order);
  if (current.includes(uid)) return current.filter(item => item !== uid);
  return current.length >= MAX_ORDER_ASSIGNEES ? current : [...current, uid];
}

/**
 * The updateWebOrder `details` for a new list. `assignedToUid` rides along so a server without the list
 * still records the first person (as before); a server with it uses the list and ignores the rest.
 */
export function assigneeDetailsPatch(next: string[], emailFor: (uid: string) => string) {
  const first = next[0] ?? "";
  return {
    assigneeUids: next,
    assignedToUid: first,
    assignedToEmail: first ? emailFor(first) : ""
  };
}
