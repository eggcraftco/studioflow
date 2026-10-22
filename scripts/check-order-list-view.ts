// GN-11 (22 Oct 2026): the Orders list view — paged / load more / show all over the
// filtered, sorted result, never over the data.
//   npx tsx scripts/check-order-list-view.ts
// 1. window arithmetic: few orders, many pages, 1,500 synthetic orders, an emptied last page;
// 2. walking every page of a result returns each order exactly once, also after a row is
//    added at the top or deleted mid-way between two page loads (the next read is a new array);
// 3. equal dates sort the same way every time (project number, then id), whatever the input order;
// 4. search, quick filters and counts read the whole result, not the first page;
// 5. the preference: defaults, unknown values, per-uid key;
// 6. the screen draws the window (list, phone list, rail) and counts the whole result;
// 7. every new string has EN/TR/DE/AR (studioT probe, not a file read).
import fs from "fs";
import path from "path";
import {
  DEFAULT_ORDER_LIST_VIEW,
  ORDER_LIST_ALL_CHUNK,
  advanceOrderListWindow,
  compareOrdersTieBreak,
  initialOrderListWindow,
  normalizeOrderListViewPreference,
  orderListViewStorageKey,
  orderListWindow,
  resizeOrderListWindow,
  retreatOrderListWindow,
  revealOrderListIndex,
  type OrderListViewPreference
} from "../lib/studioflow/orderListView";
import { filterAndSortOrders, quickFilterCount, type FilterableOrder } from "../lib/studioflow/orderFilters";
import { studioT } from "../lib/studioflow/language";
import { ORDER_LIST_VIEW_TRANSLATIONS } from "../lib/studioflow/orderListViewTranslations";

