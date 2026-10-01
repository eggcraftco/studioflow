"use client";

// A stock card's eBay listings (package E4), in the item panel. Drawn only for a card that carries eBay links
// (`channelLinks`, ids only on the card itself); the listing's eBay side — its quantity for sale, its price, its
// picture — is read from the server, which leaves the price out for anyone without Financial Info. eBay's numbers
// are eBay's: the shelf count and the cost above are the card's own and nothing here changes them. Unlink and
// Change card never rewrite what an order already took: the answer says how many open orders still hold stock on
// the previous card.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import type { InventoryItem } from "@/lib/studioflow/inventory";
import { studioLocaleTag } from "@/lib/studioflow/language";
import { changeEbayListingLink, getEbayListingLinks, ebayInventoryT, type EbayLinkView } from "@/lib/studioflow/ebayInventory";
import { fill, reasonSentence, safePictureUrl } from "@/lib/studioflow/ebayInventoryRules";

type Props = { workspace: WorkspaceContext; item: InventoryItem; items: InventoryItem[]; canEdit: boolean; language: string; onChanged?: () => void | Promise<void> };

function priceText(price: { value: string; currency: string } | null, locale: string): string {
  if (!price) return "";
  try { return price.currency ? new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(Number(price.value)) : price.value; }
  catch { return `${price.value} ${price.currency}`.trim(); }
}

export function EbayItemLinks({ workspace, item, items, canEdit, language, onChanged }: Props) {
  const t = useCallback((sentence: string) => ebayInventoryT(sentence, language), [language]);
  const locale = studioLocaleTag(language);
  const linkedOnCard = (item.channelLinks || []).some((l) => l && l.provider === "ebay");
  const [links, setLinks] = useState<EbayLinkView[] | null>(null);
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
      const answer = await getEbayListingLinks(workspace.id, item.id);
      setLinks(answer.links); setMoney(answer.money); setEditable(answer.canEdit && canEdit); setError("");
    } catch {
      setError(t("This could not be done."));
    }
  }, [workspace.id, item.id, canEdit, t]);
  useEffect(() => { if (linkedOnCard) void load(); }, [linkedOnCard, load]);
  const cards = useMemo(() => items.filter((i) => i.id !== item.id && i.ownership !== "customer" && i.status !== "archived" && i.status !== "removed"), [items, item.id]);

  if (!linkedOnCard) return null;

  async function change(linkId: string, to: string) {
    setBusy(linkId); setError(""); setNotice("");
    try {
      const answer = await changeEbayListingLink(workspace.id, linkId, to);
      if (!answer.ok) { setError(t(reasonSentence(String(answer.reason || "failed")))); return; }
      setNotice(fill(t("Done. {count} open eBay orders still hold stock on the previous card."), { count: answer.openOrderLinesOnPreviousCard || 0 }));
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
    <section className="inventory-panel-card ebay-inv-card" data-testid="ebay-item-links">
      <header><strong>{t("On eBay")}</strong></header>
      <p className="inventory-sub">{t("eBay's quantity and price are eBay's; the shelf count and the cost on this card are yours.")}</p>
      {item.source === "ebay" && Number(item.internalTotalCost || 0) === 0 ? <p className="inventory-sub" data-testid="ebay-cost-unknown">{t("Cost not entered — eBay does not know what you paid.")}</p> : null}
      {links === null && !error ? <p className="inventory-sub">{t("Loading…")}</p> : null}
      {error ? <p className="layout-error">{error}</p> : null}
      {notice ? <p className="success-copy">{notice}</p> : null}
      <ul className="ebay-inv-card__list">
        {(links || []).map((link) => (
          <li key={link.linkId} data-link-id={link.linkId}>
            {safePictureUrl(link.pictureUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ebay-inv__pic" src={safePictureUrl(link.pictureUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} title={t("Picture shown from eBay's servers; not copied into NivaDesk")} />
            ) : null}
            <div className="ebay-inv__what">
              <strong className="ebay-inv__title">{link.title}</strong>
              {link.variationTitle ? <span className="inventory-sub">{link.variationTitle}</span> : null}
              <span className="inventory-sub">{link.sku ? <>SKU <code>{link.sku}</code> · </> : null}eBay #{link.itemId}</span>
              {link.listedQuantity !== null ? <span className="inventory-sub">{fill(t("eBay shows {count} for sale — eBay's number, not your shelf count"), { count: link.listedQuantity })}</span> : null}
              {money && link.price ? <span className="inventory-sub">{t("Sale price on eBay")}: <strong>{priceText(link.price, locale)}</strong></span> : null}
              {link.seenAtMs ? <span className="inventory-sub">{t("Last read from eBay")}: {new Date(link.seenAtMs).toLocaleString(locale)}</span> : null}
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
                    <span className="inventory-sub">{t("Unlink this listing? Orders that already took stock keep it; new eBay orders for this listing will not reserve stock.")}</span>
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
        ))}
      </ul>
    </section>
  );
}

export default EbayItemLinks;
