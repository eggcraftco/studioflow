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

//
// ETSY-UI-1 (27 Oct 2026, owner-approved design): the panel became the order page's Etsy block. It stays in the
// page flow above the cards (no pinning, no inner scroll) and is still not a card: the card layout never names
// it. Header: Etsy's own statuses as chips, "as of" the fetch, "Open in Etsy". Each line: the photo (click to
// enlarge in a dialog), "qty × title", the unit price (Financial Info only), option chips, the personalisation
// highlighted with a Copy button, "View listing on Etsy". Side: buyer note, gift message, Etsy's totals with the
// tax line COMPUTED from the stored figures (lib/studioflow/etsyOrderView.ts), never assumed. The photo rules
// above are unchanged (asked of Etsy on open, never stored, 6 h expiry, Etsy's own image host only).

import { Component, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { etsyPersonalisationLine } from "@/lib/studioflow/etsyFirstImport";
import { etsyFulfilmentLine, type EtsyFulfilment } from "@/lib/studioflow/etsyFulfilment";
import {
  etsyListingLink, etsyPhotoIsShowable, loadEtsyListingPhotos, nextEtsyPhotoExpiry,
  type EtsyListingPhoto, type EtsyPhotosAnswer
} from "@/lib/studioflow/etsyListingPhotos";
import { etsyOrderLink, etsyPhotoForItem, etsyStatusChips, etsyTaxMode } from "@/lib/studioflow/etsyOrderView";
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


type EtsyItem = { transactionId?: string; listingId?: string; title?: string; quantity?: number; unitPrice?: number; currency?: string; options?: { name?: string; value?: string }[]; personalization?: { name?: string; value?: string }[] };
export type EtsySource = {
  receiptId?: string; status?: string; isPaid?: boolean; isShipped?: boolean; isCancelled?: boolean; isRefunded?: boolean;
  currency?: string; subtotal?: number; discount?: number; shipping?: number; tax?: number; grandTotal?: number;
  buyerNote?: string; giftMessage?: string; items?: EtsyItem[]; fetchedAtMs?: number;
  /** Fields the seller changed in NivaDesk where Etsy now says something else (server: etsySource.differs). */
  differs?: { field?: string; etsyValue?: string }[];
  /** K2: what Etsy says about shipping and delivery (server, new). Older orders only have isShipped. */
  fulfilment?: EtsyFulfilment | null;
  /** ETSY-SHIP-2 (server): whose figure the order's deliveryCost holds — "buyer_paid_assumed" or "seller_entered". */
  deliveryCostSource?: string;
  /** The seller's Sold Orders page filtered to this receipt (server: etsySource.viewOnEtsyUrl). */
  viewOnEtsyUrl?: string;
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

function fetchedText(ms: number, language: string): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  try {
    return new Intl.DateTimeFormat(studioLocaleTag(language), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Copies a buyer's personalisation; the clipboard API first, a hidden textarea where it is missing. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the textarea */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

type EtsySourcePanelProps = { source: EtsySource | null; photos: EtsyPhotosAnswer; language: string; showMoney: boolean };

/** The panel, behind EtsySafe: an Etsy copy that cannot be drawn hides the panel, never the order. */
export function EtsySourcePanel(props: EtsySourcePanelProps) {
  return <EtsySafe><EtsySourcePanelBody {...props} /></EtsySafe>;
}

type LightboxLine = { title: string; photo?: EtsyListingPhoto; link: string };

/**
 * The enlarged Etsy photo: a modal dialog on the page body (the order header's backdrop blur would otherwise
 * become its containing block). Focus goes to Close, Tab stays inside, Esc / Close / a click outside shut it
 * and focus returns to the photo that opened it. The image is Etsy's, shown from Etsy's host, never stored.
 */
function EtsyPhotoLightbox({ line, language, onClose }: { line: LightboxLine; language: string; onClose: () => void }) {
  const t = (text: string) => studioT(text, language);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="etsy-lightbox-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="etsy-lightbox" role="dialog" aria-modal="true" aria-labelledby="etsy-lightbox-title" onKeyDown={keepFocusInside} data-etsy-lightbox="">
        <div className="etsy-lightbox__head">
          <strong id="etsy-lightbox-title" dir="auto">{line.title}</strong>
          <button ref={closeRef} type="button" className="etsy-lightbox__close" aria-label={t("Close photo")} onClick={onClose}>×</button>
        </div>
        <div className="etsy-lightbox__photo">
          <EtsyProductPhoto photo={line.photo} size={0} large label={t("Photo from Etsy")} listingUrl={line.link} linkLabel={t("View on Etsy")} />
        </div>
        <div className="etsy-lightbox__foot">
          <span>{t("From the Etsy listing · not saved in NivaDesk")}</span>
          {line.link ? <a href={line.link} target="_blank" rel="noopener noreferrer">{t("View on Etsy")} ↗</a> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

function EtsySourcePanelBody({ source, photos, language, showMoney }: EtsySourcePanelProps) {
  const t = (text: string) => studioT(text, language);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!copiedKey) return;
    const timer = setTimeout(() => setCopiedKey(""), 1800);
    return () => clearTimeout(timer);
  }, [copiedKey]);
  if (!source || !Array.isArray(source.items)) return null;
  const photoFor = (item: EtsyItem) => etsyPhotoForItem(photos?.photos || [], item);
  const linkFor = (item: EtsyItem) => etsyListingLink(photoFor(item), item.listingId);
  const fulfilment = etsyFulfilmentLine(source, language);
  const currency = String(source.currency || "").toUpperCase();
  const chips = etsyStatusChips(source);
  const fetched = Number(source.fetchedAtMs || 0);
  const orderLink = etsyOrderLink(source);
  const taxMode = etsyTaxMode(source);
  const loading = Boolean(photos?.loading);
  const lineTitle = (item: EtsyItem) => `${Number(item.quantity || 1)} × ${item.title || t("Item")}`;
  const closeLightbox = () => {
    setOpenLine(null);
    const opener = openerRef.current;
    if (opener) setTimeout(() => opener.focus(), 0);
  };
  const lightboxItem = openLine !== null ? source.items[openLine] : undefined;
  return (
    <section className="etsy-source-panel" data-etsy-source-panel="" aria-label={t("Etsy order")}>
      <header className="etsy-source-panel__head">
        <span className="etsy-source-panel__badge" lang="en">Etsy</span>
        <h2 className="etsy-source-panel__heading">{t("Order")}{source.receiptId ? ` #${source.receiptId}` : ""}</h2>
        {chips.map((chip) => (
          <span key={chip.key} className={`studio-pill etsy-chip is-${chip.tone}`} data-etsy-chip={chip.key}>{t(chip.key)}</span>
        ))}
        <span className="etsy-source-panel__spacer" aria-hidden="true" />
        {fetched ? <span className="etsy-source-panel__asof" data-etsy-asof="">{t("as of {time}").replace("{time}", fetchedText(fetched, language))}</span> : null}
        {orderLink ? (
          <a className="etsy-source-panel__open" href={orderLink} target="_blank" rel="noopener noreferrer" data-etsy-open-order="">{t("Open in Etsy")} ↗</a>
        ) : null}
      </header>
      {fulfilment ? (
        <p className="etsy-source-panel__fulfilment" data-etsy-fulfilment="">
          <span>{fulfilment.text}</span>
          {fulfilment.muted ? <span className="etsy-source-panel__muted muted-copy"> · {fulfilment.muted}</span> : null}
        </p>
      ) : null}
      <div className="etsy-source-panel__grid">
        <ul className="etsy-source-panel__items">
          {source.items.map((item, index) => {
            const photo = photoFor(item);
            const link = linkFor(item);
            const title = item.title || t("Item");
            const showable = (() => { try { return etsyPhotoIsShowable(photo, Date.now(), true); } catch { return false; } })();
            const quantity = Number(item.quantity || 1);
            return (
              <li key={`${item.transactionId || item.title}-${index}`} className="etsy-source-panel__item" data-etsy-line={index}>
                <span className="etsy-item-photo" data-etsy-photo-state={showable ? "photo" : loading && !photo ? "loading" : "placeholder"}>
                  {showable ? (
                    <button
                      type="button"
                      className="etsy-item-photo__button"
                      aria-label={t("Enlarge the Etsy photo of {title}").replace("{title}", title)}
                      aria-haspopup="dialog"
                      onClick={(event) => { openerRef.current = event.currentTarget; setOpenLine(index); }}
                    >
                      <EtsyProductPhoto photo={photo} size={0} large label={t("Product photo from Etsy")} />
                    </button>
                  ) : loading && !photo ? (
                    <span className="etsy-item-photo__skeleton" role="img" aria-label={t("Loading the photo from Etsy")} aria-busy="true" />
                  ) : (
                    <EtsyProductPhoto photo={photo} size={0} large label={t("Product photo from Etsy")} listingUrl={link} linkLabel={t("View on Etsy")} />
                  )}
                </span>
                <div className="etsy-source-panel__body">
                  <div className="etsy-source-panel__line">
                    <span className="etsy-source-panel__title" dir="auto">{`${quantity} × ${title}`}</span>
                    {showMoney ? (
                      <span className="etsy-source-panel__price">
                        {quantity > 1
                          ? t("{price} each").replace("{price}", money(item.unitPrice, item.currency || currency))
                          : money(item.unitPrice, item.currency || currency)}
                      </span>
                    ) : null}
                  </div>
                  {(item.options || []).length ? (
                    <ul className="etsy-source-panel__options">
                      {(item.options || []).map((option, i) => (
                        <li key={i} className="etsy-option-chip" dir="auto">{option.name ? `${option.name}: ${option.value}` : option.value}</li>
                      ))}
                    </ul>
                  ) : null}
                  {(item.personalization || []).map((entry, i) => {
                    const value = String(entry.value || "");
                    const upload = isUploadUrl(value);
                    const text = upload ? value : etsyPersonalisationLine(value);
                    const key = `${index}-${i}`;
                    return (
                      <div key={i} className={`etsy-source-panel__personalisation${upload ? " is-upload" : ""}`} data-etsy-personalisation="">
                        <span className="etsy-source-panel__personalisation-label">{upload ? (entry.name || t("Personalisation")) : t("Personalisation")}</span>
                        <span className="etsy-source-panel__personalisation-value" dir="auto">
                          <EtsyText value={isUploadUrl(value) ? value : etsyPersonalisationLine(value)} photoLabel={t("Photo attached")} />
                        </span>
                        {!upload && text.trim() ? (
                          <button
                            type="button"
                            className="etsy-copy-button"
                            aria-label={t("Copy personalisation")}
                            onClick={() => { void copyText(text).then((ok) => { if (ok) setCopiedKey(key); }); }}
                          >
                            {copiedKey === key ? t("Copied") : t("Copy")}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {link ? (
                    <a className="etsy-source-panel__listing" href={link} target="_blank" rel="noopener noreferrer">{t("View listing on Etsy")} ↗</a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="etsy-source-panel__side">
          {source.buyerNote ? (
            <p className="etsy-source-panel__note is-buyer-note"><span>{t("Buyer note")}</span><span dir="auto">{source.buyerNote}</span></p>
          ) : null}
          {source.giftMessage ? (
            <p className="etsy-source-panel__note is-gift-message"><span>{t("Gift message")}</span><span dir="auto">{source.giftMessage}</span></p>
          ) : null}
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
          {showMoney ? <p className="etsy-source-panel__money-title">{t("Totals from Etsy")}</p> : null}
          {showMoney ? (
            <dl className="etsy-source-panel__money">
              <div><dt>{t("Subtotal")}</dt><dd>{money(source.subtotal, currency)}</dd></div>
              {source.discount ? <div><dt>{t("Discount")}</dt><dd>−{money(source.discount, currency)}</dd></div> : null}
              <div><dt>{t("Shipping")}</dt><dd>{money(source.shipping, currency)}</dd></div>
              {taxMode === "added" ? <div data-etsy-tax="added"><dt>{t("Tax")}</dt><dd>{money(source.tax, currency)}</dd></div> : null}
              <div className="is-total"><dt>{t("Total")}</dt><dd>{money(source.grandTotal, currency)}</dd></div>
              {taxMode === "included" ? <div className="is-note" data-etsy-tax="included"><dt>{t("VAT included")}</dt><dd>{money(source.tax, currency)}</dd></div> : null}
              {taxMode === "unclaimed" ? <div className="is-note" data-etsy-tax="unclaimed"><dt>{t("Tax reported by Etsy")}</dt><dd>{money(source.tax, currency)}</dd></div> : null}
            </dl>
          ) : null}
        </div>
      </div>
      <div className="etsy-source-panel__footer">
        {photos?.reason === "not_connected" || photos?.reason === "quota" || photos?.reason === "unavailable" ? (
          <p className="etsy-source-panel__foot">{t("Product photos open on Etsy.")}</p>
        ) : null}
        <p className="etsy-source-panel__foot">
          {t("Read-only: this is Etsy's copy of the order. Your own changes go in the cards below.")}
          {fetched ? ` · ${t("Last updated from Etsy")} ${new Date(fetched).toLocaleString()}` : ""}
        </p>
        <p className="etsy-source-panel__foot">{t("Photos come live from Etsy and are refreshed at least every 6 hours; they are not saved in NivaDesk.")}</p>
        {/* Etsy API Terms: the required trademark notice, verbatim and never translated. */}
        <p className="etsy-source-panel__foot" data-etsy-trademark="" lang="en" dir="ltr">
          {"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."}
        </p>
      </div>
      {lightboxItem ? (
        <EtsyPhotoLightbox
          line={{ title: lineTitle(lightboxItem), photo: photoFor(lightboxItem), link: linkFor(lightboxItem) }}
          language={language}
          onClose={closeLightbox}
        />
      ) : null}
    </section>
  );
}

export default EtsySourcePanel;
