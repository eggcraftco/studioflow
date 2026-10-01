"use client";

// An eBay order's stock and shipments (package E4, 1 Oct 2026), on the order page under eBay's own block.
//
// STOCK: each line, the card its listing is linked to and what the order did to it — reserved when paid, sold when
// eBay's packages show it shipped, given back when the order was cancelled before it went. Two acts are the
// person's alone: "Reserve stock" (an order placed before the listing was linked, or a line that could not take
// stock — a dry run first says exactly what will happen), and "Item returned": a refund on eBay is money, not
// goods, so nothing comes back to the shelf until somebody says it did.
//
// SHIPMENTS: every package eBay says went out, with the lines in it — an order sent in two parcels, or half now
// and half later, shows each one. NivaDesk's tracking (17TRACK, through the same registerTracking call the order's
// tracking card uses — it works with or without DHL) follows one number per order; "Follow in NivaDesk" chooses
// which. An eBay buyer's address is in eBay's protected store, not on the order, so this page never offers to make
// a label for it.
//
// Costs only with Financial Info (the server leaves them out otherwise).
import { useCallback, useEffect, useState } from "react";
import { studioLocaleTag } from "@/lib/studioflow/language";
import { usePrivateMoney } from "@/components/PricePrivacy";
import { registerOrderTrackingFromWeb, updateOrderFromWeb } from "@/lib/studioflow/orders";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { getEbayOrderStock, updateEbayOrderStock, ebayInventoryT } from "@/lib/studioflow/ebayInventory";
import { fill, lineActions, lineStockSentence, orderStockViewOf, reasonSentence, type EbayOrderStockView } from "@/lib/studioflow/ebayInventoryRules";

type Props = {
  workspace: WorkspaceContext;
  /** The workspace's own money symbol (the order page's moneySymbol). */
  currencySymbol?: string;
  order: { id: string; companyId?: string; commerce: { provider?: string } | null };
  language: string;
  canSeeFinance: boolean;
  canEditOrder: boolean;
  onOrderChanged?: () => void | Promise<void>;
};

