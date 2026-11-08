// The first click on a sidebar section that opens on Cloud Functions (8 Nov 2026, the owner: "on the web, when we
// click Sales or Inventory, the FIRST clicks always come in with a delay").
//
// Why it was late: every callable is its own Cloud Run service, and none keeps an instance running. A screen whose
// first paint waits on a callable nobody has asked for a while waits for that service to start. Cloud Monitoring,
// 7 days to 8 Nov 2026: container start p50 2.0–3.2 s, p95 2.7–4.0 s for the calls below, against 45–340 ms for a
// warm answer. The second click lands on the instance the first one started, so it is quick. An instance serves
// every workspace, so "warm" is a property of the section's services, not of a workspace. Orders, Production,
// Customers, Notes, Calendar… draw from Firestore and are on screen at once; these four sections wait:
//   Sales        listSalesRows + listSalesChannels (getSalesCapability is warm: the shell asks it on every load)
//   Inventory    listInventoryItems, getInventorySummary, listSuppliers, listInventoryLocations,
//                getEbayListingLinks, getWooProductLinks
//   Messages     listCustomerInboxConversations + getCustomerChannelStatus (the customer inbox)
//   AI Replies   getQuickReplyPersonalSettings
//
// What this does: once the shell has settled, again when the tab comes back, and when the pointer or keyboard focus
// enters the sidebar, each of those sections that is in THIS person's menu sends its opening calls — the same
// callables its screen sends, all read-only, with the smallest answer the server allows (limit 1 where there is a
// limit) — so the services are already running when the click comes. The answers are thrown away and nothing is
// cached: the screen still asks for its own data when it opens, so what it shows is unchanged. A section is warmed at
// most once every WARM_INTERVAL_MS, across tabs, and never while the tab is hidden, the browser is offline or Save-Data
// is on. The section on screen is not called again: its own screen just did. The only thing kept on the device is the
// time of the last warm-up per section (localStorage "nv.sectionWarm/sales" = epoch ms): no account, no workspace.
//
// The pure part is here (no React, no Firebase) so scripts/check-section-warmup.mts can drive it; the hook that wires
// it to the shell is lib/studioflow/useSectionWarmup.ts.

/** Cloud Run keeps an idle instance for up to 15 minutes; warming more often than this buys nothing. */
export const WARM_INTERVAL_MS = 10 * 60 * 1000;

export type SectionWarmCall = {
  /** The callable the section's screen sends when it opens. */
  name: string;
  /** The smallest request the server answers normally: the screen's own fields, the smallest page. */
  payload: (companyId: string) => Record<string, unknown>;
};

/** Keyed by the href the sidebar draws for the section. */
export const SECTION_WARMUP: Readonly<Record<string, readonly SectionWarmCall[]>> = Object.freeze({
  "/sales": [
    // app/sales/page.tsx: the first page of the list, and the store directory for the filters.
    { name: "listSalesRows", payload: (companyId: string) => ({ companyId, includeBespoke: true, needsAttentionOnly: false, limit: 1 }) },
    { name: "listSalesChannels", payload: (companyId: string) => ({ companyId }) }
  ],
  "/inventory": [
    // app/inventory/InventoryContent.tsx: the list and the totals (one wait), suppliers, locations, the store links.
    { name: "listInventoryItems", payload: (companyId: string) => ({ companyId, limit: 1 }) },
    { name: "getInventorySummary", payload: (companyId: string) => ({ companyId }) },
    { name: "listSuppliers", payload: (companyId: string) => ({ companyId }) },
    { name: "listInventoryLocations", payload: (companyId: string) => ({ companyId }) },
    { name: "getEbayListingLinks", payload: (companyId: string) => ({ companyId }) },
    { name: "getWooProductLinks", payload: (companyId: string) => ({ companyId }) }
  ],
  "/inbox": [
    // app/inbox/InboxContent.tsx: the conversation list and the channel status.
    { name: "listCustomerInboxConversations", payload: (companyId: string) => ({ companyId, limit: 1 }) },
    { name: "getCustomerChannelStatus", payload: (companyId: string) => ({ companyId }) }
  ],
  "/quick-reply": [
    // app/quick-reply/page.tsx: the person's own reply settings (the rest of its first load is Firestore).
    { name: "getQuickReplyPersonalSettings", payload: (companyId: string) => ({ companyId }) }
  ]
});

export type SectionWarmupDeps = {
  call: (name: string, payload: Record<string, unknown>) => unknown;
  now: () => number;
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  /** False while the tab is hidden, offline or on Save-Data. */
  canRun: () => boolean;
};

export type SectionWarmup = {
  /**
   * Warms the sections among `hrefs` that are due. `current` is the path on screen: its section is only marked
   * warm, because its screen has just sent the same calls. Returns the hrefs whose calls went out.
   */
  warm: (companyId: string, hrefs: readonly string[], current?: string) => string[];
};

export function sectionWarmupKey(href: string) {
  return `nv.sectionWarm${href}`;
}

function onSection(path: string | undefined, href: string) {
  return Boolean(path) && (path === href || String(path).startsWith(`${href}/`));
}

export function createSectionWarmup(deps: SectionWarmupDeps): SectionWarmup {
  // This tab's own record, so a browser that refuses storage still warms at most once per interval.
  const memory = new Map<string, number>();
  const lastWarm = (key: string, at: number) => {
    let stored = 0;
    try {
      stored = Number(deps.read(key)) || 0;
    } catch {
      stored = 0;
    }
    // A stamp from the future (a clock moved back) would hold the section cold for ever: ignore it.
    if (stored > at + 60_000) stored = 0;
    return Math.max(memory.get(key) ?? 0, stored);
  };
  const mark = (key: string, at: number) => {
    memory.set(key, at);
    try {
      deps.write(key, String(at));
    } catch {
      /* storage unavailable: this tab's memory still holds it */
    }
  };
  return {
    warm(companyId, hrefs, current) {
      const started: string[] = [];
      if (!companyId) return started;
      let allowed = false;
      try {
        allowed = deps.canRun();
      } catch {
        allowed = false;
      }
      if (!allowed) return started;
      const at = deps.now();
      for (const href of new Set(hrefs)) {
        const calls = Object.prototype.hasOwnProperty.call(SECTION_WARMUP, href) ? SECTION_WARMUP[href] : undefined;
        if (!calls) continue;
        const key = sectionWarmupKey(href);
        if (at - lastWarm(key, at) < WARM_INTERVAL_MS) continue;
        mark(key, at);
        if (onSection(current, href)) continue;
        for (const entry of calls) {
          try {
            // Fire and forget: a refusal or a network error is the screen's to report when it opens, not this.
            Promise.resolve(deps.call(entry.name, entry.payload(companyId))).catch(() => undefined);
          } catch {
            /* a call that throws before it starts changes nothing for the others */
          }
        }
        started.push(href);
      }
      return started;
    }
  };
}
