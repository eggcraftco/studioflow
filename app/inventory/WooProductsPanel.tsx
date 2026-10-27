"use client";

// Inventory ▸ WooCommerce products (MC-3, 22 Oct 2026; TickToon pilot): "Read → match to existing stock → bring in the
// selected ones → read back". The server reads the store's products and variations (GET only) and answers each row —
// a simple product, or one variation — with where it stands: already linked, one card with exactly its SKU (a
// proposal), ambiguous (every candidate shown; the person must confirm), or nothing. Sold-out and archived products sit
// in their own list and are never preselected. Nothing is brought in until a row is ticked and has its decision: link
// to a card, or make a new card with the opening count the PERSON types (the store's stock figure is the store's, and
// often not tracked at all) — or, for a one-off, the person's "this item is here". No cost is ever taken from the
// store. Prices come only when the server sends them (Financial Info). Same look as the eBay listings panel.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { InventoryItem } from "@/lib/studioflow/inventory";
import { studioLocaleTag } from "@/lib/studioflow/language";
import { getWooProductLinks, previewWooProducts, importWooProducts, wooInventoryT, type WooLinksAnswer } from "@/lib/studioflow/wooInventory";
import {
  applyImportResults, canChoose, countsOf, decisionProblem, decisionsToSend, fill, filterRows, preselectCategory, productRowsOf, reasonSentence, rowsToMatch, rowStateSentence, startingDecision, storeStockSentence,
  type WooDecision, type WooImportRow, type WooProductRow
} from "@/lib/studioflow/wooInventoryRules";

type Props = {
  workspace: WorkspaceContext;
  language: string;
  canEdit: boolean;
  items: InventoryItem[];
  categoryOptions: string[];
  /** The workspace's default category (Inventory ▸ Categories), the last fallback for a new card's category. */
  defaultCategory?: string;
  onStockChanged?: () => void | Promise<void>;
  /** Opens a card in the item list (27 Oct: the row that was just brought in says which card, and opens it). */
  onOpenCard?: (inventoryItemId: string) => void;
};

function priceText(price: { value: string; currency: string } | null, locale: string): string {
  if (!price) return "";
  try { return price.currency ? new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(Number(price.value)) : price.value; }
  catch { return `${price.value} ${price.currency}`.trim(); }
}

const FILTERS: Array<[string, string]> = [["active", "For sale"], ["needs_choice", "Needs a choice"], ["sku_match", "Same SKU"], ["linked", "Linked"], ["inactive", "Sold out or archived"]];
const EMPTY: WooDecision = { action: "", inventoryItemId: "", trackingType: "", openingCount: "", inHand: false, confirmAmbiguous: false, category: "" };