export function EbayOrderStock({ workspace, currencySymbol = "", order, language, canSeeFinance, canEditOrder, onOrderChanged }: Props) {
  const money = usePrivateMoney();
  const t = useCallback((sentence: string) => ebayInventoryT(sentence, language), [language]);
  const locale = studioLocaleTag(language);
  const isEbay = String(order.commerce?.provider || "") === "ebay";
  const [view, setView] = useState<EbayOrderStockView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [plan, setPlan] = useState<{ lineItemId: string; sentence: string } | null>(null);
  const [returning, setReturning] = useState<{ lineItemId: string; max: number; quantity: string } | null>(null);

  // A reload does not clear the error: an action sets its own answer (a refusal, a failed follow) before reloading,
  // and clears it when it starts.
  const load = useCallback(async () => {
    try { setView(orderStockViewOf(await getEbayOrderStock(workspace.id, order.id))); }
    catch { setError(t("Could not load the stock for this order.")); }
  }, [workspace.id, order.id, t]);
  useEffect(() => { if (isEbay) void load(); }, [isEbay, load]);
  if (!isEbay) return null;

  async function dryRun(lineItemId: string) {
    setBusy(`plan:${lineItemId}`); setNotice(""); setError("");
    try {
      const answer = await updateEbayOrderStock(workspace.id, { orderId: order.id, op: "apply", lineItemId, dryRun: true });
      const row = (answer.results || [])[0];
      if (!row || row.result !== "would_apply" || !row.plan) { setError(t(reasonSentence(String(row?.reason || row?.result || "failed")))); return; }
      setPlan({ lineItemId, sentence: fill(t("This will reserve {reserve}, record {sell} as sold and give back {release} on {card}."), { reserve: row.plan.reserve, sell: row.plan.sell, release: row.plan.release, card: row.inventoryItemNumber || "" }) });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally { setBusy(""); }
  }
  async function reserve(lineItemId: string) {
    setBusy(`apply:${lineItemId}`); setError("");
    try {
      const answer = await updateEbayOrderStock(workspace.id, { orderId: order.id, op: "apply", lineItemId });
      const row = (answer.results || [])[0];
      if (row && row.result === "blocked") setError(t(reasonSentence(String(row.reason || "stock_refused"))));
      setPlan(null);
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally { setBusy(""); }
  }
  async function returned(lineItemId: string, quantity: number) {
    setBusy(`ret:${lineItemId}`); setError("");
    try {
      await updateEbayOrderStock(workspace.id, { orderId: order.id, op: "returned", lineItemId, quantity });
      setReturning(null);
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally { setBusy(""); }
  }
  // Exactly what the order's tracking card does: the number and courier are saved on the order, then registerTracking
  // follows it (17TRACK; DHL Express answers only for a waybill of the workspace's own DHL connection).
  async function follow(trackingNumber: string, courier: string) {
    setBusy(`track:${trackingNumber}`); setError(""); setNotice("");
    try {
      await updateOrderFromWeb(workspace, { orderId: order.id, details: { trackingNumber, courier } });
      const answer = await registerOrderTrackingFromWeb(workspace, { orderId: order.id, trackingNumber, courier, language });
      if (answer && answer.ok === false) setError(t("This could not be done."));
      else setNotice(t("Followed in NivaDesk"));
      await load();
      if (onOrderChanged) await onOrderChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally { setBusy(""); }
  }

  const shipped = (iso: string) => { const ms = Date.parse(iso); return Number.isFinite(ms) ? new Date(ms).toLocaleDateString(locale) : ""; };
  return (
    <section className="ebay-order-stock" data-testid="ebay-order-stock" aria-busy={busy !== ""}>
      {error ? <p className="layout-error" role="alert">{error}</p> : null}
      {notice ? <p className="success-copy">{notice}</p> : null}
      {view === null && !error ? <p className="muted-copy">{t("Loading…")}</p> : null}
      {view ? (
        <>
          <div className="ebay-order-stock__part">
            <h4>{t("Stock for this eBay order")}</h4>
            <ul className="ebay-order-stock__lines">
              {view.lines.map((line) => {
                const words = lineStockSentence(line);
                const card = (line.stock && line.stock.card) || (line.link && line.link.card);
                const can = lineActions(view, line);
                const outstanding = line.stock ? line.stock.soldQty - line.stock.returnedQty : 0;
                return (
                  <li key={line.lineItemId} data-line={line.lineItemId} data-tone={words.tone}>
                    <div className="ebay-order-stock__what">
                      <strong className="ebay-inv__title">{line.title || line.sku || line.lineItemId}</strong> <span className="inventory-sub">× {line.quantity}</span>
                    </div>
                    <span className={`ebay-inv__chip is-${words.tone}`}>{fill(t(words.sentence), { ...words.values, reason: words.values.reason ? t(String(words.values.reason)) : "" })}</span>
                    {!line.link && !line.stock ? <a className="inventory-sub" href="/inventory?panel=ebay">{t("Link it in Inventory ▸ eBay listings")}</a> : null}
                    {line.stock && line.stock.linkMovedSince ? <span className="inventory-sub">{t("The listing now points to another card; this order keeps the card it took stock from.")}</span> : null}
                    {canSeeFinance && view.money && card && card.costNotEntered ? <span className="inventory-sub">{t("Cost not entered — eBay does not know what you paid.")}</span>
                      : canSeeFinance && view.money && card && typeof card.unitCost === "number" ? <span className="inventory-sub">{t("Unit cost")}: {money(currencySymbol, card.unitCost)}</span> : null}
                    {line.needsReturnDecision ? <span className="inventory-sub">{t("A refund on eBay is money, not goods: the item stays sold until you say it came back.")}</span> : null}
                    {canEditOrder ? (
                      <div className="ebay-order-stock__actions">
                        {can.reserve ? (
                          plan && plan.lineItemId === line.lineItemId ? (
                            <>
                              <span className="inventory-sub" data-testid="ebay-stock-plan">{plan.sentence}</span>
                              <button type="button" className="inventory-link" disabled={busy !== ""} onClick={() => void reserve(line.lineItemId)}>{t("Confirm")}</button>
                              <button type="button" className="inventory-link" onClick={() => setPlan(null)}>{t("Cancel")}</button>
                            </>
                          ) : (
                            <button type="button" className="inventory-link" data-testid="ebay-stock-reserve" disabled={busy !== ""} onClick={() => void dryRun(line.lineItemId)}>
                              {line.stock && line.stock.blocked ? t("Try again") : t("Reserve stock")}
                            </button>
                          )
                        ) : null}
                        {can.returned ? (
                          returning && returning.lineItemId === line.lineItemId ? (
                            <>
                              {returning.max > 1 ? (
                                <label className="inventory-sub">{t("How many came back?")} <input className="input ebay-order-stock__qty" inputMode="numeric" value={returning.quantity} onChange={(event) => setReturning({ ...returning, quantity: event.target.value })} /></label>
                              ) : null}
                              <button type="button" className="inventory-link" disabled={busy !== ""} onClick={() => void returned(line.lineItemId, Math.min(returning.max, Math.max(1, Math.floor(Number(returning.quantity) || 1))))}>{t("Put back on the shelf")}</button>
                              <button type="button" className="inventory-link" onClick={() => setReturning(null)}>{t("Cancel")}</button>
                            </>
                          ) : (
                            <button type="button" className="inventory-link" data-testid="ebay-stock-returned" disabled={busy !== ""} onClick={() => setReturning({ lineItemId: line.lineItemId, max: outstanding, quantity: String(outstanding) })}>{t("Item returned")}</button>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="ebay-order-stock__part">
            <h4>{t("Shipments on eBay")}{view.partlyShipped ? <span className="due-pill warning" style={{ marginInlineStart: 8 }}>{t("Partly shipped")}</span> : null}</h4>
            {view.packages.length === 0 ? <p className="muted-copy">{t("No shipment on eBay yet.")}</p> : (
              <>
                <ul className="ebay-order-stock__packages" data-testid="ebay-order-packages">
                  {view.packages.map((pkg) => (
                    <li key={pkg.id || pkg.trackingNumber} data-followed={pkg.followed ? "1" : pkg.followProblem ? "problem" : "0"}>
                      <div>
                        <strong><code>{pkg.trackingNumber || "—"}</code></strong>
                        <span className="inventory-sub">{pkg.carrier || pkg.carrierCode}{pkg.shippedAt ? ` · ${fill(t("Shipped {date}"), { date: shipped(pkg.shippedAt) })}` : ""}</span>
                        {pkg.lines.length ? <span className="inventory-sub">{t("In this package")}: {pkg.lines.map((l) => `${l.title || l.lineItemId} × ${l.quantity}`).join(", ")}</span> : null}
                      </div>
                      <div className="ebay-order-stock__actions">
                        {pkg.followProblem ? <span className="inventory-sub" role="status" data-testid="ebay-package-follow-problem">{t("NivaDesk could not start following this number — the tracking panel on this order says why")}</span> : !pkg.followed && pkg.onOrder ? <span className="inventory-sub">{t("In the order's tracking field — not followed yet")}</span> : null}
                        {pkg.followed ? <span className="due-pill success">{t("Followed in NivaDesk")}</span> : canEditOrder && pkg.trackingNumber ? (
                          <button type="button" className="inventory-link" data-testid="ebay-package-follow" disabled={busy !== ""} onClick={() => void follow(pkg.trackingNumber, pkg.courier)}>
                            {busy === `track:${pkg.trackingNumber}` ? t("Following…") : t("Follow in NivaDesk")}
                          </button>
                        ) : null}
                        {pkg.trackingNumber ? <a className="inventory-link" href={`https://www.17track.net/en/track-details?nums=${encodeURIComponent(pkg.trackingNumber)}`} target="_blank" rel="noopener noreferrer">{t("Open on 17TRACK")} ↗</a> : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {view.packages.length > 1 ? <p className="inventory-sub">{t("One package is followed at a time; NivaDesk follows the one you choose.")}</p> : null}
              </>
            )}
            {view.address === "restricted" ? <p className="inventory-sub" data-testid="ebay-address-restricted">{t("The buyer's address is kept protected by eBay, so NivaDesk cannot make a shipping label for this order. Create the label in eBay — the tracking number comes back here by itself.")}</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default EbayOrderStock;
