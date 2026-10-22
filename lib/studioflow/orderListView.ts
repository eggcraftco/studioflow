// GN-11 (22 Oct 2026): how the Orders list shows a workspace's orders — a page at a time,
// "load more", or all of them — and how many at a time (10 / 20 / 50 / 100, 20 by default).
//
// The architecture this sits on: every client already reads the whole order scope once
// (web: one getDocs of workspaceOrderQuery; Mac/iPhone/iPad and Android: one snapshot
// listener on the same query) and filters, searches and sorts in memory. Search matches
// notes, custom fields and contact fields, the quick filters read due dates and free-text
// statuses, and "Smart" sorting buckets by due date — none of that can be a Firestore query,
// so a Firestore cursor (startAfter + limit) would make search and filters see only the
// pages already fetched. The view therefore pages the RESULT of filter + sort, never the
// data: counts, filter badges, the source menu and every finance summary keep reading the
// full set, and the page size can never change what the plan counts.
//
// Pure, so a test can hold it (scripts/check-order-list-view.ts). The same contract is
// mirrored in EGGcraft/OrderListView.swift and Android OrderListView.kt.

export type OrderListViewMode = "paged" | "loadMore" | "all";

export const ORDER_LIST_PAGE_SIZES = [10, 20, 50, 100] as const;
export type OrderListPageSize = (typeof ORDER_LIST_PAGE_SIZES)[number];

export type OrderListViewPreference = {
  mode: OrderListViewMode;
  pageSize: OrderListPageSize;
};

export const DEFAULT_ORDER_LIST_VIEW: OrderListViewPreference = { mode: "loadMore", pageSize: 20 };

/** "Show all" still mounts in steps of this many, so a 1,500-order workspace never draws 1,500 cards at once. */
export const ORDER_LIST_ALL_CHUNK = 100;

export const ORDER_LIST_VIEW_MODES: Array<{ id: OrderListViewMode; label: string }> = [
  { id: "loadMore", label: "Load more" },
  { id: "paged", label: "Page by page" },
  { id: "all", label: "Show all" }
];

export function normalizeOrderListViewPreference(raw: unknown): OrderListViewPreference {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = value.mode === "paged" || value.mode === "loadMore" || value.mode === "all" ? value.mode : DEFAULT_ORDER_LIST_VIEW.mode;
  const size = Number(value.pageSize);
  const pageSize = (ORDER_LIST_PAGE_SIZES as readonly number[]).includes(size) ? (size as OrderListPageSize) : DEFAULT_ORDER_LIST_VIEW.pageSize;
  return { mode, pageSize };
}

/** Where the person is inside the list: the page (paged) or how many rows are mounted (load more / all). */
export type OrderListWindowState = { page: number; shown: number };

export function initialOrderListWindow(preference: OrderListViewPreference): OrderListWindowState {
  return { page: 0, shown: preference.mode === "all" ? ORDER_LIST_ALL_CHUNK : preference.pageSize };
}

export type OrderListWindow = {
  start: number;
  end: number;
  /** Zero-based, already clamped: a page emptied by deletions falls back to the last one that has rows. */
  page: number;
  pageCount: number;
  total: number;
  hasMore: boolean;
  hasPrevious: boolean;
  /** Rows not yet mounted (load more / all); rows after this page (paged). */
  remaining: number;
};

function stepFor(preference: OrderListViewPreference) {
  return preference.mode === "all" ? ORDER_LIST_ALL_CHUNK : preference.pageSize;
}