export function WooProductsPanel({ workspace, language, canEdit, items, categoryOptions, defaultCategory = "", onStockChanged, onOpenCard }: Props) {
  const t = useCallback((sentence: string) => wooInventoryT(sentence, language), [language]);
  const locale = studioLocaleTag(language);
  const companyId = workspace.id.trim();
  const [status, setStatus] = useState<WooLinksAnswer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [busy, setBusy] = useState("");
  const [answer, setAnswer] = useState<Record<string, unknown> | null>(null);
  const [refusal, setRefusal] = useState("");
  const [filter, setFilter] = useState("active");
  const [chosen, setChosen] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, WooDecision>>({});
  const [search, setSearch] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, WooImportRow>>({});
  const [summary, setSummary] = useState("");
  // The store the list on screen belongs to. A workspace can hold several stores (EGGcraft + TickToon, 23 Oct): the
  // list, the ticks and the decisions are ONE store's, so changing the store empties them, and a read that answers
  // after the person has moved to another store is dropped (25 Oct fix: the old list stayed under the new store's
  // name and every import came back "not in the last read").
  const storeRef = useRef("");
  const chooseStore = useCallback((next: string) => {
    storeRef.current = next;
    setConnectionId(next);
    setAnswer(null); setRefusal(""); setError(""); setSummary(""); setResults({}); setChosen([]); setDecisions({}); setSearch({}); setFilter("active");
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      const now = await getWooProductLinks(companyId);
      setStatus(now);
      const connected = now.connections.filter((c) => c.status === "connected");
      // ?panel=woo&store=<connection> (Settings ▸ WooCommerce's link) opens that store; otherwise the first connected one.
      const asked = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("store") || "" : "";
      const first = connected.find((c) => c.connectionId === asked) || connected[0];
      if (!storeRef.current && first) { storeRef.current = first.connectionId; setConnectionId(first.connectionId); }
    } catch {
      setError(t("This could not be done."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);
  useEffect(() => { void load(); }, [load]);

  // What was brought in is linked NOW (27 Oct): the rows carry the import's answers until the store is read again.
  const rows = useMemo(() => applyImportResults(productRowsOf(answer), results), [answer, results]);
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const counts = useMemo(() => countsOf(rows), [rows]);
  const liveConnections = (status?.connections || []).filter((c) => c.status === "connected");
  const money = status?.money === true;
  const editable = canEdit && status?.canEdit === true;

  async function read() {
    const forStore = connectionId;
    if (!forStore) return;
    setBusy("read"); setError(""); setRefusal(""); setSummary(""); setResults({}); setChosen([]); setDecisions({}); setAnswer(null);
    try {
      const next = await previewWooProducts(companyId, forStore);
      if (storeRef.current !== forStore) return;   // the person moved to another store meanwhile
      if (next && next.ok === false) { setRefusal(String(next.reason || "provider_unavailable")); setAnswer(null); }
      else setAnswer(next);
    } catch (err) {
      if (storeRef.current !== forStore) return;
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally {
      setBusy("");
    }
  }

  function toggle(row: WooProductRow) {
    if (!canChoose(row)) return;
    setChosen((current) => (current.includes(row.linkId) ? current.filter((id) => id !== row.linkId) : [...current, row.linkId]));
    setDecisions((current) => (current[row.linkId] ? current : { ...current, [row.linkId]: startingDecision(row, preselectCategory(row, categoryOptions, defaultCategory).category) }));
  }
  const setDecision = (linkId: string, patch: Partial<WooDecision>) => setDecisions((current) => ({ ...current, [linkId]: { ...(current[linkId] || EMPTY), ...patch } }));

  // The list's own store: what was read is what is brought in, whatever the selector says.
  const answerStore = answer ? String(answer.connectionId || "") : "";
  const toSend = answerStore && answerStore === connectionId ? decisionsToSend(rows, chosen, decisions) : [];
  async function bringIn() {
    if (!toSend.length) return;
    setBusy("import"); setError(""); setSummary("");
    try {
      const done = await importWooProducts(companyId, answerStore, toSend);
      const byId: Record<string, WooImportRow> = {};
      for (const r of done) byId[r.linkId] = r;
      setResults((current) => ({ ...current, ...byId }));
      const created = done.filter((r) => r.result === "created").length;
      const linked = done.filter((r) => r.result === "linked" || r.result === "already_linked").length;
      const refused = done.filter((r) => r.result === "refused").length;
      setSummary(fill(t("{created} new cards · {linked} linked · {refused} not done"), { created, linked, refused }));
      setChosen((current) => current.filter((id) => byId[id] && byId[id].result === "refused"));
      if (onStockChanged) await onStockChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally {
      setBusy("");
    }
  }

  const cardLabel = (item: { number: string; name: string; sku?: string }) => `${item.number ? `${item.number} · ` : ""}${item.name}${item.sku ? ` (${item.sku})` : ""}`;
  const allCards = useMemo(() => items.filter((i) => i.ownership !== "customer" && i.status !== "archived" && i.status !== "removed"), [items]);

  return (
    <section className="ebay-inv" data-testid="woo-products-panel" aria-busy={busy !== "" || loading}>
      <header className="ebay-inv__head">
        <h2>{t("WooCommerce products")}</h2>
        <p className="inventory-sub">{t("Read your WooCommerce products, match them to your stock and bring in only the ones you choose. Nothing is written to your store.")}</p>
      </header>
      {loading ? <p className="muted-copy">{t("Loading…")}</p> : null}
      {error ? <p className="layout-error" role="alert">{error}</p> : null}
      {!loading && status && !status.enabled ? <p className="inventory-note" data-testid="woo-products-off">{t("WooCommerce products are not switched on for this workspace yet.")}</p> : null}
      {!loading && status && status.enabled && !liveConnections.length ? (
        <p className="inventory-note" data-testid="woo-products-no-connection">{t("Connect WooCommerce in Settings ▸ Integrations first.")} <a href="/settings?section=woocommerce">{t("Open WooCommerce settings")}</a></p>
      ) : null}
      {!loading && status?.enabled && liveConnections.length ? (
        <div className="ebay-inv__actions">
          {liveConnections.length > 1 ? (
            <select className="input" value={connectionId} disabled={busy !== ""} onChange={(event) => chooseStore(event.target.value)} aria-label="WooCommerce" data-testid="woo-products-store">
              {liveConnections.map((c) => <option key={c.connectionId} value={c.connectionId}>{c.storeName ? `${c.storeName} (${c.host})` : c.host}</option>)}
            </select>
          ) : <span className="ebay-inv__seller">{liveConnections[0].storeName || liveConnections[0].host}</span>}
          <button type="button" className="button" data-testid="woo-products-read" disabled={!editable || busy !== "" || !connectionId} onClick={() => void read()}>
            {busy === "read" ? t("Reading the store…") : answer ? t("Read again") : t("Read my products")}
          </button>
        </div>
      ) : null}
      {refusal ? (
        <p className="ebay-inv__warn" role="alert" data-testid="woo-products-refused" data-reason={refusal}>
          {t(reasonSentence(refusal))}{refusal === "reconnect_required" || refusal === "not_connected" ? <> <a href="/settings?section=woocommerce">{t("Open WooCommerce settings")}</a></> : null}
        </p>
      ) : null}

      {answer ? (
        <>
          <p className="ebay-inv__summary" data-testid="woo-products-summary">
            {answer.storeName || answer.host ? <strong data-testid="woo-products-store-read">{String(answer.storeName || answer.host)} · </strong> : null}
            {fill(t("{count} products read · {rows} to match"), { count: Number(answer.products || 0), rows: rowsToMatch(rows) })}
          </p>
          {answer.truncated === true ? <p className="ebay-inv__warn">{t("More than 1,000 products: only the first 1,000 were read.")}</p> : null}
          {Number(answer.variationsTruncated || 0) > 0 ? <p className="ebay-inv__warn">{t("Some products have more than 300 variations: only the first 300 were read.")}</p> : null}
          {rows.length === 0 ? <p className="muted-copy">{t("No products in this store.")}</p> : (
            <>
              <div className="ebay-inv__filters" role="tablist">
                {FILTERS.map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={filter === key} data-active={filter === key} onClick={() => setFilter(key)}>
                    {t(label)} <span className="inventory-nav-badge">{counts[key as keyof typeof counts]}</span>
                  </button>
                ))}
              </div>
              {filter === "inactive" ? <p className="ebay-inv__warn">{t("A past sale is not stock: bring these in only for what is physically on your shelf.")}</p> : null}
              <ul className="ebay-inv__rows" data-testid="woo-products-rows">
                {shown.map((row) => {
                  const picked = chosen.includes(row.linkId);
                  const decision = decisions[row.linkId];
                  const problem = picked ? decisionProblem(row, decision) : "";
                  const done = results[row.linkId];
                  const needle = (search[row.linkId] || "").trim().toLowerCase();
                  const firstIds = new Set([...row.candidates, ...row.suggestions].map((c) => c.id));
                  const others = allCards.filter((i) => !firstIds.has(i.id) && (!needle || `${i.number} ${i.name} ${i.sku}`.toLowerCase().includes(needle))).slice(0, 50);
                  const stock = storeStockSentence(row);
                  return (
                    <li key={row.linkId} className="ebay-inv__row" data-state={row.state} data-lifecycle={row.lifecycle} data-link-id={row.linkId} data-picked={picked ? "1" : "0"}>
                      <div className="ebay-inv__row-main">
                        <input type="checkbox" checked={picked} disabled={!editable || !canChoose(row) || busy !== ""} onChange={() => toggle(row)} aria-label={`${t("Choose")}: ${row.title}`} />
                        {row.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="ebay-inv__pic" src={row.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} title={t("Picture shown from your store; bringing it in copies it onto the new card")} />
                        ) : <span className="ebay-inv__pic is-empty" aria-hidden="true" />}
                        <div className="ebay-inv__what">
                          <strong className="ebay-inv__title">{row.title}</strong>
                          {row.hasVariations ? <span className="inventory-sub">{row.variationName}</span> : null}
                          <span className="inventory-sub">
                            {row.sku ? <>SKU <code>{row.sku}</code> · </> : null}#{row.productId}{row.variationId !== "0" ? `/${row.variationId}` : ""}
                            {row.brand ? <> · {row.brand}</> : null}{row.condition ? <> · {row.condition}</> : null}
                          </span>
                          <span className="inventory-sub">{fill(t(stock.sentence), stock.values)}</span>
                          {row.lifecycle !== "active" ? <span className="inventory-sub"><strong>{t(row.lifecycle === "sold" ? "Sold out in the store" : "Archived in the store")}</strong></span> : null}
                          {money && row.price ? <span className="inventory-sub">{t("Sale price in the store")}: <strong>{priceText(row.price, locale)}</strong></span> : null}
                          {row.categories.length ? <span className="inventory-sub" data-testid="woo-store-categories">{fill(t("In the store: {categories}"), { categories: row.categories.join(", ") })}</span> : null}
                          {picked && decision?.action === "create" ? (
                            <span className="inventory-sub woo-row-category" data-testid="woo-row-category" data-category={decision.category}>
                              {t("Category")}: <strong>{decision.category ? t(decision.category) : t("Choose…")}</strong>
                            </span>
                          ) : null}
                        </div>
                        <div className="ebay-inv__state">
                          <span className={`ebay-inv__chip is-${row.state}`}>{t(rowStateSentence(row))}</span>
                          {row.linkedItem ? (
                            <span className="inventory-sub" data-testid="woo-row-linked-card">
                              → {cardLabel(row.linkedItem)}
                              {onOpenCard && row.state === "linked" && row.linkedItem.id ? <> <button type="button" className="inventory-link" data-testid="woo-open-card" onClick={() => onOpenCard(row.linkedItem!.id)}>{t("Open the card")}</button></> : null}
                            </span>
                          ) : null}
                          {!picked && row.candidates.length ? <span className="inventory-sub">{row.candidates.map((c) => cardLabel(c)).join(" · ")}</span> : null}
                        </div>
                      </div>
                      {picked ? (
                        <div className="ebay-inv__decide" data-testid="woo-product-decision">
                          <label><input type="radio" name={`act-${row.linkId}`} checked={decision?.action === "link"} onChange={() => setDecision(row.linkId, { action: "link" })} /> {t("Link to a card")}</label>
                          <label><input type="radio" name={`act-${row.linkId}`} checked={decision?.action === "create"} onChange={() => setDecision(row.linkId, { action: "create" })} /> {t("Create a new card")}</label>
                          {decision?.action === "link" ? (
                            <div className="ebay-inv__fields">
                              <input className="input" placeholder={t("Search your cards…")} value={search[row.linkId] || ""} onChange={(event) => setSearch((current) => ({ ...current, [row.linkId]: event.target.value }))} />
                              <select className="input" value={decision.inventoryItemId} onChange={(event) => setDecision(row.linkId, { inventoryItemId: event.target.value })} aria-label={t("Choose a card")}>
                                <option value="">{t("Choose a card")}</option>
                                {row.candidates.map((c) => <option key={`c-${c.id}`} value={c.id}>{cardLabel(c)} — SKU</option>)}
                                {row.suggestions.map((c) => <option key={`s-${c.id}`} value={c.id}>{cardLabel(c)} — {t("Similar name (not a match)")}</option>)}
                                {others.map((i) => <option key={i.id} value={i.id}>{cardLabel(i)}</option>)}
                              </select>
                            </div>
                          ) : null}
                          {decision?.action === "create" ? (
                            <div className="ebay-inv__fields">
                              <select className="input" value={decision.trackingType} onChange={(event) => setDecision(row.linkId, { trackingType: event.target.value === "unique" ? "unique" : event.target.value === "quantity" ? "quantity" : "" })} aria-label={t("Choose one-off or counted.")}>
                                <option value="">{t("Choose one-off or counted.")}</option>
                                <option value="unique">{t("One-off item")}</option>
                                <option value="quantity">{t("Counted item")}</option>
                              </select>
                              {decision.trackingType === "quantity" ? (
                                <label className="ebay-inv__count">{t("Opening count (yours, typed by you)")}
                                  <input className="input" inputMode="decimal" data-testid="woo-opening-count" value={decision.openingCount} onChange={(event) => setDecision(row.linkId, { openingCount: event.target.value })} />
                                </label>
                              ) : null}
                              {decision.trackingType === "unique" ? (
                                <label><input type="checkbox" data-testid="woo-in-hand" checked={decision.inHand} onChange={(event) => setDecision(row.linkId, { inHand: event.target.checked })} /> {t("This one item is here, on my shelf")}</label>
                              ) : null}
                              <label className="ebay-inv__count">{t("Category for the new card")}
                                <select className="input" data-testid="woo-category" value={decision.category} onChange={(event) => setDecision(row.linkId, { category: event.target.value })}>
                                  {decision.category ? null : <option value="" disabled>{t("Choose…")}</option>}
                                  {categoryOptions.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                                  {decision.category && !categoryOptions.includes(decision.category) ? <option value={decision.category}>{decision.category}</option> : null}
                                </select>
                              </label>
                              {(() => {
                                const why = preselectCategory(row, categoryOptions, defaultCategory);
                                if (!decision.category || why.category !== decision.category) return null;
                                if (why.from) return <span className="inventory-sub" data-testid="woo-category-why">{fill(t("Suggested from the store's category “{from}”"), { from: why.from })}</span>;
                                if (why.basis === "default") return <span className="inventory-sub" data-testid="woo-category-why">{t("Your default category")}</span>;
                                return null;
                              })()}
                              <span className="inventory-sub">{row.proposed.name}</span>
                              <span className="inventory-sub">{t("Cost: not entered — the store's price is a sale price, not what you paid.")}</span>
                            </div>
                          ) : null}
                          {row.state === "ambiguous" && decision?.action ? (
                            <label><input type="checkbox" data-testid="woo-confirm-ambiguous" checked={decision.confirmAmbiguous} onChange={(event) => setDecision(row.linkId, { confirmAmbiguous: event.target.checked })} /> {t("I have checked the candidates: bring this in as I chose")}</label>
                          ) : null}
                          {problem ? <p className="ebay-inv__problem">{t(reasonSentence(problem))}</p> : null}
                        </div>
                      ) : null}
                      {done ? (
                        <p className={done.result === "refused" ? "ebay-inv__problem" : "ebay-inv__done"} data-testid="woo-product-result" data-result={done.result}>
                          {done.result === "created" ? fill(t("Created {number}"), { number: done.number })
                            : done.result === "linked" ? fill(t("Linked to {number}"), { number: done.number })
                              : done.result === "already_linked" ? t("Already linked")
                                : t(reasonSentence(done.reason))}
                          {done.result === "created" && done.category ? <> · {t(done.category)}</> : null}
                          {done.photo === "copied" ? <> · <span data-testid="woo-photo-copied">{t("Picture copied from the store")}</span></> : null}
                          {done.photo === "not_copied" ? <> · <span data-testid="woo-photo-not-copied" data-reason={done.photoReason}>{t("The store's picture was not copied")}</span></> : null}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="ebay-inv__footer">
                <span className="muted-copy">{fill(t("{count} selected"), { count: chosen.length })}</span>
                {chosen.length && toSend.length < chosen.length ? <span className="ebay-inv__problem">{t("Choose what to do with each selected product.")}</span> : null}
                <button type="button" className="button" data-testid="woo-products-import" disabled={!editable || busy !== "" || !toSend.length} onClick={() => void bringIn()}>
                  {busy === "import" ? t("Bringing in…") : t("Bring in selected")}
                </button>
              </div>
              {summary ? <p className="success-copy" data-testid="woo-products-import-summary">{summary}</p> : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export default WooProductsPanel;
