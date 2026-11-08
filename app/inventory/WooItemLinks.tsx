"use client";

// envanter-test (owner, 8 Nov 2026): a card brought in from a WooCommerce website (TickToon, the EGGcraft site) showed
// "ticktoon.co.uk · £170.00" on its list row, but its panel said nothing about the website — while an eBay card's panel
// has had "On eBay" (EbayItemLinks) since E4. This is the same box for website products: which store, the store's
// price (only for people who may see money — the server leaves it out otherwise), the store's own stock figure, when
// it was last read, a link to the product page, and Change card / Unlink (changeWooProductLink, live since 22 Oct).
// Nothing here writes to the store; the shelf count and the cost above stay the card's own.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { InventoryItem } from "@/lib/studioflow/inventory";
import { studioLocaleTag } from "@/lib/studioflow/language";
import { changeWooProductLink, getWooProductLinks, wooInventoryT, type WooProductConnection } from "@/lib/studioflow/wooInventory";
import { fill, reasonSentence, safeImageUrl, storeProductUrl, wooLinkViews, type WooLinkView } from "@/lib/studioflow/wooInventoryRules";

type Props = { workspace: WorkspaceContext; item: InventoryItem; items: InventoryItem[]; canEdit: boolean; language: string; onChanged?: () => void | Promise<void> };

function priceText(price: { value: string; currency: string } | null, locale: string): string {
  if (!price) return "";
  try { return price.currency ? new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(Number(price.value)) : price.value; }
  catch { return `${price.value} ${price.currency}`.trim(); }
}

export function WooItemLinks({ workspace, item, items, canEdit, language, onChanged }: Props) {
  const t = useCallback((sentence: string) => wooInventoryT(sentence, language), [language]);
  const locale = studioLocaleTag(language);
  const linkedOnCard = (item.channelLinks || []).some((l) => l && l.provider === "woocommerce");
  const [links, setLinks] = useState<WooLinkView[] | null>(null);
  const [stores, setStores] = useState<WooProductConnection[]>([]);
  const [money, setMoney] = useState(false);
  const [editable, setEditable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [moving, setMoving] = useState("");
  const [target, setTarget] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState("");

  const load = useCallback(async () => {
    try {
      const answer = await getWooProductLinks(workspace.id, { inventoryItemId: item.id });
      setLinks(wooLinkViews(answer.links)); setStores(answer.connections || []); setMoney(answer.money === true);
      setEditable(answer.canEdit === true && canEdit); setError("");
    } catch {
      setError(t("This could not be done."));
    }
  }, [workspace.id, item.id, canEdit, t]);
  useEffect(() => { setLinks(null); setNotice(""); setMoving(""); setConfirmUnlink(""); if (linkedOnCard) void load(); }, [linkedOnCard, load]);
  const cards = useMemo(() => items.filter((i) => i.id !== item.id && i.ownership !== "customer" && i.status !== "archived" && i.status !== "removed"), [items, item.id]);

  if (!linkedOnCard) return null;

  async function change(linkId: string, to: string) {
    setBusy(linkId); setError(""); setNotice("");
    try {
      const answer = await changeWooProductLink(workspace.id, linkId, to);
      if (!answer.ok) { setError(t(reasonSentence(String(answer.reason || "failed")))); return; }
      setNotice(t("Done — the link was changed."));
      setMoving(""); setTarget(""); setConfirmUnlink("");
      await load();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("This could not be done."));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="inventory-panel-card ebay-inv-card" data-testid="woo-item-links">
      <header><strong>{t("On your website")}</strong></header>
      <p className="inventory-sub">{t("The store's stock figure and price are the store's; the shelf count and the cost on this card are yours.")}</p>
      {links === null && !error ? <p className="inventory-sub">{t("Loading…")}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}
      {notice ? <p className="success-copy">{notice}</p> : null}
      <ul className="ebay-inv-card__list">
        {(links || []).map((link) => {
          const store = stores.find((s) => s.connectionId === link.connectionId);
          const host = store?.host || "";
          const picture = safeImageUrl(link.imageUrl, host);
          const page = storeProductUrl(link.permalink, host);
          return (
            <li key={link.linkId} data-link-id={link.linkId}>
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ebay-inv__pic" src={picture} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} title={t("Picture shown from your store; not copied into NivaDesk")} />
              ) : <span />}
              <div className="ebay-inv__what">
                <strong className="ebay-inv__title">{link.title}</strong>
                {link.variationName ? <span className="inventory-sub">{link.variationName}</span> : null}
                <span className="inventory-sub" data-testid="woo-item-store">
                  {store ? `${store.storeName || host}${store.storeName && host ? ` (${host})` : ""} · ` : ""}
                  {link.sku ? <>SKU <code>{link.sku}</code> · </> : null}
                  {fill(t("Store product #{id}"), { id: link.productId })}
                </span>
                {link.listedQuantity !== null ? <span className="inventory-sub">{fill(t("Store shows {count} in stock — the store's number, not your shelf count"), { count: link.listedQuantity })}</span>
                  : <span className="inventory-sub">{t(link.stockTracked === "parent" ? "Stock is tracked on the parent product" : "Stock not tracked in the store")}</span>}
                {money && link.price ? <span className="inventory-sub" data-testid="woo-item-price">{t("Sale price in the store")}: <strong>{priceText(link.price, locale)}</strong></span> : null}
                {link.seenAtMs ? <span className="inventory-sub">{t("Last read from the store")}: {new Date(link.seenAtMs).toLocaleString(locale)}</span> : null}
                {page ? <a className="inventory-link" href={page} target="_blank" rel="noopener noreferrer" data-testid="woo-item-open-store">{t("Open in the store")} ↗</a> : null}
              </div>
              {editable ? (
                <div className="ebay-inv-card__actions">
                  {moving === link.linkId ? (
                    <>
                      <select className="input" value={target} onChange={(event) => setTarget(event.target.value)} aria-label={t("Choose a card")}>
                        <option value="">{t("Choose a card")}</option>
                        {cards.map((c) => <option key={c.id} value={c.id}>{`${c.number} · ${c.name}`}</option>)}
                      </select>
                      <button type="button" className="inventory-link" disabled={!target || busy !== ""} onClick={() => void change(link.linkId, target)}>{t("Move")}</button>
                      <button type="button" className="inventory-link" onClick={() => { setMoving(""); setTarget(""); }}>{t("Cancel")}</button>
                    </>
                  ) : confirmUnlink === link.linkId ? (
                    <>
                      <span className="inventory-sub">{t("Unlink this product? Orders that already took stock keep it; new orders for this product will not reserve stock on this card.")}</span>
                      <button type="button" className="inventory-link" disabled={busy !== ""} onClick={() => void change(link.linkId, "")}>{t("Unlink")}</button>
                      <button type="button" className="inventory-link" onClick={() => setConfirmUnlink("")}>{t("Cancel")}</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="inventory-link" onClick={() => setMoving(link.linkId)}>{t("Change card")}</button>
                      <button type="button" className="inventory-link" onClick={() => setConfirmUnlink(link.linkId)}>{t("Unlink")}</button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default WooItemLinks;
