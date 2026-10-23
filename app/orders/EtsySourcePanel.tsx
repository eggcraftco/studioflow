"use client";

// ETSY-E2E (24 Oct 2026) — the read-only "Etsy order" panel (brief §3.7, ETSY-6).
//
// Every imported Etsy order carries `etsySource` (written by the server on every sync, never by a
// client), and no screen read it: what the buyer actually asked for — the item options, the
// personalisation lines, an uploaded photo, the note and the gift message — was only findable
// inside a long design name and the notes card, on a phone far below an empty "Preview" card.
// This panel shows Etsy's copy as Etsy's copy: read-only, stamped with when NivaDesk last fetched
// it (API Terms §1: Etsy content must not be shown older than 24 h without saying so — the sync
// refreshes it whenever Etsy changes the receipt). Money only with Financial Info.
//
// It reads the order document itself (one getDoc) rather than widening the shared order model,
// so nothing else in the app changes shape.

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { etsyPersonalisationLine } from "@/lib/studioflow/etsyFirstImport";

type EtsyItem = { title?: string; quantity?: number; unitPrice?: number; currency?: string; options?: { name?: string; value?: string }[]; personalization?: { name?: string; value?: string }[] };
type EtsySource = {
  receiptId?: string; status?: string; isPaid?: boolean; isShipped?: boolean; isCancelled?: boolean; isRefunded?: boolean;
  currency?: string; subtotal?: number; discount?: number; shipping?: number; tax?: number; grandTotal?: number;
  buyerNote?: string; giftMessage?: string; items?: EtsyItem[]; fetchedAtMs?: number;
  /** Fields the seller changed in NivaDesk where Etsy now says something else (server: etsySource.differs). */
  differs?: { field?: string; etsyValue?: string }[];
};

// What a merge-policy field is called on screen.
const FIELD_LABEL: Record<string, string> = {
  customerName: "Customer name", designName: "Design name", emailAddress: "Email", shippingName: "Delivery name",
  shippingStreetAddress: "Delivery address", shippingCity: "Delivery address", shippingPostalCode: "Delivery address", shippingCountry: "Delivery address"
};

function money(value: number | undefined, currency: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function isUploadUrl(value: string): boolean {
  return /^https:\/\/i\.etsystatic\.com\//i.test(value.trim());
}

export function EtsySourcePanel({ orderId, language, showMoney }: { orderId: string; language: string; showMoney: boolean }) {
  const t = (text: string) => studioT(text, language);
  const [source, setSource] = useState<EtsySource | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!orderId) return;
    getDoc(doc(db, "siparisler", orderId))
      .then((snap) => { if (!cancelled) setSource(((snap.data() || {}) as { etsySource?: EtsySource }).etsySource || null); })
      .catch(() => { if (!cancelled) setSource(null); });
    return () => { cancelled = true; };
  }, [orderId]);
  if (!source || !Array.isArray(source.items)) return null;
  const currency = String(source.currency || "").toUpperCase();
  const state = source.isCancelled ? t("Cancelled") : source.isRefunded ? t("Refunded") : source.isShipped ? t("Shipped") : source.isPaid ? t("Paid") : "";
  const fetched = Number(source.fetchedAtMs || 0);
  return (
    <section className="etsy-source-panel" data-etsy-source-panel="">
      <header className="etsy-source-panel__head">
        <strong>{t("Etsy order")}{source.receiptId ? ` #${source.receiptId}` : ""}</strong>
        {state ? <span className="studio-pill">{state}</span> : null}
      </header>
      <ul className="etsy-source-panel__items">
        {source.items.map((item, index) => (
          <li key={`${item.title}-${index}`}>
            <div className="etsy-source-panel__line">
              <span className="etsy-source-panel__title">{item.title || t("Item")}</span>
              <span className="etsy-source-panel__qty">× {Number(item.quantity || 1)}</span>
              {showMoney ? <span className="etsy-source-panel__price">{money(item.unitPrice, item.currency || currency)}</span> : null}
            </div>
            {(item.options || []).length ? (
              <p className="etsy-source-panel__options">
                {(item.options || []).map((option) => (option.name ? `${option.name}: ${option.value}` : option.value)).join(" · ")}
              </p>
            ) : null}
            {(item.personalization || []).map((entry, i) => {
              const value = String(entry.value || "");
              return isUploadUrl(value) ? (
                <p key={i} className="etsy-source-panel__personalisation">
                  <span>{entry.name || t("Personalisation")}: </span>
                  <a href={value} target="_blank" rel="noopener noreferrer">{t("Buyer's photo")} ↗</a>
                </p>
              ) : (
                <p key={i} className="etsy-source-panel__personalisation">
                  <span>{t("Personalisation")}: </span>{etsyPersonalisationLine(value)}
                </p>
              );
            })}
          </li>
        ))}
      </ul>
      {source.buyerNote ? <p className="etsy-source-panel__note"><span>{t("Buyer note")}: </span>{source.buyerNote}</p> : null}
      {source.giftMessage ? <p className="etsy-source-panel__note"><span>{t("Gift message")}: </span>{source.giftMessage}</p> : null}
      {(source.differs || []).length ? (
        <div className="etsy-source-panel__differs" role="note">
          <strong>{t("Changed on Etsy")}</strong>
          {(source.differs || []).map((row, i) => (
            <p key={`${row.field}-${i}`}>
              {`${t(FIELD_LABEL[String(row.field || "")] || "Delivery address")}: ${row.etsyValue || "—"}`}
            </p>
          ))}
          <p className="etsy-source-panel__foot">{t("Your edit in NivaDesk is kept. Update the order yourself if Etsy's version is right.")}</p>
        </div>
      ) : null}
      {showMoney ? (
        <dl className="etsy-source-panel__money">
          <div><dt>{t("Subtotal")}</dt><dd>{money(source.subtotal, currency)}</dd></div>
          {source.discount ? <div><dt>{t("Discount")}</dt><dd>−{money(source.discount, currency)}</dd></div> : null}
          <div><dt>{t("Shipping")}</dt><dd>{money(source.shipping, currency)}</dd></div>
          {source.tax ? <div><dt>{t("Tax")}</dt><dd>{money(source.tax, currency)}</dd></div> : null}
          <div className="is-total"><dt>{t("Total")}</dt><dd>{money(source.grandTotal, currency)}</dd></div>
        </dl>
      ) : null}
      <p className="etsy-source-panel__foot">
        {t("Read-only: this is Etsy's copy of the order. Your own changes go in the cards below.")}
        {fetched ? ` · ${t("Last updated from Etsy")} ${new Date(fetched).toLocaleString()}` : ""}
      </p>
    </section>
  );
}

export default EtsySourcePanel;
