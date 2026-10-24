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
//
// ETSY-E2E night (24 Oct 2026): product photos. Etsy API Terms (Display of Data): listing content shown must not be
// more than 6 hours older than Etsy's. So the photo is never stored: the server asks Etsy when the order is opened
// (getEtsyListingPhotos, kept under 6 h in the function's memory) and passes on only Etsy's own image host. A
// missing or broken image shows a placeholder and the "View on Etsy" link. The buyer's own uploaded photo stays a
// link ("Photo attached"), not an embedded image.

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import { studioT } from "@/lib/studioflow/language";
import { etsyPersonalisationLine } from "@/lib/studioflow/etsyFirstImport";
import { EtsyText } from "./EtsyText";

export type EtsyListingPhoto = { transactionId?: string; listingId?: string; url?: string; thumbUrl?: string; alt?: string; listingUrl?: string };
export type EtsyPhotosAnswer = { photos: EtsyListingPhoto[]; reason: string; loading: boolean };

/** Etsy's copy of the order (etsySource), read once. null = none (not an Etsy order, or disconnected). */
export function useEtsySource(orderId: string, enabled: boolean): EtsySource | null {
  const [source, setSource] = useState<EtsySource | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    if (!orderId || !enabled) return;
    getDoc(doc(db, "siparisler", orderId))
      .then((snap) => { if (!cancelled) setSource(((snap.data() || {}) as { etsySource?: EtsySource }).etsySource || null); })
      .catch(() => { if (!cancelled) setSource(null); });
    return () => { cancelled = true; };
  }, [orderId, enabled]);
  return source;
}

/** Product photos, asked of Etsy (through NivaDesk's server) each time the order is opened. Never written anywhere. */
export function useEtsyListingPhotos(orderId: string, enabled: boolean): EtsyPhotosAnswer {
  const [answer, setAnswer] = useState<EtsyPhotosAnswer>({ photos: [], reason: "", loading: false });
  useEffect(() => {
    let cancelled = false;
    if (!orderId || !enabled) { setAnswer({ photos: [], reason: "", loading: false }); return; }
    setAnswer({ photos: [], reason: "", loading: true });
    httpsCallable<{ orderId: string }, { photos?: EtsyListingPhoto[]; reason?: string }>(functions, "getEtsyListingPhotos")({ orderId })
      .then((res) => { if (!cancelled) setAnswer({ photos: res.data?.photos || [], reason: String(res.data?.reason || ""), loading: false }); })
      .catch(() => { if (!cancelled) setAnswer({ photos: [], reason: "unavailable", loading: false }); });
    return () => { cancelled = true; };
  }, [orderId, enabled]);
  return answer;
}

/** One Etsy product photo: fixed box, placeholder while loading, when Etsy has none, or when the image breaks. */
export function EtsyProductPhoto({ photo, size, label, large = false }: { photo?: EtsyListingPhoto; size: number; label: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const url = large ? (photo?.url || photo?.thumbUrl) : (photo?.thumbUrl || photo?.url);
  const ok = Boolean(url) && !broken && /^https:\/\/i\.etsystatic\.com\//.test(String(url));
  return (
    <span className={`etsy-product-photo${large ? " is-large" : ""}`} style={large ? undefined : { width: size, height: size }}>
      {ok ? (
        <img src={url} alt={photo?.alt || label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span className="etsy-product-photo__empty" aria-label={label} role="img">▢</span>
      )}
    </span>
  );
}

type EtsyItem = { listingId?: string; title?: string; quantity?: number; unitPrice?: number; currency?: string; options?: { name?: string; value?: string }[]; personalization?: { name?: string; value?: string }[] };
export type EtsySource = {
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

export function EtsySourcePanel({ source, photos, language, showMoney }: { source: EtsySource | null; photos: EtsyPhotosAnswer; language: string; showMoney: boolean }) {
  const t = (text: string) => studioT(text, language);
  if (!source || !Array.isArray(source.items)) return null;
  const photoFor = (item: EtsyItem) => photos.photos.find((row) => row.listingId && row.listingId === String(item.listingId || ""));
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
          <li key={`${item.title}-${index}`} className="etsy-source-panel__item">
            <EtsyProductPhoto photo={photoFor(item)} size={56} label={t("Product photo from Etsy")} />
            <div className="etsy-source-panel__body">
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
              return (
                <p key={i} className="etsy-source-panel__personalisation">
                  <span>{isUploadUrl(value) ? (entry.name || t("Personalisation")) : t("Personalisation")}: </span>
                  <EtsyText value={isUploadUrl(value) ? value : etsyPersonalisationLine(value)} photoLabel={t("Photo attached")} />
                </p>
              );
            })}
            {photoFor(item)?.listingUrl ? (
              <a className="etsy-source-panel__listing" href={photoFor(item)?.listingUrl} target="_blank" rel="noopener noreferrer">{t("View on Etsy")} ↗</a>
            ) : null}
            </div>
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
      {photos.reason === "not_connected" || photos.reason === "quota" || photos.reason === "unavailable" ? (
        <p className="etsy-source-panel__foot">{t("Product photos open on Etsy.")}</p>
      ) : null}
      <p className="etsy-source-panel__foot">
        {t("Read-only: this is Etsy's copy of the order. Your own changes go in the cards below.")}
        {fetched ? ` · ${t("Last updated from Etsy")} ${new Date(fetched).toLocaleString()}` : ""}
      </p>
    </section>
  );
}

export default EtsySourcePanel;