let failures = 0;
let checks = 0;
const check = (ok: boolean, what: string) => { checks += 1; if (!ok) { failures += 1; console.error(`FAIL ${what}`); } };
const eq = (got: unknown, want: unknown, what: string) => check(JSON.stringify(got) === JSON.stringify(want), `${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

type Row = FilterableOrder & { id: string; projectNumber: number };
const DAY = 86_400_000;
const base = Date.UTC(2026, 9, 1);
function synthetic(count: number, sameDateEvery = 7): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `order-${String(index).padStart(5, "0")}`,
    projectNumber: index + 1,
    customerName: index === count - 7 ? "Needle In Haystack" : `Customer ${index}`,
    designName: `Design ${index}`,
    status: index % 5 === 0 ? "Done" : "In Progress",
    remainingAmount: index % 3 === 0 ? 10 : 0,
    // Every 7th row shares its date with the next one: ties are common, as with imports.
    paymentDate: new Date(base - Math.floor(index / 2) * (index % sameDateEvery === 0 ? 0 : DAY)),
    dueDate: null,
    isDispatched: false,
    isDelivered: false
  }));
}

function walk(total: number, pref: OrderListViewPreference) {
  let state = initialOrderListWindow(pref);
  const seen: number[] = [];
  for (let guard = 0; guard < 10_000; guard += 1) {
    const w = orderListWindow(total, pref, state);
    for (let i = w.start; i < w.end; i += 1) seen.push(i);
    if (!w.hasMore) break;
    const next = advanceOrderListWindow(pref, state, total);
    if (pref.mode !== "paged") { seen.length = 0; }
    state = next;
  }
  if (pref.mode !== "paged") {
    const w = orderListWindow(total, pref, state);
    return Array.from({ length: w.end - w.start }, (_, i) => w.start + i);
  }
  return seen;
}

// ---- 1. window arithmetic --------------------------------------------------------------
eq(DEFAULT_ORDER_LIST_VIEW, { mode: "loadMore", pageSize: 20 }, "default view");
{
  const few = orderListWindow(3, { mode: "paged", pageSize: 20 }, { page: 0, shown: 20 });
  eq([few.start, few.end, few.pageCount, few.hasMore, few.hasPrevious], [0, 3, 1, false, false], "3 orders, paged 20");
  const none = orderListWindow(0, { mode: "paged", pageSize: 20 }, { page: 4, shown: 20 });
  eq([none.start, none.end, none.page, none.pageCount], [0, 0, 0, 1], "no orders, page 5 asked");
  const multi = orderListWindow(153, { mode: "paged", pageSize: 20 }, { page: 7, shown: 20 });
  eq([multi.start, multi.end, multi.page, multi.pageCount, multi.hasMore, multi.remaining], [140, 153, 7, 8, false, 0], "153 orders, last page");
  // 153 → 139 after deletions while on page 8: page 8 would be empty, the window falls back to page 7.
  const emptied = orderListWindow(139, { mode: "paged", pageSize: 20 }, { page: 7, shown: 20 });
  eq([emptied.start, emptied.end, emptied.page, emptied.pageCount], [120, 139, 6, 7], "emptied last page falls back");
  const exact = orderListWindow(40, { mode: "paged", pageSize: 20 }, { page: 2, shown: 20 });
  eq([exact.start, exact.end, exact.page, exact.pageCount], [20, 40, 1, 2], "40 orders: no empty third page");
  const more = orderListWindow(1500, { mode: "loadMore", pageSize: 50 }, { page: 0, shown: 50 });
  eq([more.start, more.end, more.hasMore, more.remaining], [0, 50, true, 1450], "1,500 load more 50");
  const all = orderListWindow(1500, { mode: "all", pageSize: 20 }, initialOrderListWindow({ mode: "all", pageSize: 20 }));
  eq([all.end, all.hasMore], [ORDER_LIST_ALL_CHUNK, true], "1,500 show all mounts the first 100 only");
  let allState = initialOrderListWindow({ mode: "all", pageSize: 20 });
  for (let i = 0; i < 20; i += 1) allState = advanceOrderListWindow({ mode: "all", pageSize: 20 }, allState, 1500);
  const allDone = orderListWindow(1500, { mode: "all", pageSize: 20 }, allState);
  eq([allDone.end, allDone.hasMore], [1500, false], "show all reaches the end in steps");
  eq(retreatOrderListWindow({ mode: "paged", pageSize: 10 }, { page: 0, shown: 10 }, 50).page, 0, "no page before the first");
  eq(advanceOrderListWindow({ mode: "paged", pageSize: 10 }, { page: 4, shown: 10 }, 50).page, 4, "no page after the last");
}

// ---- 2. every order exactly once ------------------------------------------------------
for (const total of [0, 1, 9, 10, 11, 20, 153, 1500]) {
  for (const pageSize of [10, 20, 50, 100] as const) {
    for (const mode of ["paged", "loadMore", "all"] as const) {
      const indices = walk(total, { mode, pageSize });
      check(indices.length === total && new Set(indices).size === total, `${mode} ${pageSize} over ${total}: ${indices.length} rows, ${new Set(indices).size} distinct`);
    }
  }
}
{
  // Concurrent add/delete between two page loads: each read is a fresh, fully sorted array,
  // so the next page is cut from the new array. A row added at the top shifts one row onto
  // the next page (it is then seen twice across two DIFFERENT reads, never twice in one);
  // on any single read every id appears once.
  const pref: OrderListViewPreference = { mode: "paged", pageSize: 20 };
  let rows = filterAndSortOrders(synthetic(95), "", "all", "recent");
  const first = rows.slice(orderListWindow(rows.length, pref, { page: 0, shown: 20 }).start, orderListWindow(rows.length, pref, { page: 0, shown: 20 }).end);
  const added: Row = { ...synthetic(1)[0], id: "order-new", projectNumber: 999, paymentDate: new Date(base + DAY) };
  rows = filterAndSortOrders([added, ...rows.filter(row => row.id !== rows[30].id)], "", "all", "recent");
  const ids = rows.map(row => row.id);
  eq(new Set(ids).size, ids.length, "after add + delete: one copy of every id in the read");
  eq(ids.includes("order-new") && rows[0].id === "order-new", true, "the new order sorts first");
  const second = orderListWindow(rows.length, pref, { page: 1, shown: 20 });
  eq(rows.slice(second.start, second.end).some(row => row.id === first[19].id), true, "page 2 starts with the row the new one pushed down");
}

// ---- 3. stable order on equal dates ---------------------------------------------------
{
  const rows = synthetic(300);
  const sortedA = filterAndSortOrders(rows, "", "all", "recent").map(row => row.id);
  const shuffled = [...rows].sort((a, b) => (a.id.charCodeAt(9) * 31 + b.projectNumber) % 7 - 3);
  const sortedB = filterAndSortOrders(shuffled, "", "all", "recent").map(row => row.id);
  const reversed = filterAndSortOrders([...rows].reverse(), "", "all", "recent").map(row => row.id);
  eq(sortedB, sortedA, "recent sort: same order from a shuffled input");
  eq(reversed, sortedA, "recent sort: same order from a reversed input");
  const smartA = filterAndSortOrders(rows, "", "all", "smart").map(row => row.id);
  const smartB = filterAndSortOrders([...rows].reverse(), "", "all", "smart").map(row => row.id);
  eq(smartB, smartA, "smart sort: same order from a reversed input");
  eq(compareOrdersTieBreak({ id: "b", projectNumber: 3 }, { id: "a", projectNumber: 2 }) < 0, true, "higher project number first");
  eq(compareOrdersTieBreak({ id: "a", projectNumber: 0 }, { id: "b", projectNumber: 0 }) < 0, true, "then id");
}

// ---- 4. search / filters / counts see the whole result --------------------------------
{
  const rows = synthetic(1500);
  const sorted = filterAndSortOrders(rows, "", "all", "recent");
  const firstPage = orderListWindow(sorted.length, DEFAULT_ORDER_LIST_VIEW, initialOrderListWindow(DEFAULT_ORDER_LIST_VIEW));
  const needleIndex = sorted.findIndex(row => row.customerName === "Needle In Haystack");
  check(needleIndex >= firstPage.end, `the needle is beyond the first page (${needleIndex})`);
  const found = filterAndSortOrders(rows, "needle in", "all", "recent");
  eq(found.map(row => row.customerName), ["Needle In Haystack"], "search finds a row that was never on the first page");
  eq(quickFilterCount(rows, "unpaidBalance"), rows.filter(row => (row.remainingAmount ?? 0) > 0.009).length, "Unpaid count over all 1,500");
  eq(filterAndSortOrders(rows, "", "completed", "recent").length, 300, "Completed filter over all 1,500");
  // Revealing a selected row far down: its page, or enough rows mounted.
  eq(revealOrderListIndex({ mode: "paged", pageSize: 20 }, { page: 0, shown: 20 }, 1234).page, 61, "reveal: paged jumps to the page");
  eq(revealOrderListIndex({ mode: "loadMore", pageSize: 50 }, { page: 0, shown: 50 }, 1234).shown, 1250, "reveal: load more mounts enough");
  eq(revealOrderListIndex({ mode: "all", pageSize: 20 }, { page: 0, shown: 100 }, 1234).shown, 1300, "reveal: show all mounts enough");
  // Changing the size keeps the first visible row on screen.
  const resized = resizeOrderListWindow({ mode: "paged", pageSize: 20 }, { mode: "paged", pageSize: 50 }, { page: 5, shown: 20 }, 1500);
  eq(resized.page, 2, "20 → 50 per page keeps row 101 on screen (page 3)");
  eq(resizeOrderListWindow({ mode: "loadMore", pageSize: 20 }, { mode: "loadMore", pageSize: 10 }, { page: 0, shown: 80 }, 1500).shown, 80, "a smaller step never hides rows already shown");
}

// ---- 5. the preference ----------------------------------------------------------------
eq(normalizeOrderListViewPreference({ mode: "paged", pageSize: 50 }), { mode: "paged", pageSize: 50 }, "a stored choice");
eq(normalizeOrderListViewPreference({ mode: "infinite", pageSize: 7 }), DEFAULT_ORDER_LIST_VIEW, "unknown values fall back");
eq(normalizeOrderListViewPreference(null), DEFAULT_ORDER_LIST_VIEW, "nothing stored");
eq(normalizeOrderListViewPreference({ mode: "all", pageSize: "100" }), { mode: "all", pageSize: 100 }, "a string size");
check(orderListViewStorageKey("uid-a") !== orderListViewStorageKey("uid-b"), "the key carries the uid");

// ---- 6. the screen ---------------------------------------------------------------------
{
  const page = fs.readFileSync(path.join(__dirname, "../app/orders/page.tsx"), "utf8");
  check(!/\{filteredOrders\.map\(/.test(page), "no list draws filteredOrders whole");
  eq((page.match(/\{windowOrders\.map\(/g) ?? []).length, 2, "the sidebar list and the phone list draw the window");
  check(/<OrderListRail\s+orders=\{windowOrders\}/.test(page), "the folded rail shows the same window");
  eq((page.match(/studioCountLabel\(filteredOrders\.length/g) ?? []).length, 2, "both headers count the whole result");
  check(!/\[orderFilter, workspace, user\]\)/.test(page), "the Trash is no longer re-read on every filter click");
  check(/loadOrderListsWithTrash\(loadedWorkspace\.id/.test(page), "first load reads list and Trash once");
  check(!/orders=\{orders\}\s*\n\s*filter=\{orderFilter\}/.test(page), "the phone filter badges count what this person may see");
  const schedule = fs.readFileSync(path.join(__dirname, "../app/schedule/page.tsx"), "utf8");
  check(/<OrderListRail/.test(schedule) && !/footer=/.test(schedule.slice(schedule.indexOf("<OrderListRail"), schedule.indexOf("<OrderListRail") + 600)), "Schedule's rail is unchanged (no footer)");
}

// ---- 7. strings -----------------------------------------------------------------------
{
  const keys = [...Object.keys(ORDER_LIST_VIEW_TRANSLATIONS), "List view", "Load more", "Show all", "Collapsed order list"];
  for (const key of keys) {
    for (const language of ["Türkçe", "Deutsch", "العربية (Arabic)"] as const) {
      const translated = studioT(key, language);
      check(Boolean(translated) && translated !== key, `${key} / ${language}: translated (got "${translated}")`);
    }
    eq(studioT(key, "English"), key, `${key} / English`);
    for (const token of key.match(/\{[a-z]+\}/g) ?? []) {
      for (const language of ["Türkçe", "Deutsch", "العربية (Arabic)"] as const) {
        check(studioT(key, language).includes(token), `${key} / ${language}: keeps ${token}`);
      }
    }
  }
}

console.log(`${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