export function orderListWindow(total: number, preference: OrderListViewPreference, state: OrderListWindowState): OrderListWindow {
  const count = Math.max(0, Math.floor(total));
  const size = preference.pageSize;
  if (preference.mode === "paged") {
    const pageCount = Math.max(1, Math.ceil(count / size));
    const page = Math.min(Math.max(0, Math.floor(state.page)), pageCount - 1);
    const start = page * size;
    const end = Math.min(count, start + size);
    return { start, end, page, pageCount, total: count, hasMore: page < pageCount - 1, hasPrevious: page > 0, remaining: count - end };
  }
  const step = stepFor(preference);
  const end = Math.min(count, Math.max(step, Math.floor(state.shown)));
  return { start: 0, end, page: 0, pageCount: 1, total: count, hasMore: end < count, hasPrevious: false, remaining: count - end };
}

/** One more page (paged), one more step (load more / all). */
export function advanceOrderListWindow(preference: OrderListViewPreference, state: OrderListWindowState, total: number): OrderListWindowState {
  const current = orderListWindow(total, preference, state);
  if (preference.mode === "paged") return { ...state, page: Math.min(current.pageCount - 1, current.page + 1) };
  return { ...state, shown: current.end + stepFor(preference) };
}

export function retreatOrderListWindow(preference: OrderListViewPreference, state: OrderListWindowState, total: number): OrderListWindowState {
  const current = orderListWindow(total, preference, state);
  if (preference.mode !== "paged") return state;
  return { ...state, page: Math.max(0, current.page - 1) };
}

/**
 * The window moved just far enough that the row at `index` is on screen: its page (paged), or
 * enough steps mounted to reach it (load more / all). A selection made from outside the list —
 * a link, a notification, a new order, the Schedule — therefore never lands on a hidden row.
 */
export function revealOrderListIndex(preference: OrderListViewPreference, state: OrderListWindowState, index: number): OrderListWindowState {
  if (index < 0) return state;
  if (preference.mode === "paged") {
    const page = Math.floor(index / preference.pageSize);
    return page === state.page ? state : { ...state, page };
  }
  const step = stepFor(preference);
  const needed = Math.ceil((index + 1) / step) * step;
  return needed <= state.shown ? state : { ...state, shown: needed };
}

/**
 * A page size change keeps the first row the person was looking at on screen
 * (paged: the page that now holds it; load more: at least as many rows as before).
 */
export function resizeOrderListWindow(
  previous: OrderListViewPreference,
  next: OrderListViewPreference,
  state: OrderListWindowState,
  total: number
): OrderListWindowState {
  const before = orderListWindow(total, previous, state);
  if (next.mode === "paged") {
    return { page: Math.floor(before.start / next.pageSize), shown: next.pageSize };
  }
  const base = initialOrderListWindow(next);
  return { page: 0, shown: Math.max(base.shown, previous.mode === "paged" ? base.shown : before.end) };
}

// The tie-break every order sort ends with lives beside the sorts (orderFilters.ts, which
// several check scripts compile on its own, so it imports nothing); re-exported here.
export { compareOrdersTieBreak } from "./orderFilters";

// ---- the person's choice -------------------------------------------------------------
// Kept per signed-in user on this device (the key carries the uid, so a second account on
// the same browser never inherits it and sign-out needs no clean-up). It is a reading
// preference, not workspace data: it never reaches the server and never changes a count.

export function orderListViewStorageKey(uid: string) {
  return `nivadesk.ordersListView.v1.${uid}`;
}

export function loadOrderListViewPreference(uid: string): OrderListViewPreference {
  if (!uid || typeof window === "undefined") return DEFAULT_ORDER_LIST_VIEW;
  try {
    const raw = window.localStorage.getItem(orderListViewStorageKey(uid));
    return raw ? normalizeOrderListViewPreference(JSON.parse(raw)) : DEFAULT_ORDER_LIST_VIEW;
  } catch {
    return DEFAULT_ORDER_LIST_VIEW;
  }
}

export function saveOrderListViewPreference(uid: string, preference: OrderListViewPreference) {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(orderListViewStorageKey(uid), JSON.stringify(normalizeOrderListViewPreference(preference)));
  } catch {
    /* private window or blocked storage: the choice lasts for this visit only */
  }
}
