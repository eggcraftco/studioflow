"use client";

// Inventory ▸ eBay listings (package E4, 1 Oct 2026): "Preview products → match to existing stock → bring in the
// selected ones". The server reads the seller's ACTIVE listings (one Trading call, GetMyeBaySelling) and answers each
// sellable row — a listing, or one variation of it — with where it stands: already linked, one card with exactly its
// SKU (a proposal), ambiguous (every candidate shown, the person picks), or nothing. A similar name is offered as a
// suggestion and never chosen for the person. Nothing is brought in until a row is ticked and has its decision: link
// to a card, or make a new one with the shelf count the PERSON types (eBay's listed quantity is eBay's, not the
// shelf's) and no cost (the sale price is a sale price). Nothing is ever written to eBay.
//
// Prices come only when the server sends them (Financial Info); a picture is shown only from eBay's own picture
// host, loaded without a referrer, and never copied into NivaDesk.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { InventoryItem } from "@/lib/studioflow/inventory";
import { studioLocaleTag } from "@/lib/studioflow/language";
import { getEbayListingLinks, previewEbayListings, importEbayListings, ebayInventoryT, type EbayLinksAnswer } from "@/lib/studioflow/ebayInventory";
import {
  canChoose, countsOf, decisionProblem, decisionsToSend, fill, filterRows, listingRowsOf, reasonSentence, rowStateSentence, startingDecision,
  type EbayDecision, type EbayImportRow, type EbayListingRow
} from "@/lib/studioflow/ebayInventoryRules";

type Props = {
  workspace: WorkspaceContext;
  language: string;
  canEdit: boolean;
  items: InventoryItem[];
  categoryOptions: string[];
  onStockChanged?: () => void | Promise<void>;
};

function priceText(price: { value: string; currency: string } | null, locale: string): string {
  if (!price) return "";
  try { return price.currency ? new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(Number(price.value)) : price.value; }
  catch { return `${price.value} ${price.currency}`.trim(); }
}

const FILTERS: Array<[string, string]> = [["all", "All listings"], ["needs_choice", "Needs a choice"], ["sku_match", "Same SKU"], ["linked", "Linked"]];

