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
  /** The search stopped at the safety cap with more orders left to look at. */
  searchCapped: boolean;
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
  let rows: Row[] = [];
  let cursor: SalesListCursor = null;
  let hasMore = false;
  let busyRequestId = 0;
  let scannedTotal = 0;

  const isCurrent = (requestGeneration: number, key: string) => requestGeneration === generation && key === filterKey;

  async function run(requestId: number, requestGeneration: number, key: string, requestFilter: Filter, requestCursor: SalesListCursor, append: boolean) {
    busyRequestId = requestId;
    deps.busy(true);
    try {
      const stale = () => !isCurrent(requestGeneration, key)                 // another filter or a reload since
        || (append ? requestId !== appendRequestId : requestId !== freshRequestId); // a newer request of this generation
      const cap = deps.searchCap || SALES_LIST_SEARCH_CAP;
      const wanted = deps.pageSize && deps.pageSize > 0 ? deps.pageSize : 0;
      let page = await deps.fetchPage(requestFilter, requestCursor, requestId);
      if (stale()) return;
      const found: Row[] = [];
      const seen = new Set((append ? rows : []).map(deps.rowId));
      const take = (list: Row[]) => { for (const row of list) { const id = deps.rowId(row); if (!seen.has(id)) { seen.add(id); found.push(row); } } };
      take(page.rows);
      let calls = 1;
      let looked = Number(page.scanned) || 0;
      // A short (or empty) filtered page with more behind it: keep going, same filter, next cursor.
      while (wanted && found.length < wanted && page.hasMore === true && page.nextCursor && calls < cap.calls && looked < cap.scanned) {
        page = await deps.fetchPage(requestFilter, page.nextCursor, requestId);
        if (stale()) return;                                                // the old filter's search stops here
        take(page.rows);
        calls += 1;
        looked += Number(page.scanned) || 0;
      }
      if (append) {
        appendRequestId = 0;
        rows = [...rows, ...found];
      } else {
        firstPageArrived = true;
        rows = found;
        scannedTotal = 0;
      }
      scannedTotal += looked;
      cursor = page.hasMore ? page.nextCursor : null;
      hasMore = page.hasMore === true && Boolean(page.nextCursor);
      const searchCapped = Boolean(wanted) && hasMore && found.length < wanted;
      deps.apply({ rows, cursor, hasMore, page, appended: append, requestId, filterKey: key, scanned: scannedTotal, searchCapped });
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
      const requestId = (nextRequestId += 1);
      freshRequestId = requestId;
      void run(requestId, generation, key, nextFilter, null, false);
      return requestId;
    },
    /**
     * The next page of the filter on screen, with its own cursor. Refused (0)
     * while its first page has not arrived, when there is nothing more, or
     * when a "Show more" is already in flight.
     */
    more(): number {
      if (!filter || !firstPageArrived || !hasMore || !cursor || appendRequestId) return 0;
      const requestId = (nextRequestId += 1);
      appendRequestId = requestId;
      void run(requestId, generation, filterKey, filter, cursor, true);
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
      if (busyRequestId) { busyRequestId = 0; deps.busy(false); }
    },
    snapshot() {
      return { generation, filterKey, rows: [...rows], cursor, hasMore, firstPageArrived };
    }
  };
}
