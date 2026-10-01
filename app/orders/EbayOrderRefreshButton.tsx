"use client";

// Refresh one eBay order from its page (1 Oct 2026). The server fetches the order
// fresh from eBay and lands it through the connector's one apply path: it never
// creates an order, and an older copy at eBay changes nothing. The page listens to
// the order document, so what changed shows by itself; this button only says what
// happened. Shown for eBay orders only, to anyone who can open the order (Sync now
// is a member's button too).
import { useState } from "react";
import { refreshEbayOrder, ebaySyncT } from "@/lib/studioflow/ebaySync";
import { ebayCallableErrorText } from "@/lib/studioflow/ebayScreenRules";
import { refreshOutcomeSentence } from "@/lib/studioflow/ebaySyncRules";

type Props = {
  order: { id: string; companyId: string; commerce: { provider?: string } | null };
  language: string;
};

export function EbayOrderRefreshButton({ order, language }: Props) {
  const t = (sentence: string) => ebaySyncT(sentence, language);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  if (String(order.commerce?.provider || "") !== "ebay") return null;
  return (
    <div className="shopify-source-strip channel-source-strip" data-testid="ebay-order-refresh">
      <button type="button" className="link-button" disabled={busy}
        onClick={async () => {
          setBusy(true); setNotice(""); setError("");
          try {
            const answer = await refreshEbayOrder(order.companyId, order.id);
            const sentence = refreshOutcomeSentence(answer.result);
            if (sentence === "This order could not be refreshed.") setError(t(sentence)); else setNotice(t(sentence));
          } catch (err) {
            setError(t(ebayCallableErrorText(err, "This order could not be refreshed.")));
          } finally {
            setBusy(false);
          }
        }}>
        {busy ? t("Refreshing…") : t("Refresh from eBay")}
      </button>
      {notice ? <span className="shopify-source-item" data-testid="ebay-order-refresh-notice">· {notice}</span> : null}
      {error ? <span className="shopify-source-item" style={{ color: "#dc2626" }} data-testid="ebay-order-refresh-error">· {error}</span> : null}
    </div>
  );
}

export default EbayOrderRefreshButton;
