// Sales list requests (MC-2 fix, 23 Oct 2026): every listSalesRows call is
// stamped with a request id and the filter it was asked for, and only the
// newest request for the filter on screen may change the list.
//
//   * A filter change (store, brand, channel, checkboxes) or a reload starts a
//     new generation. Any answer from an older generation — a slow first page
//     for the previous filter, or a "Show more" asked before the change — is
//     dropped instead of being painted over the new filter.
//   * "Show more" only appends to the generation it belongs to, only once the
//     first page of that generation has arrived, and only with that
//     generation's own cursor. Pages from different filters never merge, and a
//     row already on screen is never added twice.
//   * The busy flag belongs to the newest request; a dropped answer cannot
//     clear it, and neither can its error.
//
//   * A filtered page can come back short or EMPTY with hasMore=true: the
//     server scans a window of orders (limit × 2) and applies the store/brand
//     filter inside it. With `pageSize` set, one load or "Show more" keeps
//     asking with the next cursor until it has a page of rows, the server says
//     there is nothing more, or a safety cap (20 calls / 1000 orders looked at)
//     is reached — and every step re-checks that its filter is still the one on
//     screen, so a filter change stops the old search (23 Oct 2026, S-5).
//   * One row of look-ahead (S6c/S6d, 23 Oct): the loader looks for pageSize + 1
//     rows and shows pageSize. "Show more" (`hasMore`) therefore means a further
//     row has really been FOUND — the server's hasMore alone can be true with
//     nothing behind it (exactly a page of matches at the front). When the cap
//     stops the search before that row is found while the server still has
//     orders, the update says `searchCapped` (the screen offers "Keep searching"
//     with the count), whether or not rows are already on screen.
//   * `progress(scanned)` reports, during a long search, how many orders have
//     been looked at so far for this filter.
//
// No React and no Firebase here, so scripts/check-sales-list-requests.mjs can
// run it with a fake fetch and controlled delays.

export type SalesListCursor = { ms: number; id: string } | null;

export type SalesListPage<Row> = {
  rows: Row[];
  nextCursor: SalesListCursor;
  hasMore: boolean;
  /** Orders the server looked at for this page (listSalesRows `scanned`). */
  scanned?: number;
};

/** One load or "Show more" never asks more than this before handing back to the person. */
export const SALES_LIST_SEARCH_CAP = Object.freeze({ calls: 20, scanned: 1000 });

export type SalesListUpdate<Row, Page extends SalesListPage<Row>> = {
  /** The whole list for this filter after this page (first page, or merged). */
  rows: Row[];
  cursor: SalesListCursor;
  hasMore: boolean;
  page: Page;
  appended: boolean;
  requestId: number;
  filterKey: string;
  /** Orders looked at for this filter so far (all pages of this generation). */
  scanned: number;
  /** The search stopped at the safety cap with more orders left to look at (no further row found yet). */
  searchCapped: boolean;
  /** Rows this update added to the screen (0 for a first page with no rows). */
  added: number;
};

export type SalesListLoaderDeps<Row, Page extends SalesListPage<Row>, Filter> = {
  fetchPage: (filter: Filter, cursor: SalesListCursor, requestId: number) => Promise<Page>;
  apply: (update: SalesListUpdate<Row, Page>) => void;
  busy: (busy: boolean) => void;
  fail: (error: unknown) => void;
  /** Called when a fresh load starts, before its answer: the old list is not this filter's. */
  reset?: () => void;
  rowId: (row: Row) => string;
  /** Rows wanted per load/"Show more"; set it to keep asking past short filtered pages. */
  pageSize?: number;
  /** Override the safety cap (tests). */
  searchCap?: { calls: number; scanned: number };
  /** During a multi-call search: orders looked at so far for this filter. */
  progress?: (scanned: number) => void;
};

/** A stable key for one filter on one workspace. */
export function salesListFilterKey(companyId: string, filter: Record<string, unknown>): string {
  return JSON.stringify([companyId, ...Object.keys(filter).sort().map((name) => [name, filter[name] ?? null])]);
}

