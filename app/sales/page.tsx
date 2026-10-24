"use client";

// Sales, Faz 1 — three read-only tabs over the callables that already exist.
//
// Orders are never changed from this screen. There is no New sale, no product
// creation, and no stock, payment or listing call anywhere in it. The list is the server's —
// paging, filtering and the assigned-member scope all happen in listSalesRows,
// which reads the canonical orders, so this file never decides who may see what.
//
// MC-2 (22 Oct 2026): store and brand filters, a per-store Channels list, and
// for the owner/admin only the optional brand set-up and store nicknames. Those
// four writes go to brand documents, nicknames and the Sales side document —
// never to an order — and the server refuses them for anybody else.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { loadWorkspaceContext, loadWorkspaceSettingsOverview, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { formatAmountInCurrency } from "@/lib/studioflow/orderCurrency";
import { studioT, studioLocaleTag } from "@/lib/studioflow/language";
import { createSalesListLoader, salesListFilterKey } from "@/lib/studioflow/salesListLoader";
import {
  fetchSalesCapability, fetchSalesRows, fetchSalesProducts, fetchSalesChannels,
  saveSalesBrand, deleteSalesBrand, setSalesOrderBrand, setSalesStoreNickname,
  salesOrderHref, salesChannelName, salesDateLabel, salesStoreLabel,
  type SalesCapability, type SalesRow, type SalesRowsPage, type SalesRowsRequest,
  type SalesProduct, type SalesChannel, type SalesStore, type SalesBrand
} from "@/lib/studioflow/sales";

type Tab = "sales" | "products" | "channels";
const TABS: { id: Tab; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "products", label: "Products" },
  { id: "channels", label: "Channels" }
];

// The vocabularies the server actually uses (functions/sales/rows.js:76-90).
const PAYMENT_LABELS: Record<string, string> = { paid: "Paid", partially_paid: "Part paid", unpaid: "Unpaid", refunded: "Refunded" };
const DELIVERY_LABELS: Record<string, string> = { delivered: "Delivered", dispatched: "Dispatched", in_progress: "In progress" };
const KIND_LABELS: Record<string, string> = { product_sale: "Product sale", bespoke_work: "Bespoke work", needs_review: "Needs review" };
const ATTENTION_LABELS: Record<string, string> = {
  classify: "Cannot tell what this is", finance_missing: "No finance figures yet", finance_stale: "Finance figures are out of date"
};
const STORE_STATUS_LABELS: Record<string, string> = { connected: "Connected", needs_attention: "Needs attention", disconnected: "Disconnected" };
const STORE_STATUS_PILL: Record<string, string> = { connected: "due-pill success", needs_attention: "due-pill warning", disconnected: "due-pill" };
const UNASSIGNED = "unassigned";
const SALES_PAGE_SIZE = 25;

