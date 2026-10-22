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
// No React and no Firebase here, so scripts/check-sales-list-requests.mjs can
// run it with a fake fetch and controlled delays.

export type SalesListCursor = { ms: number; id: string } | null;

export type SalesListPage<Row> = {
  rows: Row[];
  nextCursor: SalesListCursor;
  hasMore: boolean;
};

export type SalesListUpdate<Row, Page extends SalesListPage<Row>> = {
  /** The whole list for this filter after this page (first page, or merged). */
  rows: Row[];
  cursor: SalesListCursor;
  hasMore: boolean;
  page: Page;
  appended: boolean;
  requestId: number;
  filterKey: string;
};

export type SalesListLoaderDeps<Row, Page extends SalesListPage<Row>, Filter> = {
  fetchPage: (filter: Filter, cursor: SalesListCursor, requestId: number) => Promise<Page>;
  apply: (update: SalesListUpdate<Row, Page>) => void;
  busy: (busy: boolean) => void;
  fail: (error: unknown) => void;
  /** Called when a fresh load starts, before its answer: the old list is not this filter's. */
  reset?: () => void;
  rowId: (row: Row) => string;
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

  const isCurrent = (requestGeneration: number, key: string) => requestGeneration === generation && key === filterKey;

  async function run(requestId: number, requestGeneration: number, key: string, requestFilter: Filter, requestCursor: SalesListCursor, append: boolean) {
    busyRequestId = requestId;
    deps.busy(true);
    try {
      const page = await deps.fetchPage(requestFilter, requestCursor, requestId);
      if (!isCurrent(requestGeneration, key)) return;                       // another filter or a reload since
      if (append ? requestId !== appendRequestId : requestId !== freshRequestId) return; // a newer request of this generation
      if (append) {
        appendRequestId = 0;
        const seen = new Set(rows.map(deps.rowId));
        rows = [...rows, ...page.rows.filter((row) => !seen.has(deps.rowId(row)))];
      } else {
        firstPageArrived = true;
        rows = [...page.rows];
      }
      cursor = page.hasMore ? page.nextCursor : null;
      hasMore = page.hasMore === true && Boolean(page.nextCursor);
      deps.apply({ rows, cursor, hasMore, page, appended: append, requestId, filterKey: key });
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
      rows = [];
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
      rows = [];
      cursor = null;
      hasMore = false;
      if (busyRequestId) { busyRequestId = 0; deps.busy(false); }
    },
    snapshot() {
      return { generation, filterKey, rows: [...rows], cursor, hasMore, firstPageArrived };
    }
  };
}
