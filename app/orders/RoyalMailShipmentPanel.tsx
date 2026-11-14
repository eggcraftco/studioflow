"use client";

// Royal Mail Click & Drop on an order's Shipping & Tracking card: send the order to the
// business's own Click & Drop account, then follow it until the parcel has gone.
//
// It shows only when the server says Royal Mail is open for this workspace
// (getRoyalMailConnection); otherwise the card is exactly what it was. Every list comes through
// the Royal Mail callables, already filtered by what this member may see (prices are money).
//
// One press sends one order: a second press returns the first, and an order Click & Drop already
// holds (its own Etsy/eBay import) is linked, not created again. A pay-as-you-go account pays for
// and prints the label in Click & Drop; a business account gets the label here. Either way the
// tracking number comes back to the order's own field, and Dispatched follows Royal Mail.
//
// Abroad (14 Nov 2026): the server reads the order's country and says, with the services, what the
// form must ask — a customs declaration line by line, the seller's product code for goods sold to
// the EU, the sender's own contact for the USA. Royal Mail prints the customs form from it.
//
// The tracking number comes back by itself: the panel asks Royal Mail on its own when it opens,
// when the tab is looked at again (the label is paid for in Click & Drop, in another tab), and
// every half minute for ten minutes after sending (lib/studioflow/royalMail.ts
// ROYAL_MAIL_AUTO_CHECK). A number that has just arrived is handed to the order screen, which
// starts live tracking for it exactly as it does for a number a person types.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { DHL_COUNTRIES, dhlCountryName } from "@/lib/studioflow/dhlCountries";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { openShipmentPdf } from "@/lib/studioflow/shipping";
import {
  CLICK_AND_DROP_URL,
  ROYAL_MAIL_AUTO_CHECK,
  ROYAL_MAIL_CUSTOMS_CATEGORIES,
  ROYAL_MAIL_PACKAGE_FORMATS,
  cancelRoyalMailShipment,
  customsItemsFromDrafts,
  customsTotals,
  emptyCustomsLine,
  getRoyalMailConnection,
  listOrderRoyalMailShipments,
  listRoyalMailServices,
  openRoyalMailLabel,
  refreshOrderRoyalMail,
  royalMailArrivedNumbers,
  royalMailAutoCheckDue,
  royalMailAwaitingNumber,
  royalMailErrorMessage,
  royalMailErrorReason,
  royalMailPrice,
  royalMailProblemMessages,
  royalMailSaleCategory,
  royalMailShipmentWaiting,
  royalMailShipmentsChanged,
  sendOrderToRoyalMail,
  senderContactFrom,
  type RoyalMailConnectionView,
  type RoyalMailCustomsCategory,
  type RoyalMailCustomsLineDraft,
  type RoyalMailDestination,
  type RoyalMailPackageFormat,
  type RoyalMailService,
  type RoyalMailShipment
} from "@/lib/studioflow/royalMail";

const OPEN = new Set(["sending", "sent", "label", "unknown", "dispatched"]);

function stateChip(s: RoyalMailShipment): { label: string; tone: "draft" | "busy" | "good" | "done" | "warn" | "bad" } {
  if (s.state === "dispatched") return { label: "Dispatched", tone: "done" };
  if (s.state === "label") return { label: "Label printed", tone: "good" };
  if (s.state === "sent") return { label: "In Click & Drop", tone: "busy" };
  if (s.state === "sending") return { label: "Sending to Royal Mail…", tone: "busy" };
  if (s.state === "unknown") return { label: "Needs a check", tone: "warn" };
  if (s.state === "cancelled") return { label: "Cancelled", tone: "draft" };
  if (s.state === "rejected") return { label: "Refused by Royal Mail", tone: "bad" };
  return { label: "Not sent", tone: "warn" };
}

