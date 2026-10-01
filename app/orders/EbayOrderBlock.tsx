"use client";

// The order page's eBay block (1 Oct 2026, package E3). What eBay says about the
// order — its number, its payment, its cancellation, its own shipping — shown
// apart from what the workshop does with it: NivaDesk's production stage and
// the Shipping & Tracking card below are the workshop's, and neither side writes
// the other. A cancelled, or fully refunded, eBay order says so here in words,
// so it is not read as live work or as money still owed.
//
// Everything it prints comes from `ebayOrderBlockView` (lib/studioflow/
// ebayScreens.ts), where the gates live and a test can hold them: eBay's money
// (one concept per line, as the server states it in commerce.money — never a
// payout it does not know) only with Financial Info, and no buyer at all — the
// view has no field for one
// (the order's customer field carries the eBay username; the name and address
// stay in the restricted store behind "Show address"). The link is built from
// the order's own id: a stored URL is never opened as it is, and a value that is
// not an eBay order id earns no link.
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { ebayOrderBlockView, type EbayStamp } from "@/lib/studioflow/ebayScreens";

/** An amount in the person's language and the order's own currency; the plain figure if Intl cannot word it. */
function amountText(amount: string, currency: string, locale: string): string {
  try {
    return currency ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount)) : amount;
  } catch {
    return `${amount} ${currency}`.trim();
  }
}

export function EbayOrderBlock({ stamp, canSeeFinance, language }: {
  stamp: EbayStamp | null;
  canSeeFinance: boolean;
  language: string;
}) {
  const view = ebayOrderBlockView(stamp, { canSeeFinance });
  if (!view) return null;
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const synced = view.syncedAtMs > 0 ? new Date(view.syncedAtMs).toLocaleString(locale) : "";
  const { status } = view;
  return (
    <div className="shopify-source-strip channel-source-strip ebay-order-block" data-ebay-order-block={view.note} data-ebay-money={view.money.length ? "shown" : "hidden"}>
      <span className="shopify-source-badge">eBay</span>
      {view.connection ? <span className="shopify-source-item">{view.connection}</span> : null}
      {view.number ? <span className="shopify-source-item">· #{view.number}</span> : null}
      {synced ? <span className="shopify-source-item">· {t("Last synced from eBay")}: {synced}</span> : null}
      {view.link ? (
        <a className="shopify-source-link" href={view.link} target="_blank" rel="noopener noreferrer" data-ebay-open-link="1">
          {t("Open on eBay")} ↗
        </a>
      ) : null}
      <span className="ebay-order-block__statuses">
        {status.platform ? <span className={status.closed ? "due-pill danger" : "due-pill"}>{t("eBay order")}: {t(status.platform)}</span> : null}
        {status.payment ? <span className={status.refunded ? "due-pill warning" : "due-pill"}>{t("eBay payment")}: {t(status.payment)}</span> : null}
        {status.fulfilment ? <span className="due-pill">{t(status.fulfilment)}</span> : null}
        {status.reviewReasons.length ? <span className="due-pill warning">{t("Needs a look")}: {status.reviewReasons.map((reason) => t(reason)).join(", ")}</span> : null}
      </span>
      {view.money.length || view.payout ? (
        <dl className="ebay-order-block__money" aria-label={t("eBay payment")}>
          {view.money.map((line) => (
            <div key={line.key} data-ebay-money-line={line.key} className={line.info ? "is-info" : undefined}>
              <dt>{t(line.label)}</dt>
              <dd>{amountText(line.amount, line.currency, locale)}</dd>
            </div>
          ))}
          {view.payout ? (
            <div data-ebay-money-line="seller_payout" className="is-info">
              <dt>{t("Seller payout")}</dt>
              <dd>{t("Not known: eBay's payouts are not read")}</dd>
            </div>
          ) : null}
          {view.otherCurrency.length ? (
            <div data-ebay-money-line="other_currency" className="is-info">
              <dt>{t("Other currency")}</dt>
              <dd>{view.otherCurrency.map((row) => amountText(row.amount, row.currency, locale)).join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <span className="ebay-order-block__note">
        {view.note === "closed"
          ? t("eBay has closed this sale (cancelled or fully refunded). It is not live production work, and the buyer owes nothing on it. The workshop's own stage and shipping below are kept apart from eBay's statuses.")
          : t("These are eBay's statuses. The workshop's production stage and shipping are tracked below and do not change them.")}
      </span>
    </div>
  );
}
