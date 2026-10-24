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

//
// ETSY-E2E r2 (24 Oct 2026): freshness. Each photo carries expiresAtMs (when NivaDesk asked Etsy + 6 h;
// lib/studioflow/etsyListingPhotos.ts). A photo is never shown at or after it: it turns into the placeholder
// with "View on Etsy" and the server is asked again at the earliest expiry while the order is open. An empty
// address, a broken image, a refused call or an error while drawing is the same placeholder — never a broken
// order screen (EtsySafe below catches anything the panel throws). The Firebase client is loaded on use, so
// the panel can be drawn by the check scripts without a Firebase app.

import { Component, useEffect, useState, type ReactNode } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { studioT } from "@/lib/studioflow/language";
import { etsyPersonalisationLine } from "@/lib/studioflow/etsyFirstImport";
import { etsyFulfilmentLine, type EtsyFulfilment } from "@/lib/studioflow/etsyFulfilment";
import {
  etsyListingLink, etsyPhotoIsShowable, loadEtsyListingPhotos, nextEtsyPhotoExpiry,
  type EtsyListingPhoto, type EtsyPhotosAnswer
} from "@/lib/studioflow/etsyListingPhotos";
import { EtsyText } from "./EtsyText";

export type { EtsyListingPhoto, EtsyPhotosAnswer };

/** Etsy's copy of the order (etsySource), read once. null = none (not an Etsy order, or disconnected). */
export function useEtsySource(orderId: string, enabled: boolean): EtsySource | null {
  const [source, setSource] = useState<EtsySource | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    if (!orderId || !enabled) return;
    import("@/lib/firebase/client")
      .then(({ db }) => getDoc(doc(db, "siparisler", orderId)))
      .then((snap) => { if (!cancelled) setSource(((snap.data() || {}) as { etsySource?: EtsySource }).etsySource || null); })
      .catch(() => { if (!cancelled) setSource(null); });
    return () => { cancelled = true; };
  }, [orderId, enabled]);
  return source;
}

async function callGetEtsyListingPhotos(orderId: string): Promise<unknown> {
  const { functions } = await import("@/lib/firebase/client");
  const res = await httpsCallable<{ orderId: string }, unknown>(functions, "getEtsyListingPhotos")({ orderId });
  return res.data;
}

/**
 * Product photos, asked of Etsy (through NivaDesk's server) when the order is opened, and again when the
 * earliest photo expires while it stays open. Never written anywhere; a fresh in-memory answer serves a reopen.
 */
export function useEtsyListingPhotos(orderId: string, enabled: boolean): EtsyPhotosAnswer {
  const [answer, setAnswer] = useState<EtsyPhotosAnswer>({ photos: [], reason: "", loading: false });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!orderId || !enabled) { setAnswer({ photos: [], reason: "", loading: false }); return; }
    setAnswer((current) => ({ photos: current.photos.filter((photo) => etsyPhotoIsShowable(photo, Date.now(), true)), reason: "", loading: true }));
    void loadEtsyListingPhotos(orderId, callGetEtsyListingPhotos).then((next) => {
      if (cancelled) return;
      setAnswer(next);
      const expiry = nextEtsyPhotoExpiry(next.photos);
      if (expiry) {
        // At the expiry: drop what is shown (placeholder) and ask again.
        timer = setTimeout(() => {
          if (cancelled) return;
          setAnswer((current) => ({ ...current, photos: current.photos.filter((photo) => etsyPhotoIsShowable(photo, Date.now(), true)) }));
          setRound((value) => value + 1);
        }, Math.max(0, expiry - Date.now()) + 50);
      }
    });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [orderId, enabled, round]);
  return answer;
}

/** Anything the Etsy parts throw while drawing becomes `fallback` (default: nothing) — the order screen stays. */
export class EtsySafe extends Component<{ children?: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* the order screen carries on without the Etsy part */ }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}

/**
 * One Etsy product photo: fixed box, placeholder while loading, when Etsy has none, when it has expired
 * (6 h rule), or when the image breaks. With `listingUrl`, the placeholder offers "View on Etsy".
 */