export function RoyalMailShipmentPanel({
  workspace,
  orderId,
  language,
  onOrderChanged,
  onSizeChange,
  addressRestricted = false,
  orderDescription = "",
  onTrackingNumber
}: {
  workspace: WorkspaceContext;
  orderId: string;
  language: string;
  /** The order's own fields may have changed (tracking number, courier, Dispatched). */
  onOrderChanged?: () => Promise<void> | void;
  /** The panel grew or shrank on its own (shipments loaded, the form opened). */
  onSizeChange?: () => void;
  /** What the order is, to start the first customs line from (the person checks it). */
  orderDescription?: string;
  /** Royal Mail's tracking number has just arrived for this order (after onOrderChanged has run). */
  onTrackingNumber?: (trackingNumber: string) => Promise<void> | void;
  /** The delivery address is not on this order (an eBay buyer's protected address). */
  addressRestricted?: boolean;
}) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const locale = studioLocaleTag(language);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [connection, setConnection] = useState<RoyalMailConnectionView | null>(null);
  const [shipments, setShipments] = useState<RoyalMailShipment[] | null>(null);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [packageFormat, setPackageFormat] = useState<RoyalMailPackageFormat>("smallParcel");
  const [weight, setWeight] = useState("");
  const [services, setServices] = useState<RoyalMailService[] | null>(null);
  const [serviceCode, setServiceCode] = useState("");
  const [signature, setSignature] = useState(false);
  const [safePlace, setSafePlace] = useState("");
  const [notifyRecipient, setNotifyRecipient] = useState(true);
  // Abroad: what the server said the form must ask, and what the person has typed.
  const [destination, setDestination] = useState<RoyalMailDestination | null>(null);
  const [customsCategory, setCustomsCategory] = useState<RoyalMailCustomsCategory | "">("");
  const [customsLines, setCustomsLines] = useState<RoyalMailCustomsLineDraft[]>([]);
  const [iossNumber, setIossNumber] = useState("");
  const [senderContact, setSenderContact] = useState("");
  // The quiet check (see the head of this file).
  const shipmentsRef = useRef<RoyalMailShipment[]>([]);
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);
  const pollUntilRef = useRef(0);
  const orderChangedRef = useRef(onOrderChanged);
  orderChangedRef.current = onOrderChanged;
  const trackingNumberRef = useRef(onTrackingNumber);
  trackingNumberRef.current = onTrackingNumber;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizeChangeRef = useRef(onSizeChange);
  sizeChangeRef.current = onSizeChange;

  useEffect(() => {
    let active = true;
    setConnection(null);
    if (!companyId) return () => { active = false; };
    // A refusal or a network failure reads as "off": the card stays as it was.
    getRoyalMailConnection(companyId)
      .then(view => { if (active) setConnection(view); })
      .catch(() => { if (active) setConnection({ carrier: "royal_mail", enabled: false, connected: false }); });
    return () => { active = false; };
  }, [companyId]);

  /** New shipments on the screen; the order is reloaded, and a number that has just arrived is handed on. */
  const adopt = useCallback(async (next: RoyalMailShipment[], { tellOrder, firstRead = false }: { tellOrder: boolean; firstRead?: boolean }) => {
    const before = shipmentsRef.current;
    shipmentsRef.current = next;
    setShipments(next);
    if (tellOrder) await orderChangedRef.current?.();
    // On the first read every number counts as "arrived": the server's own sweep may have written it
    // to the order while nobody had the order open, and then nothing has started live tracking yet.
    if (tellOrder || firstRead) {
      for (const number of royalMailArrivedNumbers(firstRead ? [] : before, next.filter(s => s.state !== "cancelled"))) await trackingNumberRef.current?.(number);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!companyId || !orderId) return;
    try {
      await adopt(await listOrderRoyalMailShipments(companyId, orderId), { tellOrder: false, firstRead: true });
    } catch (failure) {
      setError(royalMailErrorMessage(failure, t));
    }
  }, [companyId, orderId, t, adopt]);

  useEffect(() => { if (connection?.enabled) void reload(); }, [connection, reload]);

  // The quiet check: no notice, no error (the next one, or Check now, says what is wrong).
  const quietCheck = useCallback(async () => {
    if (!companyId || !orderId || checkingRef.current) return;
    const visible = typeof document === "undefined" || document.visibilityState === "visible";
    if (!royalMailAutoCheckDue(Date.now(), lastCheckRef.current, shipmentsRef.current.some(royalMailShipmentWaiting), visible)) return;
    checkingRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const before = shipmentsRef.current;
      const result = await refreshOrderRoyalMail(companyId, orderId);
      const changed = royalMailShipmentsChanged(before, result.shipments);
      // What was said after sending ("pay for and print the label there…") is no longer the news.
      if (changed) setNotice("");
      await adopt(result.shipments, { tellOrder: changed });
    } catch {
      // Royal Mail unreachable, or the key refused: said when a person presses Check now.
    } finally {
      checkingRef.current = false;
    }
  }, [companyId, orderId, adopt]);

  const connectedNow = Boolean(connection?.enabled && connection.connected);
  const loaded = shipments !== null;
  useEffect(() => {
    if (!connectedNow || !loaded) return;
    // Once when the card opens with something waiting, then whenever the tab is looked at again.
    pollUntilRef.current = Math.max(pollUntilRef.current, Date.now() + ROYAL_MAIL_AUTO_CHECK.pollForMs);
    void quietCheck();
    const onLook = () => { if (document.visibilityState === "visible") void quietCheck(); };
    window.addEventListener("focus", onLook);
    document.addEventListener("visibilitychange", onLook);
    // Every half minute, for ten minutes, while a tracking number is still to come.
    const timer = window.setInterval(() => {
      if (Date.now() > pollUntilRef.current) return;
      if (shipmentsRef.current.some(royalMailAwaitingNumber)) void quietCheck();
    }, ROYAL_MAIL_AUTO_CHECK.pollEveryMs);
    return () => {
      window.removeEventListener("focus", onLook);
      document.removeEventListener("visibilitychange", onLook);
      window.clearInterval(timer);
    };
  }, [connectedNow, loaded, quietCheck]);
  const keepChecking = () => { pollUntilRef.current = Date.now() + ROYAL_MAIL_AUTO_CHECK.pollForMs; };

  const shown = Boolean(connection?.enabled);
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => sizeChangeRef.current?.());
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, formOpen]);

  async function guard(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    setProblems([]);
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError(royalMailErrorMessage(failure, t));
      const reason = royalMailErrorReason(failure);
      if (reason === "recipient_incomplete" || reason === "royal_mail_rejected" || reason === "choice_invalid" || reason === "customs_incomplete") setProblems(royalMailProblemMessages(failure, t));
    } finally {
      setBusy("");
    }
  }

  if (!connection || !connection.enabled) return null;
  const connected = connection.connected;
  const list = shipments ?? [];
  const active = list.find(s => OPEN.has(s.state)) || null;
  const weightGrams = Math.round(Number(weight));
  const chosen = (services ?? []).find(s => s.serviceCode === serviceCode) || null;

  const when = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  };

  async function loadServices() {
    await guard("services", async () => {
      const result = await listRoyalMailServices(companyId, orderId, packageFormat, weightGrams);
      setServices(result.services);
      setServiceCode(result.services[0]?.serviceCode ?? "");
      const next = result.destination ?? null;
      setDestination(next);
      if (next?.needsCustoms) {
        // What the person already typed is kept; the first line starts from the order's own name.
        setCustomsLines(lines => (lines.length ? lines : [emptyCustomsLine(orderDescription.trim().slice(0, 255))]));
        setCustomsCategory(category => category || "eCommerceSaleOfGoods");
        if (next.needsSenderContact) setSenderContact(typed => typed || next.senderContact.phone || next.senderContact.email);
      }
      if (!result.services.length) setNotice(t("Royal Mail offers no service for this package and weight. Check the size and weight."));
    });
  }

  async function send() {
    if (!chosen) return;
    await guard("send", async () => {
      const result = await sendOrderToRoyalMail(companyId, orderId, {
        packageFormat, weightGrams, serviceCode: chosen.serviceCode, serviceName: chosen.serviceName, signature, safePlace: safePlace.trim(), notifyRecipient,
        ...(destination?.needsCustoms ? { customs: { category: customsCategory, items: customsItemsFromDrafts(customsLines), ...(destination.eu && iossNumber.trim() ? { iossNumber: iossNumber.trim() } : {}) } } : {}),
        ...(destination?.needsSenderContact ? { senderContact: senderContactFrom(senderContact) } : {})
      });
      setFormOpen(false);
      keepChecking();
      setNotice(result.outcome === "linked"
        ? t("This order was already in Click & Drop. NivaDesk linked it instead of sending it again.")
        : result.outcome === "existing"
          ? t("This order is already in Click & Drop.")
          : result.outcome === "unknown"
            ? t("Royal Mail did not answer. NivaDesk will look for the order in Click & Drop; press Check now in a minute.")
            : result.shipment.hasLabel
              ? t("Sent to Royal Mail. The label is ready.")
              : t("Sent to Click & Drop. Pay for and print the label there; the tracking number comes back here."));
      // A business account's label, and its tracking number, are there already.
      await adopt(await listOrderRoyalMailShipments(companyId, orderId), { tellOrder: true });
    });
  }

  async function checkNow() {
    await guard("check", async () => {
      lastCheckRef.current = Date.now();
      const result = await refreshOrderRoyalMail(companyId, orderId);
      await adopt(result.shipments, { tellOrder: true });
      setNotice(t("Checked with Royal Mail."));
    });
  }

  async function cancel(shipment: RoyalMailShipment) {
    await guard(`cancel:${shipment.id}`, async () => {
      await cancelRoyalMailShipment(companyId, orderId, shipment.id);
      setNotice(t("Removed from Click & Drop."));
      await reload();
    });
  }

  async function openLabel(shipment: RoyalMailShipment) {
    const target = window.open("", "_blank");
    if (target) target.opener = null;
    await guard(`label:${shipment.id}`, async () => {
      try {
        openShipmentPdf(await openRoyalMailLabel(companyId, orderId, shipment.id), target);
      } catch (failure) {
        target?.close();
        throw failure;
      }
    });
  }

  const notConnectedNote = connected ? null : (
    <p className="shipment-note">
      {isOwner
        ? <>{t("Royal Mail is not connected.")} <a className="inventory-link" href="/settings?section=royalmail">{t("Connect it in Settings ▸ Integrations.")}</a></>
        : t("Royal Mail is not connected yet. The workspace owner connects it in Settings ▸ Integrations.")}
    </p>
  );

  const needsCustoms = Boolean(destination?.needsCustoms);
  const askProductCodes = Boolean(destination?.needsProductCodes) && royalMailSaleCategory(customsCategory);
  const totals = customsTotals(customsLines);
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "GBP" }).format(n);
  const setLine = (index: number, patch: Partial<RoyalMailCustomsLineDraft>) => setCustomsLines(lines => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  // ISO countries only: DHL's own codes (XB, XC, …, KV, IC) are not countries Royal Mail knows.
  const originCountries = DHL_COUNTRIES.filter(([code]) => !/^X/.test(code) && code !== "KV" && code !== "IC")
    .map(([code]) => ({ code, name: dhlCountryName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const destinationName = destination?.countryCode ? dhlCountryName(destination.countryCode, locale) : "";

  const customsForm = needsCustoms ? (
    <fieldset className="shipment-services" data-testid="royal-mail-customs">
      <legend className="shipment-subhead">{t("Customs declaration")}{destinationName ? ` · ${destinationName}` : ""}</legend>
      <p className="shipment-muted">{t("This parcel leaves the UK. Royal Mail prints the customs form (CN22 or CN23) from what you declare here, so write what is really inside.")}</p>
      <label className="inventory-field"><span>{t("What the parcel contains")}</span>
        <select className="input" value={customsCategory} onChange={e => setCustomsCategory(e.target.value as RoyalMailCustomsCategory)} data-testid="royal-mail-customs-category">
          {ROYAL_MAIL_CUSTOMS_CATEGORIES.map(c => <option key={c.id} value={c.id}>{t(c.label)}</option>)}
        </select></label>
      {customsLines.map((line, index) => (
        <div key={index} className="inventory-form" data-testid="royal-mail-customs-line">
          <label className="inventory-field"><span>{t("Customs line {n}:").replace("{n}", String(index + 1))} {t("Description")}</span>
            <input className="input" value={line.description} maxLength={255} onChange={e => setLine(index, { description: e.target.value })} placeholder={t("e.g. Hand-painted watch dial")} /></label>
          <label className="inventory-field"><span>{t("Quantity")}</span>
            <input className="input" inputMode="numeric" value={line.quantity} onChange={e => setLine(index, { quantity: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="inventory-field"><span>{t("Value of one item (£)")}</span>
            <input className="input" inputMode="decimal" value={line.unitValue} onChange={e => setLine(index, { unitValue: e.target.value.replace(/[^\d.,]/g, "") })} /></label>
          <label className="inventory-field"><span>{t("Weight of one item (g)")}</span>
            <input className="input" inputMode="numeric" value={line.unitWeightGrams} onChange={e => setLine(index, { unitWeightGrams: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="inventory-field"><span>{t("Customs (HS) code")}</span>
            <input className="input" inputMode="numeric" value={line.hsCode} maxLength={13} onChange={e => setLine(index, { hsCode: e.target.value.replace(/[^\d. ]/g, "") })} placeholder="911430" /></label>
          <label className="inventory-field"><span>{t("Made in")}</span>
            <select className="input" value={line.manufacturerCountry} onChange={e => setLine(index, { manufacturerCountry: e.target.value })}>
              <option value="">{t("Choose a country")}</option>
              {originCountries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select></label>
          {askProductCodes ? (
            <label className="inventory-field"><span>{t("Your product code (SKU)")}</span>
              <input className="input" value={line.merchantProductId} maxLength={50} onChange={e => setLine(index, { merchantProductId: e.target.value })} /></label>
          ) : null}
          {customsLines.length > 1 ? (
            <div className="shipment-actions">
              <button type="button" className="inventory-link inventory-link-danger" onClick={() => setCustomsLines(lines => lines.filter((_, i) => i !== index))}>{t("Remove this item")}</button>
            </div>
          ) : null}
        </div>
      ))}
      <div className="shipment-actions">
        <button type="button" className="button secondary" disabled={customsLines.length >= 20} onClick={() => setCustomsLines(lines => [...lines, emptyCustomsLine()])} data-testid="royal-mail-customs-add">{t("+ Add another item")}</button>
        <a className="inventory-link" href="https://www.trade-tariff.service.gov.uk/find_commodity" target="_blank" rel="noopener noreferrer">{t("Find a commodity code on the UK Trade Tariff")} ↗</a>
      </div>
      <p className={weightGrams > 0 && totals.grams > weightGrams ? "shipment-error" : "shipment-muted"} data-testid="royal-mail-customs-totals">
        {t("Declared value")} {money(totals.value)} · {t("Items weigh {items} g of the parcel's {parcel} g").replace("{items}", String(totals.grams)).replace("{parcel}", String(weightGrams > 0 ? weightGrams : 0))}
      </p>
      {askProductCodes ? <p className="shipment-muted">{t("The EU asks for the seller's product code on goods that were sold. Royal Mail also saves it as a product in your Click & Drop account.")} {t("You can leave it empty: NivaDesk then sends the shop's own code for this order, or the order's number (for example NVD-31-1).")}</p> : null}
      {destination?.eu ? (
        <label className="inventory-field"><span>{t("IOSS number (optional)")}</span>
          <input className="input" value={iossNumber} maxLength={14} onChange={e => setIossNumber(e.target.value)} placeholder="IM1234567890" />
          <small className="shipment-muted">{t("Only if you charged the customer EU VAT through IOSS. Leave it empty otherwise: the recipient pays any VAT and duty on delivery.")}</small></label>
      ) : null}
      {destination?.needsSenderContact ? (
        <label className="inventory-field"><span>{t("Your phone number or e-mail")}</span>
          <input className="input" value={senderContact} maxLength={254} onChange={e => setSenderContact(e.target.value)} />
          <small className="shipment-muted">{t("Royal Mail asks for the sender's own contact on parcels to the USA. NivaDesk remembers it for the next one.")}</small></label>
      ) : null}
    </fieldset>
  ) : null;

  // What happened, said where the person is looking: beside the form's own buttons while the form is
  // open (the customs form is long, and a sentence at the top of the card would be off the screen).
  const messages = (
    <>
      {notice ? <p className="shipment-note" role="status">{notice}</p> : null}
      {error ? <p className="shipment-error" role="alert">{error}</p> : null}
      {problems.length ? <ul className="shipment-list" data-testid="royal-mail-problems">{problems.map((p, i) => <li key={i} className="shipment-error">{p}</li>)}</ul> : null}
    </>
  );

  const form = (
    <div className="shipment-settings-form" data-testid="royal-mail-form">
      <div className="inventory-form">
        <label className="inventory-field"><span>{t("Package")}</span>
          <select className="input" value={packageFormat} onChange={e => { setPackageFormat(e.target.value as RoyalMailPackageFormat); setServices(null); }}>
            {ROYAL_MAIL_PACKAGE_FORMATS.map(f => <option key={f.id} value={f.id}>{t(f.label)} — {t(f.hint)}</option>)}
          </select></label>
        <label className="inventory-field"><span>{t("Weight (g)")}</span>
          <input className="input" inputMode="numeric" value={weight} onChange={e => { setWeight(e.target.value.replace(/\D/g, "")); setServices(null); }} placeholder="450" /></label>
      </div>
      <div className="shipment-actions">
        <button type="button" className="button secondary" disabled={busy === "services" || !(weightGrams > 0)} onClick={() => void loadServices()} data-testid="royal-mail-services">
          {busy === "services" ? t("Asking Royal Mail…") : t("Show services")}
        </button>
      </div>
      {services && services.length > 0 ? (
        <fieldset className="shipment-services">
          <legend className="shipment-subhead">{t("Service")}</legend>
          {services.map(s => (
            <label key={s.serviceCode} className="inventory-check">
              <input type="radio" name={`rm-service-${orderId}`} checked={serviceCode === s.serviceCode} onChange={() => setServiceCode(s.serviceCode)} />
              <span>{s.serviceName}{s.cost != null ? <strong> · {royalMailPrice(s, locale, t)}</strong> : null}</span>
            </label>
          ))}
          {connection.accountType === "olp" && services.some(s => s.cost != null) ? <p className="shipment-muted">{t("Royal Mail's online price, as Click & Drop will charge it.")}</p> : null}
        </fieldset>
      ) : null}
      {services && services.length > 0 ? customsForm : null}
      {services && services.length > 0 ? (
        <>
          <label className="inventory-check"><input type="checkbox" checked={signature} onChange={e => setSignature(e.target.checked)} /> {t("Signature on delivery")}</label>
          {/* Abroad Royal Mail's services have no e-mail or text notification (it refuses an order that asks for one),
              so the choice is offered for UK parcels only; the server never asks for it abroad. */}
          {destination?.international
            ? <p className="shipment-muted" data-testid="royal-mail-no-notification">{t("Royal Mail has no delivery notification for parcels abroad, so it does not tell the customer.")}</p>
            : <label className="inventory-check"><input type="checkbox" checked={notifyRecipient} onChange={e => setNotifyRecipient(e.target.checked)} /> {t("Royal Mail tells the customer about the delivery")}</label>}
          <label className="inventory-field"><span>{t("Safe place (optional)")}</span>
            <input className="input" value={safePlace} onChange={e => setSafePlace(e.target.value)} maxLength={90} placeholder={t("e.g. Porch")} /></label>
          <div className="shipment-actions">
            <button type="button" className="button" disabled={busy === "send" || !chosen} onClick={() => void send()} data-testid="royal-mail-send">
              {busy === "send" ? t("Sending to Royal Mail…") : t("Send to Click & Drop")}
            </button>
            <button type="button" className="button secondary" onClick={() => { setFormOpen(false); setServices(null); setDestination(null); }}>{t("Cancel")}</button>
          </div>
        </>
      ) : null}
      {messages}
    </div>
  );

  return (
    <div className="shipment-panel royal-mail-panel" ref={rootRef} data-testid="royal-mail-panel">
      <div className="app-card-divider" />
      <div className="shipment-panel-head"><strong>Royal Mail</strong></div>
      {notConnectedNote}
      {formOpen ? null : messages}

      {list.length > 0 ? (
        <ul className="shipment-list">
          {list.map(s => {
            const chip = stateChip(s);
            return (
              <li key={s.id} className="shipment-row">
                <div className="shipment-row-head">
                  <span className="shipment-row-title"><strong>{s.serviceName || t("Royal Mail")}</strong> <code>{s.reference}</code></span>
                  <span className="shipment-chip" data-tone={chip.tone}>{t(chip.label)}</span>
                </div>
                {s.trackingNumber ? (
                  <div className="shipment-facts">
                    <span>{t("Tracking number")} <strong className="shipment-mono">{s.trackingNumber}</strong></span>
                    {s.trackingUrl ? <a className="inventory-link" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">{t("Track on Royal Mail")} ↗</a> : null}
                    {s.shippedOn ? <span>{t("Dispatched")} · {when(s.shippedOn)}</span> : null}
                  </div>
                ) : null}
                {s.cost != null && s.cost !== undefined ? <p className="shipment-muted">{royalMailPrice(s as { cost: number | null; vatCost: number | null }, locale, t)}</p> : null}
                {s.state === "label" && !s.trackingNumber ? <p className="shipment-muted">{t("No tracking number from Royal Mail yet. NivaDesk keeps checking; an untracked service (International Standard or Economy) never gets one.")}</p> : null}
                {s.international ? <p className="shipment-muted">{t("Sent abroad with its customs declaration. Royal Mail prints the customs form with the label.")}</p> : null}
                {s.notificationsDropped ? <p className="shipment-muted">{t("Royal Mail has no delivery notification for this service, so it does not tell the customer.")}</p> : null}
                {s.linked ? <p className="shipment-muted">{t("Linked to an order Click & Drop already had.")}</p> : null}
                {s.contactWithheld ? <p className="shipment-muted">{t("An Etsy order: the buyer's e-mail and phone were not given to Royal Mail, so Royal Mail does not notify them.")}</p> : null}
                {connected ? (
                  <div className="shipment-actions">
                    {s.state === "sent" && s.accountType === "olp" ? (
                      <a className="button" href={CLICK_AND_DROP_URL} target="_blank" rel="noopener noreferrer" onClick={keepChecking}>{t("Pay and print in Click & Drop")} ↗</a>
                    ) : null}
                    {s.hasLabel ? <button type="button" className="button" disabled={busy === `label:${s.id}`} onClick={() => void openLabel(s)}>{t("Open label")}</button> : null}
                    {OPEN.has(s.state) && s.state !== "dispatched" ? (
                      <button type="button" className="button secondary" disabled={busy === "check"} onClick={() => void checkNow()}>{busy === "check" ? t("Checking…") : t("Check now")}</button>
                    ) : null}
                    {(s.state === "sent" || s.state === "unknown") && !s.trackingNumber ? (
                      <button type="button" className="inventory-link inventory-link-danger" disabled={busy === `cancel:${s.id}`} onClick={() => void cancel(s)}>{t("Remove from Click & Drop")}</button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {connected && !active ? (
        addressRestricted ? (
          <p className="shipment-note">{t("This order's delivery address is kept by eBay, so send it from Click & Drop's own eBay connection.")}</p>
        ) : formOpen ? form : (
          <div className="shipment-actions">
            <button type="button" className="button secondary" onClick={() => setFormOpen(true)} data-testid="royal-mail-open-form">{t("+ Send with Royal Mail")}</button>
          </div>
        )
      ) : null}
    </div>
  );
}
