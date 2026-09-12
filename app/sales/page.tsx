"use client";

// Sales, Faz 1 — three read-only tabs over the callables that already exist.
//
// This screen writes nothing. There is no New sale, no product creation, and no
// stock, payment or listing call anywhere in it: the only imports are the four
// reads in lib/studioflow/sales.ts. The list is the server's — paging, filtering
// and the assigned-member scope all happen in listSalesRows, which reads the
// canonical orders, so this file never decides who may see what.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { loadWorkspaceContext, type WorkspaceContext } from "@/lib/studioflow/firestore";
import { studioT, studioLocaleTag } from "@/lib/studioflow/language";
import {
  fetchSalesCapability, fetchSalesRows, fetchSalesProducts, fetchSalesChannels,
  salesOrderHref, salesChannelName, salesDateLabel,
  type SalesCapability, type SalesRow, type SalesCursor,
  type SalesProduct, type SalesChannel
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

export default function SalesPage() {
  const { user, loading: authLoading, language } = useAuth();
  const t = useCallback((text: string) => studioT(text, language ?? "English"), [language]);
  const locale = studioLocaleTag(language ?? "English");

  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [capability, setCapability] = useState<SalesCapability | null>(null);
  const [tab, setTab] = useState<Tab>("sales");
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);

  const [rows, setRows] = useState<SalesRow[] | null>(null);
  const [cursor, setCursor] = useState<SalesCursor>(null);
  const [hasMore, setHasMore] = useState(false);
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

  // Every answer is stamped with the request that asked for it. A workspace or
  // account change bumps the stamp, so a slow reply from the workspace the user
  // has just left is dropped instead of being painted onto the new one.
  const requestId = useRef(0);
  const currentCompany = useRef("");

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
        const cap = await fetchSalesCapability(loaded.id);
        if (cancelled || ticket !== requestId.current) return;
        setCapability(cap);
      } catch (err) {
        if (cancelled || ticket !== requestId.current) return;
        setError(err instanceof Error ? err.message : t("Could not load."));
      } finally {
        if (!cancelled && ticket === requestId.current) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.uid, t]);

  const loadRows = useCallback(async (nextCursor: SalesCursor) => {
    const companyId = currentCompany.current;
    if (!companyId) return;
    const ticket = requestId.current;
    setListBusy(true);
    setListError("");
    try {
      const page = await fetchSalesRows({
        companyId, limit: 25, cursor: nextCursor,
        channel: channelFilter || undefined,
        includeBespoke, needsAttentionOnly
      });
      if (ticket !== requestId.current || companyId !== currentCompany.current) return;
      setRows((previous) => (nextCursor && previous ? [...previous, ...page.rows] : page.rows));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setFinanceVisible(page.financeVisible);
    } catch (err) {
      if (ticket !== requestId.current) return;
      setListError(err instanceof Error ? err.message : t("Could not load."));
    } finally {
      if (ticket === requestId.current) setListBusy(false);
    }
  }, [channelFilter, includeBespoke, needsAttentionOnly, t]);

  useEffect(() => {
    if (!capability?.canOpenSales || tab !== "sales") return;
    setRows(null);
    void loadRows(null);
  }, [capability?.canOpenSales, tab, loadRows]);

  useEffect(() => {
    if (!capability?.canOpenSales || tab !== "products" || !currentCompany.current) return;
    const ticket = requestId.current;
    (async () => {
      try {
        const page = await fetchSalesProducts(currentCompany.current);
        if (ticket !== requestId.current) return;
        setProducts(page.products);
        setProductsError("");
      } catch (err) {
        if (ticket !== requestId.current) return;
        setProductsError(err instanceof Error ? err.message : t("Could not load."));
        setProducts([]);
      }
    })();
  }, [capability?.canOpenSales, tab, t]);

  useEffect(() => {
    if (!capability?.canOpenSales || tab !== "channels" || !currentCompany.current) return;
    const ticket = requestId.current;
    (async () => {
      try {
        const page = await fetchSalesChannels(currentCompany.current);
        if (ticket !== requestId.current) return;
        setChannels(page.channels);
        setChannelsError("");
      } catch (err) {
        if (ticket !== requestId.current) return;
        setChannelsError(err instanceof Error ? err.message : t("Could not load."));
        setChannels([]);
      }
    })();
  }, [capability?.canOpenSales, tab, t]);

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

  const money = (row: SalesRow) => {
    if (!financeVisible) return "—";
    if (row.financeState !== "current" || row.revenue === null) return t("Not calculated");
    return `${row.currency || ""}${row.revenue.toFixed(2)}`;
  };

  return (
    <AppShell>
      <section className="card app-card">
        <CardTitle icon="orders" eyebrow={t("Sales")} title={t("Sales")} />
        <p className="muted-copy">
          {t("Everything you have sold, from the orders you already have. Nothing here is created or changed.")}
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
            <select className="app-input" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} aria-label={t("Channel")}>
              <option value="">{t("Every channel")}</option>
              {["shopify", "etsy", "woocommerce", "square", "ebay", "inbound", "manual"].map((id) => (
                <option key={id} value={id}>{salesChannelName(id)}</option>
              ))}
            </select>
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
            <p className="muted-copy">{t("Loading…")}</p>
          ) : rows.length === 0 ? (
            <p className="muted-copy">
              {needsAttentionOnly || channelFilter || !includeBespoke
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
                    <th>{t("Channel")}</th>
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
                      <td>{salesChannelName(row.channel)}</td>
                      <td>{t(PAYMENT_LABELS[row.paymentState] || row.paymentState)}</td>
                      <td>{t(DELIVERY_LABELS[row.deliveryState] || row.deliveryState)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMore ? (
            <button type="button" className="button secondary" style={{ marginTop: 12 }} disabled={listBusy} onClick={() => void loadRows(cursor)}>
              {listBusy ? t("Loading…") : t("Show more")}
            </button>
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
                      <td>{product.channel ? salesChannelName(product.channel) : "—"}</td>
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
                {t("Connected means the channel is linked to this workspace. It does not mean orders have arrived from it, and products and stock are not synced from any channel yet.")}
              </p>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {channels.map((channel) => (
                  <div key={channel.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px" }}>
                    <strong>{salesChannelName(channel.id)}</strong>
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
            </>
          )}
        </section>
      ) : null}
    </AppShell>
  );
}