export function createSalesListLoader<Row, Page extends SalesListPage<Row>, Filter>(deps: SalesListLoaderDeps<Row, Page, Filter>) {
  let nextRequestId = 0;
  let generation = 0;
  let filterKey = "";
  let filter: Filter | null = null;
  let freshRequestId = 0;       // the first-page request this generation waits for
  let appendRequestId = 0;      // the one "Show more" request this generation may accept
  let firstPageArrived = false;
  let rows: Row[] = [];         // every row found for this generation (shown + look-ahead)
  let shown = 0;                // how many of them are on screen
  let cursor: SalesListCursor = null;   // the server's next cursor
  let hasMore = false;                  // the server says there are orders it has not looked at
  let lastPage: Page | null = null;
  let busyRequestId = 0;
  let scannedTotal = 0;

  const isCurrent = (requestGeneration: number, key: string) => requestGeneration === generation && key === filterKey;
  const wanted = deps.pageSize && deps.pageSize > 0 ? deps.pageSize : 0;

  async function run(requestId: number, requestGeneration: number, key: string, requestFilter: Filter, append: boolean) {
    busyRequestId = requestId;
    deps.busy(true);
    try {
      const stale = () => !isCurrent(requestGeneration, key)                 // another filter or a reload since
        || (append ? requestId !== appendRequestId : requestId !== freshRequestId); // a newer request of this generation
      const cap = deps.searchCap || SALES_LIST_SEARCH_CAP;
      const found: Row[] = append ? [...rows] : [];
      const seen = new Set(found.map(deps.rowId));
      let nextCursor = append ? cursor : null;
      let more = append ? hasMore : true;
      let page = lastPage;
      let calls = 0;
      let looked = 0;
      const before = append ? scannedTotal : 0;
      // Without pageSize: exactly one call (the Faz 1 behaviour). With it: until
      // pageSize + 1 rows past what is on screen are found (look-ahead), the
      // server has nothing more, or the cap.
      const target = wanted ? (append ? shown : 0) + wanted + 1 : 0;
      while (wanted ? (found.length < target && more && (calls === 0 || nextCursor) && calls < cap.calls && looked < cap.scanned) : calls === 0) {
        if (append && !nextCursor) break;
        page = await deps.fetchPage(requestFilter, nextCursor, requestId);
        if (stale()) return;                                                // the old filter's search stops here
        for (const row of page.rows) { const id = deps.rowId(row); if (!seen.has(id)) { seen.add(id); found.push(row); } }
        calls += 1;
        looked += Number(page.scanned) || 0;
        more = page.hasMore === true && Boolean(page.nextCursor);
        nextCursor = more ? page.nextCursor : null;
        if (wanted && deps.progress) deps.progress(before + looked);
      }
      if (stale() || !page) return;
      if (append) appendRequestId = 0; else firstPageArrived = true;
      const previouslyShown = append ? shown : 0;
      rows = found;
      cursor = nextCursor;
      hasMore = more;
      lastPage = page;
      scannedTotal = before + looked;
      shown = wanted ? Math.min(rows.length, previouslyShown + wanted) : rows.length;
      // "Show more" only for a row already found; the server's hasMore alone is "keep searching".
      const showMore = wanted ? rows.length > shown : hasMore;
      const searchCapped = Boolean(wanted) && !showMore && hasMore;
      deps.apply({ rows: rows.slice(0, shown), cursor, hasMore: showMore, page, appended: append, requestId, filterKey: key,
        scanned: scannedTotal, searchCapped, added: shown - previouslyShown });
    } catch (error) {
      if (!isCurrent(requestGeneration, key)) return;
      if (append ? requestId !== appendRequestId : requestId !== freshRequestId) return;
      if (append) appendRequestId = 0;
      deps.fail(error);
    } finally {
      if (busyRequestId === requestId) { busyRequestId = 0; deps.busy(false); }
    }
  }

  return {
    /** First page for this filter. Always starts a new generation. */
    load(key: string, nextFilter: Filter): number {
      generation += 1;
      filterKey = key;
      filter = nextFilter;
      firstPageArrived = false;
      appendRequestId = 0;
      rows = []; scannedTotal = 0;
      cursor = null;
      hasMore = false;
      deps.reset?.();
      shown = 0;
      lastPage = null;
      const requestId = (nextRequestId += 1);
      freshRequestId = requestId;
      void run(requestId, generation, key, nextFilter, false);
      return requestId;
    },
    /**
     * The next page of the filter on screen ("Show more" / "Keep searching"),
     * with its own cursor. Refused (0) while its first page has not arrived,
     * when nothing is left (no row in hand, nothing unread on the server), or
     * when one is already in flight.
     */
    more(): number {
      if (!filter || !firstPageArrived || appendRequestId) return 0;
      if (!(rows.length > shown) && !(hasMore && cursor)) return 0;
      const requestId = (nextRequestId += 1);
      appendRequestId = requestId;
      void run(requestId, generation, filterKey, filter, true);
      return requestId;
    },
    /** Workspace or account change: every answer in flight is dropped. */
    invalidate() {
      generation += 1;
      filterKey = "";
      filter = null;
      firstPageArrived = false;
      appendRequestId = 0;
      freshRequestId = 0;
      rows = []; scannedTotal = 0;
      cursor = null;
      hasMore = false;
      shown = 0;
      lastPage = null;
      if (busyRequestId) { busyRequestId = 0; deps.busy(false); }
    },
    snapshot() {
      return { generation, filterKey, rows: rows.slice(0, shown), cursor, hasMore, firstPageArrived };
    }
  };
}
