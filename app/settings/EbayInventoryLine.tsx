"use client";

// One line on the eBay settings card (package E4): how many eBay listings are linked to stock, whether the seller's
// consent includes the listing read, and the way to Inventory ▸ eBay listings. Drawn only where the server has
// switched eBay listings on for this workspace (a failed or missing call draws nothing). Reconnect is the card's own
// button: with the switch on, its consent page also asks for eBay's basic read scope — never a scope that writes.
import { useEffect, useState } from "react";
import { getEbayListingLinks, ebayInventoryT, type EbayLinksAnswer } from "@/lib/studioflow/ebayInventory";
import { fill } from "@/lib/studioflow/ebayInventoryRules";

export function EbayInventoryLine({ companyId, connectionId, language }: { companyId: string; connectionId: string; language: string }) {
  const t = (sentence: string) => ebayInventoryT(sentence, language);
  const [answer, setAnswer] = useState<EbayLinksAnswer | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEbayListingLinks(companyId).then((next) => { if (!cancelled) setAnswer(next); }).catch(() => { if (!cancelled) setAnswer(null); });
    return () => { cancelled = true; };
  }, [companyId]);
  if (!answer || !answer.enabled) return null;
  const connection = answer.connections.find((c) => c.connectionId === connectionId) || null;
  const linked = answer.links.filter((l) => l.linked && l.connectionId === connectionId).length;
  return (
    <div className="ebay-inv-line" data-testid="ebay-inventory-line">
      <strong>{t("Products → Inventory")}</strong>
      <span>{fill(t("{count} eBay listings linked to stock"), { count: linked })}</span>
      <span className={connection && connection.listingReadGranted ? "due-pill success" : "due-pill warning"} data-testid="ebay-listing-access">
        {connection && connection.listingReadGranted ? t("Listing access approved") : t("Listing access not approved yet: Reconnect eBay to approve it")}
      </span>
      <a className="inventory-link" href="/inventory?panel=ebay">{t("Open eBay listings")}</a>
    </div>
  );
}

export default EbayInventoryLine;