export default function SalesPage() {
  const { user, loading: authLoading, language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language ?? "English"), [language]);
  const locale = studioLocaleTag(language ?? "English");

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  // The workspace's decimal separator, so a revenue reads the way the order card,
  // the Dashboard and the top bar print money (formatStudioMoney). "." until known.
  const [decimalSeparator, setDecimalSeparator] = useState(".");
  // The workspace's own currency SYMBOL: a row in that currency keeps the workspace format.
  const [workspaceCurrency, setWorkspaceCurrency] = useState("");
  const [capability, setCapability] = useState<SalesCapability | null>(null);
  const [tab, setTab] = useState<Tab>("sales");
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);

  const [rows, setRows] = useState<SalesRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // Orders looked at for this filter, and whether the search stopped at its
  // safety cap with orders still unchecked (lib/studioflow/salesListLoader.ts).
  const [searchState, setSearchState] = useState<{ scanned: number; capped: boolean }>({ scanned: 0, capped: false });
  // While a long search runs: orders looked at so far (0 = nothing to report yet).
  const [searchProgress, setSearchProgress] = useState(0);
  const [financeVisible, setFinanceVisible] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [includeBespoke, setIncludeBespoke] = useState(true);

  const [products, setProducts] = useState<SalesProduct[] | null>(null);
  const [productsError, setProductsError] = useState("");
  const [channels, setChannels] = useState<SalesChannel[] | null>(null);
  const [channelsError, setChannelsError] = useState("");

  // MC-2: the store directory and the optional brands, read once per workspace
  // (and again after an owner/admin change) for the filters and the Channels tab.
  const [stores, setStores] = useState<SalesStore[]>([]);
  const [brands, setBrands] = useState<SalesBrand[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [directoryVersion, setDirectoryVersion] = useState(0);
  const [storeFilter, setStoreFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [brandsExist, setBrandsExist] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ storeKey: string; value: string } | null>(null);
  const [brandDraft, setBrandDraft] = useState<{ brandId: string; name: string; storeKeys: string[] } | null>(null);

  // Every answer is stamped with the request that asked for it. A workspace or
  // account change bumps the stamp, so a slow reply from the workspace the user
  // has just left is dropped instead of being painted onto the new one.
  const requestId = useRef(0);
  const currentCompany = useRef("");

  // The list itself (MC-2 fix, 23 Oct 2026): every listSalesRows call gets its
  // own request id and the filter it was asked for. A filter change starts a new
  // generation, so a slow answer for the previous filter — or a "Show more"
  // asked before the change — is dropped, and pages of different filters never
  // merge (lib/studioflow/salesListLoader.ts, scripts/check-sales-list-requests.mjs).
  // The Products and Channels reads get their own sequence too: after a brand or
  // store-name change two directory reads can be in flight, and only the newest
  // may paint (a slow older answer would bring a deleted brand back on screen).
  const productsRequest = useRef(0);
  const channelsRequest = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;
  type ListFilter = Omit<SalesRowsRequest, "limit" | "cursor">;
  const listLoader = useRef<ReturnType<typeof createSalesListLoader<SalesRow, SalesRowsPage, ListFilter>> | null>(null);
  if (!listLoader.current) {
    listLoader.current = createSalesListLoader<SalesRow, SalesRowsPage, ListFilter>({
      // One more than a page: the loader keeps a look-ahead row, so "Show more"
      // only appears when a further sale has really been found.
      fetchPage: (filter, nextCursor) => fetchSalesRows({ ...filter, limit: SALES_PAGE_SIZE + 1, cursor: nextCursor }),
      // The server filters store/brand inside a scan window, so a filtered page
      // can be short or empty while more orders remain: keep asking (capped).
      pageSize: SALES_PAGE_SIZE,
      progress: (scanned) => setSearchProgress(scanned),
      apply: (update) => {
        setRows(update.rows);
        setHasMore(update.hasMore);
        setSearchState({ scanned: update.scanned, capped: update.searchCapped });
        setSearchProgress(0);
        setFinanceVisible(update.page.financeVisible);
        setBrandsExist(update.page.brandsExist === true);
      },
      busy: (value) => setListBusy(value),
      fail: (err) => setListError(friendlyErrorMessage(err, tRef.current)),
      reset: () => { setRows(null); setHasMore(false); setListError(""); setSearchState({ scanned: 0, capped: false }); setSearchProgress(0); },
      rowId: (row) => row.orderId
    });
  }

  useEffect(() => {
    if (authLoading) return;
    const uid = user?.uid ?? "";
    if (!uid) { setBooting(false); return; }
    const ticket = (requestId.current += 1);
    let cancelled = false;
    (async () => {
      setBooting(true);
      setError("");
      try {
        const loaded = await loadWorkspaceContext(uid);
        if (cancelled || ticket !== requestId.current) return;
        setWorkspace(loaded);
        currentCompany.current = loaded.id;
        listLoader.current?.invalidate();
        setDecimalSeparator(".");
        loadWorkspaceSettingsOverview(loaded.id)
          .then((overview) => {
            if (!cancelled && ticket === requestId.current) {
              setDecimalSeparator(overview.selectedDecimalSeparator === "," ? "," : ".");
              setWorkspaceCurrency(overview.selectedCurrency || "");
            }
          })
          .catch(() => { /* keep "." — the figure itself is the server's */ });
        const cap = await fetchSalesCapability(loaded.id);
        if (cancelled || ticket !== requestId.current) return;
        setCapability(cap);
      } catch (err) {
        if (cancelled || ticket !== requestId.current) return;
        setError(friendlyErrorMessage(err, t));
      } finally {
        if (!cancelled && ticket === requestId.current) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.uid, t]);

  // First page for the filters on screen; a new filter is a new generation.
  const loadRows = useCallback(() => {
    const companyId = currentCompany.current;
    if (!companyId || !listLoader.current) return;
    const filter: ListFilter = {
      companyId,
      channel: channelFilter || undefined,
      storeKey: storeFilter || undefined,
      brandId: brandFilter || undefined,
      includeBespoke, needsAttentionOnly
    };
    listLoader.current.load(salesListFilterKey(companyId, {
      channel: channelFilter, storeKey: storeFilter, brandId: brandFilter, includeBespoke, needsAttentionOnly
    }), filter);
  }, [channelFilter, storeFilter, brandFilter, includeBespoke, needsAttentionOnly]);

  useEffect(() => {
    if (!capability?.canOpenSales || tab !== "sales") return;
    loadRows();
  }, [capability?.canOpenSales, tab, loadRows]);

  useEffect(() => {
    if (!capability?.canOpenSales || tab !== "products" || !currentCompany.current) return;
    const ticket = requestId.current;
    const mine = (productsRequest.current += 1);
    (async () => {
      try {
        const page = await fetchSalesProducts(currentCompany.current);
        if (ticket !== requestId.current || mine !== productsRequest.current) return;
        setProducts(page.products);
        setProductsError("");
      } catch (err) {
        if (ticket !== requestId.current || mine !== productsRequest.current) return;
        setProductsError(friendlyErrorMessage(err, t));
        setProducts([]);
      }
    })();
  }, [capability?.canOpenSales, tab, t]);

  useEffect(() => {
    if (!capability?.canOpenSales || !currentCompany.current) return;
    const ticket = requestId.current;
    const mine = (channelsRequest.current += 1);
    (async () => {
      try {
        const page = await fetchSalesChannels(currentCompany.current);
        if (ticket !== requestId.current || mine !== channelsRequest.current) return;
        setChannels(page.channels);
        setStores(Array.isArray(page.stores) ? page.stores : []);
        setBrands(Array.isArray(page.brands) ? page.brands : []);
        setCanManage(page.canManage === true);
        setChannelsError("");
      } catch (err) {
        if (ticket !== requestId.current || mine !== channelsRequest.current) return;
        setChannelsError(friendlyErrorMessage(err, t));
        setChannels([]);
      }
    })();
  }, [capability?.canOpenSales, directoryVersion, t]);

  // One wrapper for the four owner/admin writes: busy flag, error text, then a
  // fresh directory and list, so the screen shows what the server now says.
  const manage = useCallback(async (work: (companyId: string) => Promise<unknown>) => {
    const companyId = currentCompany.current;
    if (!companyId) return false;
    setManageBusy(true);
    setManageError("");
    try {
      await work(companyId);
      setDirectoryVersion((value) => value + 1);
      if (tab === "sales") loadRows();
      return true;
    } catch (err) {
      setManageError(friendlyErrorMessage(err, t));
      return false;
    } finally {
      setManageBusy(false);
    }
  }, [loadRows, tab, t]);

  if (booting) return <AppShell><LoadingScreen /></AppShell>;

  if (error) {
    return <AppShell><section className="card app-card"><p className="layout-error">{error}</p></section></AppShell>;
  }

  if (!capability?.canOpenSales) {
    const why = capability?.reason === "no_access"
      ? t("Your workspace account does not include orders, so Sales is not available to you.")
      : t("Sales is not switched on for this workspace yet.");
    return (
      <AppShell>
        <section className="card app-card">
          <CardTitle icon="orders" eyebrow={t("Sales")} title={t("Sales")} />
          <p className="muted-copy">{why}</p>
          <p className="muted-copy" style={{ marginTop: 8 }}>
            <Link href="/orders">{t("Go to Orders")}</Link>
          </p>
        </section>
      </AppShell>
    );
  }

  const storeByKey = new Map(stores.map((store) => [store.storeKey, store]));
  const rowStoreLabel = (row: SalesRow) => {
    if (!row.storeKey) return t(salesChannelName(row.channel));
    const store = storeByKey.get(row.storeKey);
    return salesStoreLabel(store || { provider: row.channel, name: row.storeName, ordinal: row.storeOrdinal }, t);
  };
  const rowBrand = (row: SalesRow) => {
    if (row.brandState === "ambiguous") return <span className="muted-copy">{t("Two brands — choose one")}</span>;
    return row.brandName || <span className="muted-copy">—</span>;
  };
  const showBrandColumn = brandsExist || brands.length > 0;
  const lastSyncLabel = (ms: number) => (ms > 0
    ? new Date(ms).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : t("Never synced"));

  // During a long search the person sees it moving, not a bare "Loading…".
  const searchingLabel = listBusy && searchProgress > 0
    ? t("Checking orders… {count} so far").replace("{count}", searchProgress.toLocaleString(locale))
    : t("Loading…");

  const money = (row: SalesRow) => {
    if (!financeVisible) return "—";
    if (row.financeState !== "current" || row.revenue === null) return t("Not calculated");
    // row.currency is an ISO code ("USD"); passing it as the symbol printed "USD12.50" (ETSY-E2E r2).
    return formatAmountInCurrency(row.revenue, row.currency || "", { selectedCurrency: workspaceCurrency, selectedDecimalSeparator: decimalSeparator });
  };

  return (
    <AppShell>
      <section className="card app-card">
        <CardTitle icon="orders" eyebrow={t("Sales")} title={t("Sales")} />
        <p className="muted-copy">
          {t("Everything you have sold, from the orders you already have. Orders are not changed from this screen. The owner or an admin can manage brands and store names here.")}
        </p>
        {capability.scope === "assigned" ? (
          <p className="muted-copy" style={{ marginTop: 6 }}>{t("You are seeing the orders assigned to you, the same ones Orders shows you.")}</p>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? "button" : "button secondary"}
              onClick={() => setTab(entry.id)}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      </section>

      {tab === "sales" ? (
        <section className="card app-card">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <select className="app-input sales-filter-select" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label={t("Channel")}>
              <option value="">{t("Every channel")}</option>
              {["shopify", "etsy", "woocommerce", "square", "ebay", "amazon", "inbound", "manual"].map((id) => (
                <option key={id} value={id}>{t(salesChannelName(id))}</option>
              ))}
            </select>
            {stores.length > 1 ? (
              <select className="app-input sales-filter-select" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} aria-label={t("Store")}>
                <option value="">{t("Every store")}</option>
                {stores.map((store) => (
                  <option key={store.storeKey} value={store.storeKey}>{salesStoreLabel(store, t)}</option>
                ))}
              </select>
            ) : null}
            {brands.length > 0 ? (
              <select className="app-input sales-filter-select" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} aria-label={t("Brand")}>
                <option value="">{t("Every brand")}</option>
                {brands.map((brand) => <option key={brand.brandId} value={brand.brandId}>{brand.name}</option>)}
                <option value={UNASSIGNED}>{t("No brand")}</option>
              </select>
            ) : null}
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={needsAttentionOnly} onChange={(event) => setNeedsAttentionOnly(event.target.checked)} />
              {t("Needs attention only")}
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={includeBespoke} onChange={(event) => setIncludeBespoke(event.target.checked)} />
              {t("Include bespoke work")}
            </label>
          </div>

          {listError ? <p className="layout-error">{listError}</p> : null}

          {rows === null ? (
            <p className="muted-copy" data-testid="sales-search-progress">{searchingLabel}</p>
          ) : rows.length === 0 && searchState.capped ? (
            // Not a verdict: the search stopped at its cap with orders still unchecked.
            <div data-testid="sales-search-capped">
              <p className="muted-copy">
                {t("Checked {count} orders, no match yet.").replace("{count}", searchState.scanned.toLocaleString(locale))}
              </p>
              <button type="button" className="button secondary" style={{ marginTop: 8 }} disabled={listBusy} onClick={() => listLoader.current?.more()}>
                {listBusy ? searchingLabel : t("Keep searching")}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="muted-copy">
              {needsAttentionOnly || channelFilter || storeFilter || brandFilter || !includeBespoke
                ? t("No sales match these filters.")
                : t("No sales yet. Orders you take will appear here.")}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="app-table">
                <thead>
                  <tr>
                    <th>{t("Date")}</th>
                    <th>{t("Customer")}</th>
                    <th>{t("What")}</th>
                    <th>{t("Store")}</th>
                    {showBrandColumn ? <th>{t("Brand")}</th> : null}
                    <th>{t("Payment")}</th>
                    <th>{t("Delivery")}</th>
                    <th style={{ textAlign: "right" }}>{t("Revenue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.orderId}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {row.orderDateMs > 0 ? salesDateLabel(row.orderDateMs, locale) : <span className="muted-copy">{t("Date unknown")}</span>}
                      </td>
                      <td>
                        <Link href={salesOrderHref(row.orderId)}>
                          {row.customerLabelWithheld ? t("Held by the marketplace") : (row.customerLabel || t("No name"))}
                        </Link>
                        {row.needsAttention ? (
                          <div className="muted-copy" style={{ fontSize: 12.5 }}>
                            {row.attentionReasons.map((reason) => t(ATTENTION_LABELS[reason] || reason)).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {row.summary || t(KIND_LABELS[row.kind] || row.kind)}
                        {row.itemCount > 2 ? <span className="muted-copy"> +{row.itemCount - 2}</span> : null}
                      </td>
                      <td>{rowStoreLabel(row)}</td>
                      {showBrandColumn ? (
                        <td>
                          {canManage && brands.length > 0 ? (
                            <select
                              className="app-input sales-filter-select"
                              style={{ minWidth: 120 }}
                              disabled={manageBusy}
                              aria-label={t("Brand")}
                              value={row.brandState === "override" ? (row.brandId || "") : ""}
                              onChange={(event) => {
                                const brandId = event.target.value;
                                void manage((companyId) => setSalesOrderBrand({ companyId, orderId: row.orderId, brandId }));
                              }}
                            >
                              <option value="">
                                {row.brandState === "store"
                                  ? `${t("From the store")}: ${row.brandName || ""}`
                                  : (row.brandState === "ambiguous" ? t("Two brands — choose one") : t("No brand"))}
                              </option>
                              {brands.map((brand) => <option key={brand.brandId} value={brand.brandId}>{brand.name}</option>)}
                            </select>
                          ) : rowBrand(row)}
                        </td>
                      ) : null}
                      <td>{t(PAYMENT_LABELS[row.paymentState] || row.paymentState)}</td>
                      <td>{t(DELIVERY_LABELS[row.deliveryState] || row.deliveryState)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* "Show more" only when a further sale is already in hand (look-ahead row). */}
          {hasMore && rows && rows.length > 0 ? (
            <button type="button" className="button secondary" style={{ marginTop: 12 }} disabled={listBusy} onClick={() => listLoader.current?.more()}>
              {listBusy ? searchingLabel : t("Show more")}
            </button>
          ) : null}
          {/* Rows on screen, none further found yet, and the cap stopped the search: say so. */}
          {!hasMore && searchState.capped && rows && rows.length > 0 ? (
            <div data-testid="sales-search-capped" style={{ marginTop: 12 }}>
              <p className="muted-copy">
                {t("Checked {count} orders so far. Older orders may still match.").replace("{count}", searchState.scanned.toLocaleString(locale))}
              </p>
              <button type="button" className="button secondary" style={{ marginTop: 8 }} disabled={listBusy} onClick={() => listLoader.current?.more()}>
                {listBusy ? searchingLabel : t("Keep searching")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "products" ? (
        <section className="card app-card">
          <CardTitle icon="storage" eyebrow={t("Sales")} title={t("Products")} />
          {productsError ? <p className="layout-error">{productsError}</p> : null}
          {products === null ? (
            <p className="muted-copy">{t("Loading…")}</p>
          ) : products.length === 0 ? (
            <>
              <p className="muted-copy">{t("No products yet.")}</p>
              <p className="muted-copy" style={{ marginTop: 6 }}>
                {t("Your sales are listed from the orders you have taken. Products will appear here once your workspace has them.")}
              </p>
            </>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="app-table">
                <thead><tr><th>{t("Name")}</th><th>{t("SKU")}</th><th>{t("Channel")}</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.productId}>
                      <td>{product.name || t("No name")}</td>
                      <td>{product.sku || "—"}</td>
                      <td>{product.channel ? t(salesChannelName(product.channel)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "channels" ? (
        <section className="card app-card">
          <CardTitle icon="dashboard" eyebrow={t("Sales")} title={t("Channels")} />
          {channelsError ? <p className="layout-error">{channelsError}</p> : null}
          {channels === null ? (
            <p className="muted-copy">{t("Loading…")}</p>
          ) : (
            <>
              <p className="muted-copy">{t("Where your sales come from. Connect or disconnect a channel in Settings → Integrations.")}</p>
              <p className="muted-copy" style={{ marginTop: 4, fontSize: 12.5 }}>
                {t("Connected means the channel is linked to this workspace. It does not mean orders have arrived from it. Channel orders are read-only here; where a channel supports it, product and stock links are managed per channel in Inventory.")}
              </p>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {channels.map((channel) => (
                  <div key={channel.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px" }}>
                    <strong>{t(salesChannelName(channel.id))}</strong>
                    <span className={channel.connected ? "due-pill success" : "due-pill"}>
                      {channel.unavailable
                        ? t("Could not check")
                        : channel.connected
                          ? (channel.connectionCount > 1 ? `${t("Connected")} · ${channel.connectionCount}` : t("Connected"))
                          : t("Not connected")}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted-copy" style={{ marginTop: 12, fontSize: 12.5 }}>
                {t("Amazon is not listed here: its connection lives outside this project, so this screen cannot check it without guessing.")}
              </p>

              <h3 style={{ marginTop: 20, fontSize: 15 }}>{t("Stores")}</h3>
              <p className="muted-copy" style={{ fontSize: 12.5 }}>
                {t("Each connected shop account on its own, so two stores on the same platform are never mixed.")}
              </p>
              {manageError ? <p className="layout-error">{manageError}</p> : null}
              {stores.length === 0 ? (
                <p className="muted-copy" style={{ marginTop: 8 }}>{t("No stores connected yet.")}</p>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {stores.map((store) => (
                    <div key={store.storeKey} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ overflowWrap: "anywhere" }}>{salesStoreLabel(store, t)}</strong>
                        <span className={STORE_STATUS_PILL[store.status] || "due-pill"}>{t(STORE_STATUS_LABELS[store.status] || store.status)}</span>
                      </div>
                      {store.address ? <span className="muted-copy" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>{store.address}</span> : null}
                      <span className="muted-copy" style={{ fontSize: 12.5 }}>
                        {t("Last sync")}: {lastSyncLabel(store.lastSyncAtMs)}
                        {store.errorCode ? ` · ${t("Error code")}: ${store.errorCode}` : ""}
                      </span>
                      {canManage ? (
                        renaming?.storeKey === store.storeKey ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <input
                              className="app-input"
                              value={renaming.value}
                              maxLength={60}
                              aria-label={t("Store name")}
                              placeholder={t("Store name")}
                              onChange={(event) => setRenaming({ storeKey: store.storeKey, value: event.target.value })}
                            />
                            <button type="button" className="button" disabled={manageBusy} onClick={async () => {
                              const ok = await manage((companyId) => setSalesStoreNickname({ companyId, storeKey: store.storeKey, nickname: renaming.value.trim() }));
                              if (ok) setRenaming(null);
                            }}>{t("Save")}</button>
                            <button type="button" className="button secondary" onClick={() => setRenaming(null)}>{t("Cancel")}</button>
                          </div>
                        ) : (
                          <div>
                            <button type="button" className="button secondary" onClick={() => setRenaming({ storeKey: store.storeKey, value: store.nickname || "" })}>{t("Rename")}</button>
                          </div>
                        )
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ marginTop: 20, fontSize: 15 }}>{t("Brands")}</h3>
              <p className="muted-copy" style={{ fontSize: 12.5 }}>
                {t("Brands are optional. Link a brand to the stores it sells through; an order from a store with two brands waits for you to choose.")}
              </p>
              {brands.length === 0 && !canManage ? <p className="muted-copy" style={{ marginTop: 8 }}>{t("No brands yet.")}</p> : null}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {brands.map((brand) => (
                  <div key={brand.brandId} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ overflowWrap: "anywhere" }}>{brand.name}</strong>
                      {canManage ? (
                        <span style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="button secondary" onClick={() => setBrandDraft({ brandId: brand.brandId, name: brand.name, storeKeys: brand.storeKeys })}>{t("Edit")}</button>
                          <button type="button" className="button secondary" disabled={manageBusy} onClick={() => {
                            if (!window.confirm(t("Delete this brand? Orders keep their store; nothing else changes."))) return;
                            void manage((companyId) => deleteSalesBrand({ companyId, brandId: brand.brandId }));
                          }}>{t("Delete")}</button>
                        </span>
                      ) : null}
                    </div>
                    <span className="muted-copy" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>
                      {brand.storeKeys.length
                        ? brand.storeKeys.map((key) => { const store = storeByKey.get(key); return store ? salesStoreLabel(store, t) : t("Store"); }).join(", ")
                        : t("Not linked to a store yet")}
                    </span>
                  </div>
                ))}
              </div>
              {canManage ? (
                brandDraft ? (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginTop: 10, display: "grid", gap: 8 }}>
                    <input
                      className="app-input"
                      value={brandDraft.name}
                      maxLength={60}
                      aria-label={t("Brand name")}
                      placeholder={t("Brand name")}
                      onChange={(event) => setBrandDraft({ ...brandDraft, name: event.target.value })}
                    />
                    <span className="muted-copy" style={{ fontSize: 12.5 }}>{t("Linked stores")}</span>
                    {stores.length === 0 ? <span className="muted-copy" style={{ fontSize: 12.5 }}>{t("No stores connected yet.")}</span> : null}
                    {stores.map((store) => (
                      <label key={store.storeKey} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={brandDraft.storeKeys.includes(store.storeKey)}
                          onChange={(event) => setBrandDraft({
                            ...brandDraft,
                            storeKeys: event.target.checked
                              ? [...brandDraft.storeKeys, store.storeKey]
                              : brandDraft.storeKeys.filter((key) => key !== store.storeKey)
                          })}
                        />
                        <span style={{ overflowWrap: "anywhere" }}>{salesStoreLabel(store, t)}</span>
                      </label>
                    ))}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="button" disabled={manageBusy || !brandDraft.name.trim()} onClick={async () => {
                        const draft = brandDraft;
                        const ok = await manage((companyId) => saveSalesBrand({
                          companyId, brandId: draft.brandId || undefined, name: draft.name.trim(), storeKeys: draft.storeKeys
                        }));
                        if (ok) setBrandDraft(null);
                      }}>{t("Save")}</button>
                      <button type="button" className="button secondary" onClick={() => setBrandDraft(null)}>{t("Cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="button secondary" style={{ marginTop: 10 }} onClick={() => setBrandDraft({ brandId: "", name: "", storeKeys: [] })}>
                    {t("New brand")}
                  </button>
                )
              ) : (
                <p className="muted-copy" style={{ marginTop: 8, fontSize: 12.5 }}>{t("Only the owner or an admin can change brands and store names.")}</p>
              )}
            </>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