export function EbayListingsPanel({ workspace, language, canEdit, items, categoryOptions, onStockChanged }: Props) {
  const t = useCallback((sentence: string) => ebayInventoryT(sentence, language), [language]);
  const locale = studioLocaleTag(language);
  const companyId = workspace.id.trim();
  const [status, setStatus] = useState<EbayLinksAnswer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [busy, setBusy] = useState("");
  const [answer, setAnswer] = useState<Record<string, unknown> | null>(null);
  const [refusal, setRefusal] = useState("");
  const [filter, setFilter] = useState("all");
  const [chosen, setChosen] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, EbayDecision>>({});
  const [search, setSearch] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, EbayImportRow>>({});
  const [summary, setSummary] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError("");
    try {
      const answerNow = await getEbayListingLinks(companyId);
      setStatus(answerNow);
      const live = answerNow.connections.find((c) => c.status === "connected");
      setConnectionId((current) => current || (live ? live.connectionId : ""));
    } catch {
      setError(t("This could not be done."));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => listingRowsOf(answer), [answer]);
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter]);
  const counts = useMemo(() => countsOf(rows), [rows]);
  const connection = status?.connections.find((c) => c.connectionId === connectionId) || null;
  const liveConnections = (status?.connections || []).filter((c) => c.status === "connected");
  const money = status?.money === true;
  const editable = canEdit && status?.canEdit === true;

  async function read() {
    if (!connectionId) return;
    setBusy("read"); setError(""); setRefusal(""); setSummary(""); setResults({}); setChosen([]); setDecisions({});
    try {
      const next = await previewEbayListings(companyId, connectionId);
      if (next && next.ok === false) { setRefusal(String(next.reason || "provider_unavailable")); setAnswer(null); }
      else setAnswer(next);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally {
      setBusy("");
    }
  }

  function toggle(row: EbayListingRow) {
    if (!canChoose(row)) return;
    setChosen((current) => (current.includes(row.linkId) ? current.filter((id) => id !== row.linkId) : [...current, row.linkId]));
    setDecisions((current) => (current[row.linkId] ? current : { ...current, [row.linkId]: startingDecision(row) }));
  }
  const setDecision = (linkId: string, patch: Partial<EbayDecision>) => setDecisions((current) => ({ ...current, [linkId]: { ...(current[linkId] || { action: "", inventoryItemId: "", trackingType: "quantity", onHand: "", category: "" }), ...patch } }));

  const toSend = decisionsToSend(rows, chosen, decisions);
  async function bringIn() {
    if (!toSend.length) return;
    setBusy("import"); setError(""); setSummary("");
    try {
      const done = await importEbayListings(companyId, connectionId, toSend);
      const byId: Record<string, EbayImportRow> = {};
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
    <section className="ebay-inv" data-testid="ebay-listings-panel" aria-busy={busy !== "" || loading}>
      <header className="ebay-inv__head">
        <h2>{t("eBay listings")}</h2>
        <p className="inventory-sub">{t("Read your active eBay listings, match them to your stock and bring in only the ones you choose. Nothing is written to eBay.")}</p>
      </header>
      {loading ? <p className="muted-copy" data-testid="ebay-listings-loading">{t("Loading…")}</p> : null}
      {error ? <p className="layout-error" role="alert">{error}</p> : null}
      {!loading && status && !status.enabled ? <p className="inventory-note" data-testid="ebay-listings-off">{t("eBay listings are not switched on for this workspace yet.")}</p> : null}
      {!loading && status && status.enabled && !liveConnections.length ? (
        <p className="inventory-note" data-testid="ebay-listings-no-connection">{t("Connect eBay in Settings ▸ Integrations first.")} <a href="/settings?section=ebay">{t("Open eBay settings")}</a></p>
      ) : null}
      {!loading && status?.enabled && connection && !connection.listingReadGranted ? (
        <p className="ebay-inv__warn" data-testid="ebay-listings-scope">{t(reasonSentence("listing_scope_missing"))} <a href="/settings?section=ebay">{t("Open eBay settings")}</a></p>
      ) : null}
      {!loading && status?.enabled && liveConnections.length ? (
        <div className="ebay-inv__actions">
          {liveConnections.length > 1 ? (
            <select className="input" value={connectionId} onChange={(event) => setConnectionId(event.target.value)} aria-label="eBay">
              {liveConnections.map((c) => <option key={c.connectionId} value={c.connectionId}>{c.sellerUsername || c.connectionId}</option>)}
            </select>
          ) : <span className="ebay-inv__seller">{liveConnections[0].sellerUsername}</span>}
          <button type="button" className="button" data-testid="ebay-listings-read" disabled={!editable || busy !== "" || !connectionId} onClick={() => void read()}>
            {busy === "read" ? t("Reading eBay…") : answer ? t("Read again") : t("Read my eBay listings")}
          </button>
        </div>
      ) : null}
      {refusal ? (
        <p className="ebay-inv__warn" role="alert" data-testid="ebay-listings-refused" data-reason={refusal}>
          {t(reasonSentence(refusal))}{refusal === "listing_scope_missing" || refusal === "listing_token_rejected" || refusal === "reconnect_required" ? <> <a href="/settings?section=ebay">{t("Open eBay settings")}</a></> : null}
        </p>
      ) : null}

      {answer ? (
        <>
          <p className="ebay-inv__summary" data-testid="ebay-listings-summary">
            {fill(t("{count} listings read from eBay · {rows} to match"), { count: Number(answer.listings || 0), rows: rows.length })}
          </p>
          {answer.truncated === true ? <p className="ebay-inv__warn">{t("More than 2,000 listings: only the first 2,000 were read.")}</p> : null}
          {answer.truncated !== true && answer.complete === false ? <p className="ebay-inv__warn">{t("eBay's list changed while it was read. Read it again to be sure nothing is missing.")}</p> : null}
          {rows.length === 0 ? <p className="muted-copy" data-testid="ebay-listings-empty">{t("No active listings on eBay.")}</p> : (
            <>
              <div className="ebay-inv__filters" role="tablist">
                {FILTERS.map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={filter === key} data-active={filter === key} onClick={() => setFilter(key)}>
                    {t(label)} <span className="inventory-nav-badge">{counts[key as keyof typeof counts]}</span>
                  </button>
                ))}
              </div>
              <ul className="ebay-inv__rows" data-testid="ebay-listings-rows">
                {shown.map((row) => {
                  const picked = chosen.includes(row.linkId);
                  const decision = decisions[row.linkId];
                  const problem = picked ? decisionProblem(row, decision) : "";
                  const done = results[row.linkId];
                  const needle = (search[row.linkId] || "").trim().toLowerCase();
                  const firstIds = new Set([...row.candidates, ...row.suggestions].map((c) => c.id));
                  const others = allCards.filter((i) => !firstIds.has(i.id) && (!needle || `${i.number} ${i.name} ${i.sku}`.toLowerCase().includes(needle))).slice(0, 50);
                  return (
                    <li key={row.linkId} className="ebay-inv__row" data-state={row.state} data-link-id={row.linkId} data-picked={picked ? "1" : "0"}>
                      <div className="ebay-inv__row-main">
                        <input type="checkbox" checked={picked} disabled={!editable || !canChoose(row) || busy !== ""} onChange={() => toggle(row)} aria-label={`${t("Choose")}: ${row.title}`} />
                        {row.pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="ebay-inv__pic" src={row.pictureUrl} alt="" loading="lazy" referrerPolicy="no-referrer" title={t("Picture shown from eBay's servers; not copied into NivaDesk")} />
                        ) : <span className="ebay-inv__pic is-empty" aria-hidden="true" />}
                        <div className="ebay-inv__what">
                          <strong className="ebay-inv__title">{row.title}</strong>
                          {row.hasVariations ? <span className="inventory-sub">{row.specificsText || row.variationTitle}</span> : null}
                          <span className="inventory-sub">
                            {row.sku ? <>SKU <code>{row.sku}</code> · </> : null}eBay #{row.itemId}
                            {row.listedQuantity !== null ? <> · {fill(t("eBay shows {count} for sale — eBay's number, not your shelf count"), { count: row.listedQuantity })}</> : null}
                          </span>
                          {money && row.price ? <span className="inventory-sub">{t("Sale price on eBay")}: <strong>{priceText(row.price, locale)}</strong></span> : null}
                          {money && !row.price && row.currentBid ? <span className="inventory-sub">{t("Auction — current bid")}: {priceText(row.currentBid, locale)}</span> : null}
                        </div>
                        <div className="ebay-inv__state">
                          <span className={`ebay-inv__chip is-${row.state}`}>{t(rowStateSentence(row))}</span>
                          {row.linkedItem ? <span className="inventory-sub">{cardLabel(row.linkedItem)}</span> : null}
                          {!picked && row.candidates.length ? <span className="inventory-sub">{row.candidates.map((c) => cardLabel(c)).join(" · ")}</span> : null}
                        </div>
                      </div>
                      {picked ? (
                        <div className="ebay-inv__decide" data-testid="ebay-listing-decision">
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
                              <select className="input" value={decision.trackingType} onChange={(event) => setDecision(row.linkId, { trackingType: event.target.value === "unique" ? "unique" : "quantity" })}>
                                <option value="unique">{t("One-off item")}</option>
                                <option value="quantity">{t("Counted item")}</option>
                              </select>
                              {decision.trackingType === "quantity" ? (
                                <label className="ebay-inv__count">{t("How many do you have on the shelf?")}
                                  <input className="input" inputMode="decimal" value={decision.onHand} onChange={(event) => setDecision(row.linkId, { onHand: event.target.value })} />
                                </label>
                              ) : null}
                              <select className="input" value={decision.category} onChange={(event) => setDecision(row.linkId, { category: event.target.value })} aria-label={t("Category")}>
                                <option value="">{t("Category")}</option>
                                {categoryOptions.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                              </select>
                              <span className="inventory-sub">{row.proposed.name}</span>
                            </div>
                          ) : null}
                          {problem ? <p className="ebay-inv__problem">{t(reasonSentence(problem))}</p> : null}
                        </div>
                      ) : null}
                      {done ? (
                        <p className={done.result === "refused" ? "ebay-inv__problem" : "ebay-inv__done"} data-testid="ebay-listing-result" data-result={done.result}>
                          {done.result === "created" ? fill(t("Created {number}"), { number: done.number })
                            : done.result === "linked" ? fill(t("Linked to {number}"), { number: done.number })
                              : done.result === "already_linked" ? t("Already linked")
                                : t(reasonSentence(done.reason))}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="ebay-inv__footer">
                <span className="muted-copy" data-testid="ebay-listings-count">{fill(t("{count} selected"), { count: chosen.length })}</span>
                {chosen.length && toSend.length < chosen.length ? <span className="ebay-inv__problem">{t("Choose what to do with each selected listing.")}</span> : null}
                <button type="button" className="button" data-testid="ebay-listings-import" disabled={!editable || busy !== "" || !toSend.length} onClick={() => void bringIn()}>
                  {busy === "import" ? t("Bringing in…") : t("Bring in selected")}
                </button>
              </div>
              {summary ? <p className="success-copy" data-testid="ebay-listings-import-summary">{summary}</p> : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export default EbayListingsPanel;
