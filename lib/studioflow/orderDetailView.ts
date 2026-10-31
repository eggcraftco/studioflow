import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/lib/firebase/client";
import type { OrderDetailCardId } from "@/lib/studioflow/cardLayouts";

/**
 * Sections view (31 Oct 2026): which of the two order-detail views a member
 * opens orders in.
 *
 * "stack" is one column of collapsible section headings (the default); "cards"
 * is the draggable card grid. The choice is personal and follows the member
 * from Mac to phone to web, so it lives in personalInterfaceSettings beside
 * the theme — read with a live listener, written through the
 * savePersonalInterfaceSettings callable (the document is write-denied to
 * clients on purpose; see homeLayout.ts). A device-local copy makes the toggle
 * answer at once and keeps it offline; the cloud value wins when it arrives.
 *
 * Which sections are open is NOT synced: it is how this screen is being read
 * right now, not a layout anyone set up.
 */
export type OrderDetailView = "stack" | "cards";

export const DEFAULT_ORDER_DETAIL_VIEW: OrderDetailView = "stack";
export const ORDER_DETAIL_VIEW_FIELD = "orderDetailView";

const VIEW_STORAGE_PREFIX = "orderDetailViewV1:";
const OPEN_STORAGE_PREFIX = "orderStackOpenV1:";

export function normalizeOrderDetailView(value: unknown): OrderDetailView | null {
  return value === "stack" || value === "cards" ? value : null;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedOrderDetailView(companyId: string): OrderDetailView | null {
  if (!companyId) return null;
  try {
    return normalizeOrderDetailView(storage()?.getItem(`${VIEW_STORAGE_PREFIX}${companyId}`));
  } catch {
    return null;
  }
}

export function cacheOrderDetailView(companyId: string, view: OrderDetailView) {
  if (!companyId) return;
  try {
    storage()?.setItem(`${VIEW_STORAGE_PREFIX}${companyId}`, view);
  } catch {
    // Private windows and blocked storage: the live value still arrives.
  }
}

/** Live preference, so a change made on another device lands here too. Returns the unsubscribe. */
export function subscribeOrderDetailView(
  companyId: string,
  onView: (view: OrderDetailView | null) => void
): () => void {
  const userId = auth.currentUser?.uid ?? "";
  if (!companyId || !userId) {
    onView(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "companies", companyId, "personalInterfaceSettings", userId),
    snapshot => onView(normalizeOrderDetailView(snapshot.exists() ? snapshot.data()?.[ORDER_DETAIL_VIEW_FIELD] : undefined)),
    () => onView(null)
  );
}

/**
 * Saved through the callable, never written straight to Firestore (the rule
 * denies it; a direct write applies locally and then springs back). The server
 * whitelists the key and keeps only "stack" or "cards".
 */
export async function saveOrderDetailView(companyId: string, view: OrderDetailView): Promise<void> {
  if (!companyId || !auth.currentUser?.uid) return;
  const callable = httpsCallable(functions, "savePersonalInterfaceSettings");
  await callable({ companyId, settings: { [ORDER_DETAIL_VIEW_FIELD]: view } });
}

/** The sections this device last had open for the workspace (default: none). */
export function readOpenStackSections(companyId: string, known: readonly OrderDetailCardId[]): OrderDetailCardId[] {
  if (!companyId) return [];
  try {
    const raw = storage()?.getItem(`${OPEN_STORAGE_PREFIX}${companyId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is OrderDetailCardId => typeof id === "string" && known.includes(id as OrderDetailCardId));
  } catch {
    return [];
  }
}

export function writeOpenStackSections(companyId: string, open: readonly OrderDetailCardId[]) {
  if (!companyId) return;
  try {
    storage()?.setItem(`${OPEN_STORAGE_PREFIX}${companyId}`, JSON.stringify(open));
  } catch {
    // Not worth an error: the sections simply start closed next time.
  }
}

/** Both device-local keys, for sign-out (lib/studioflow/deviceLocalCache.ts). */
export function orderDetailViewStorageKeys(): string[] {
  const store = storage();
  if (!store) return [];
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key && (key.startsWith(VIEW_STORAGE_PREFIX) || key.startsWith(OPEN_STORAGE_PREFIX))) keys.push(key);
  }
  return keys;
}
