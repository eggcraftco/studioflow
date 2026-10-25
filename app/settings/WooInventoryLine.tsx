"use client";

// One line on the WooCommerce settings card (MC-3 fix, 25 Oct 2026): how many of THIS store's products are linked to
// stock, and the way to Inventory ▸ WooCommerce products with this store already chosen. Before it, nothing on the
// WooCommerce card led to the product import (the eBay card has had its line since E4), so an owner looking for "add
// my store's products to Inventory" in Settings found no way in. Drawn only where the server has the products switch
// on for this workspace (a failed or missing call draws nothing). Read-only: it only reads getWooProductLinks.
import { useEffect, useState } from "react";
import { getWooProductLinks, wooInventoryT, type WooLinksAnswer } from "@/lib/studioflow/wooInventory";
import { fill } from "@/lib/studioflow/wooInventoryRules";

export function WooInventoryLine({ companyId, connectionId, language }: { companyId: string; connectionId: string; language: string }) {
  const t = (sentence: string) => wooInventoryT(sentence, language);
  const [answer, setAnswer] = useState<WooLinksAnswer | null>(null);
  useEffect(() => {
    let cancelled = false;
    getWooProductLinks(companyId, { connectionId }).then((next) => { if (!cancelled) setAnswer(next); }).catch(() => { if (!cancelled) setAnswer(null); });
    return () => { cancelled = true; };
  }, [companyId, connectionId]);
  if (!answer || !answer.enabled) return null;
  const linked = answer.links.filter((l) => l.linked === true && l.connectionId === connectionId).length;
  return (
    <div className="ebay-inv-line" data-testid="woo-inventory-line">
      <strong>{t("Products → Inventory")}</strong>
      <span>{fill(t("{count} store products linked to stock"), { count: linked })}</span>
      <a className="inventory-link" data-testid="woo-inventory-open" href={`/inventory?panel=woo&store=${encodeURIComponent(connectionId)}`}>{t("Bring this store's products into Inventory")}</a>
    </div>
  );
}

export default WooInventoryLine;
