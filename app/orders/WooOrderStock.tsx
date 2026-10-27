"use client";

// A WooCommerce order's "Stock" line (MC-4, 27 Oct 2026), under the order's channel strip. Drawn only for an order
// whose products are linked to stock cards (MC-3) and only where appConfig/wooStock opens it — with the switch off, or
// the server functions not deployed, the order page is exactly what it was.
//
// Per linked line: "Reserved INV-00007 for this order" (paid) · "Took INV-00007 from stock" (completed in Woo, or
// dispatched/delivered here) · "Restored — … back on the shelf" (cancelled/refunded/trashed/deleted before it left) ·
// "Oversold — check" (another order holds or sold the piece) · "Refunded after dispatch — did it come back?". Two acts
// are the person's: "Reserve stock" (dry run first) and, for the owner/admin, "Return to stock".
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { getWooOrderStock, updateWooOrderStock, wooOrderStockT } from "@/lib/studioflow/wooOrderStock";
import { fillWooStock, wooOrderStockViewOf, wooStockLineActions, wooStockLineSentence, type WooOrderStockView } from "@/lib/studioflow/wooOrderStockRules";

type Props = {
  workspace: WorkspaceContext;
  order: { id: string; commerce?: { provider?: string } | null };
  language: string;
  canEditOrder: boolean;
};

export function WooOrderStock({ workspace, order, language, canEditOrder }: Props) {
  const t = useCallback((sentence: string) => wooOrderStockT(sentence, language), [language]);
  const isWoo = String(order.commerce?.provider || "") === "woocommerce";
  const [view, setView] = useState<WooOrderStockView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [plan, setPlan] = useState<{ lineId: string; sentence: string } | null>(null);
  // The first load failing draws nothing (functions not deployed yet, an order the server does not treat as Woo's);
  // once drawn, a failed reload is said.
  const drawn = useRef(false);
  const [absent, setAbsent] = useState(false);
  const load = useCallback(async () => {
    try { setView(wooOrderStockViewOf(await getWooOrderStock(workspace.id, order.id))); drawn.current = true; }
    catch { if (drawn.current) setError(t("Could not load the stock for this order.")); else setAbsent(true); }
  }, [workspace.id, order.id, t]);
  useEffect(() => { if (isWoo) void load(); }, [isWoo, load]);
  if (!isWoo || absent || view === null || !view.enabled || view.lines.length === 0) return null;

  async function dryRun(lineId: string, card: string) {
    setBusy(`plan:${lineId}`); setError("");
    try {
      const answer = await updateWooOrderStock(workspace.id, { orderId: order.id, op: "reserve", lineId, dryRun: true });
      const row = (answer.results || []).find((r) => r.lineId === lineId);
      if (!row || row.result !== "would_apply" || !row.plan) { setError(t("This could not be done.")); return; }
      setPlan({ lineId, sentence: fillWooStock(t("This will reserve {reserve}, take {sell} from stock and give back {release} on {card}."), { reserve: row.plan.reserve, sell: row.plan.sell, release: row.plan.release, card }) });
    } catch (err) { setError(err instanceof Error && err.message ? err.message : t("This could not be done.")); }
    finally { setBusy(""); }
  }
  async function act(lineId: string, op: "reserve" | "returned", card: string) {
    setBusy(`${op}:${lineId}`); setError("");
    try {
      const answer = await updateWooOrderStock(workspace.id, { orderId: order.id, op, lineId });
      const row = (answer.results || []).find((r) => r.lineId === lineId);
      if (row && row.result === "blocked") setError(fillWooStock(t("Could not take stock from {card}. Check."), { card }));
      setPlan(null);
      await load();
    } catch (err) { setError(err instanceof Error && err.message ? err.message : t("This could not be done.")); }
    finally { setBusy(""); }
  }

  return (
    <section className="ebay-order-stock woo-order-stock" data-testid="woo-order-stock" aria-busy={busy !== ""}>
      {error ? <p className="layout-error" role="alert">{error}</p> : null}
      <div className="ebay-order-stock__part">
        <h4>{t("Stock")}</h4>
        <ul className="ebay-order-stock__lines">
          {view.lines.map((line) => {
            const words = wooStockLineSentence(line);
            const card = line.card ? (line.card.number || line.card.name) : "";
            const can = wooStockLineActions(view, line);
            return (
              <li key={line.lineId} data-line={line.lineId} data-state={line.state} data-tone={words.tone}>
                <div className="ebay-order-stock__what">
                  <strong className="ebay-inv__title">{line.title || line.sku || line.lineId}</strong> <span className="inventory-sub">× {line.quantity}</span>
                </div>
                <span className={`ebay-inv__chip is-${words.tone}`} data-testid="woo-stock-sentence">{fillWooStock(t(words.sentence), words.values)}</span>
                {canEditOrder && (can.reserve || can.returned) ? (
                  <div className="ebay-order-stock__actions">
                    {can.reserve ? (
                      plan && plan.lineId === line.lineId ? (
                        <>
                          <span className="inventory-sub" data-testid="woo-stock-plan">{plan.sentence}</span>
                          <button type="button" className="inventory-link" disabled={busy !== ""} onClick={() => void act(line.lineId, "reserve", card)}>{t("Confirm")}</button>
                          <button type="button" className="inventory-link" onClick={() => setPlan(null)}>{t("Cancel")}</button>
                        </>
                      ) : (
                        <button type="button" className="inventory-link" data-testid="woo-stock-reserve" disabled={busy !== ""} onClick={() => void dryRun(line.lineId, card)}>{t("Reserve stock")}</button>
                      )
                    ) : null}
                    {can.returned ? (
                      <button type="button" className="inventory-link" data-testid="woo-stock-returned" disabled={busy !== ""} onClick={() => void act(line.lineId, "returned", card)}>{t("Return to stock")}</button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="inventory-sub">{t("NivaDesk never changes your WooCommerce stock — sell this piece elsewhere only after checking it here.")}</p>
      </div>
    </section>
  );
}