export function EtsyProductPhoto({ photo, size, label, large = false, listingUrl = "", linkLabel = "View on Etsy" }: {
  photo?: EtsyListingPhoto; size: number; label: string; large?: boolean; listingUrl?: string; linkLabel?: string;
}) {
  const [broken, setBroken] = useState(false);
  let url = "";
  let ok = false;
  try {
    url = String((large ? (photo?.url || photo?.thumbUrl) : (photo?.thumbUrl || photo?.url)) || "");
    ok = !broken && etsyPhotoIsShowable(photo, Date.now(), large);
  } catch {
    ok = false;
  }
  return (
    <span className={`etsy-product-photo${large ? " is-large" : ""}`} style={large ? undefined : { width: size, height: size }}>
      {ok ? (
        <img src={url} alt={photo?.alt || label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : listingUrl ? (
        <a className="etsy-product-photo__empty" href={listingUrl} target="_blank" rel="noopener noreferrer" aria-label={`${label} · ${linkLabel}`} data-etsy-photo-placeholder="">▢</a>
      ) : (
        <span className="etsy-product-photo__empty" aria-label={label} role="img" data-etsy-photo-placeholder="">▢</span>
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
  /** K2: what Etsy says about shipping and delivery (server, new). Older orders only have isShipped. */
  fulfilment?: EtsyFulfilment | null;
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

type EtsySourcePanelProps = { source: EtsySource | null; photos: EtsyPhotosAnswer; language: string; showMoney: boolean };

/** The panel, behind EtsySafe: an Etsy copy that cannot be drawn hides the panel, never the order. */
export function EtsySourcePanel(props: EtsySourcePanelProps) {
  return <EtsySafe><EtsySourcePanelBody {...props} /></EtsySafe>;
}

function EtsySourcePanelBody({ source, photos, language, showMoney }: EtsySourcePanelProps) {
  const t = (text: string) => studioT(text, language);
  if (!source || !Array.isArray(source.items)) return null;
  const photoFor = (item: EtsyItem) => (photos?.photos || []).find((row) => row.listingId && row.listingId === String(item.listingId || ""));
  const linkFor = (item: EtsyItem) => etsyListingLink(photoFor(item), item.listingId);
  const fulfilment = etsyFulfilmentLine(source, language);
  const currency = String(source.currency || "").toUpperCase();
  const state = source.isCancelled ? t("Cancelled") : source.isRefunded ? t("Refunded") : source.isShipped ? t("Shipped") : source.isPaid ? t("Paid") : "";
  const fetched = Number(source.fetchedAtMs || 0);
  return (
    <section className="etsy-source-panel" data-etsy-source-panel="">
      <header className="etsy-source-panel__head">
        <strong>{t("Etsy order")}{source.receiptId ? ` #${source.receiptId}` : ""}</strong>
        {state ? <span className="studio-pill">{state}</span> : null}
      </header>
      {fulfilment ? (
        <p className="etsy-source-panel__fulfilment" data-etsy-fulfilment="">
          <span>{fulfilment.text}</span>
          {fulfilment.muted ? <span className="etsy-source-panel__muted muted-copy"> · {fulfilment.muted}</span> : null}
        </p>
      ) : null}
      <ul className="etsy-source-panel__items">
        {source.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="etsy-source-panel__item">
            <EtsyProductPhoto photo={photoFor(item)} size={56} label={t("Product photo from Etsy")} listingUrl={linkFor(item)} linkLabel={t("View on Etsy")} />
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
            {linkFor(item) ? (
              <a className="etsy-source-panel__listing" href={linkFor(item)} target="_blank" rel="noopener noreferrer">{t("View on Etsy")} ↗</a>
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
      {photos?.reason === "not_connected" || photos?.reason === "quota" || photos?.reason === "unavailable" ? (
        <p className="etsy-source-panel__foot">{t("Product photos open on Etsy.")}</p>
      ) : null}
      <p className="etsy-source-panel__foot">
        {t("Read-only: this is Etsy's copy of the order. Your own changes go in the cards below.")}
        {fetched ? ` · ${t("Last updated from Etsy")} ${new Date(fetched).toLocaleString()}` : ""}
      </p>
      {/* Etsy API Terms: the required trademark notice, verbatim and never translated. */}
      <p className="etsy-source-panel__foot" data-etsy-trademark="" lang="en">
        {"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}
      </p>
    </section>
  );
}

export default EtsySourcePanel;
