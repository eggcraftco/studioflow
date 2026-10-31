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

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { openShipmentPdf } from "@/lib/studioflow/shipping";
import {
  CLICK_AND_DROP_URL,
  ROYAL_MAIL_PACKAGE_FORMATS,
  cancelRoyalMailShipment,
  getRoyalMailConnection,
  listOrderRoyalMailShipments,
  listRoyalMailServices,
  openRoyalMailLabel,
  refreshOrderRoyalMail,
  royalMailErrorMessage,
  royalMailErrorReason,
  royalMailPrice,
  royalMailProblemMessages,
  sendOrderToRoyalMail,
  type RoyalMailConnectionView,
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
  abroad = false
}: {
  workspace: WorkspaceContext;
  orderId: string;
  language: string;
  /** The order's own fields may have changed (tracking number, courier, Dispatched). */
  onOrderChanged?: () => Promise<void> | void;
  /** The panel grew or shrank on its own (shipments loaded, the form opened). */
  onSizeChange?: () => void;
  /** The delivery address is outside the UK: phase 1 sends UK parcels only (royalMailUkAddress). */
  abroad?: boolean;
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

  const reload = useCallback(async () => {
    if (!companyId || !orderId) return;
    try {
      setShipments(await listOrderRoyalMailShipments(companyId, orderId));
    } catch (failure) {
      setError(royalMailErrorMessage(failure, t));
    }
  }, [companyId, orderId, t]);

  useEffect(() => { if (connection?.enabled) void reload(); }, [connection, reload]);

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
      if (reason === "recipient_incomplete" || reason === "royal_mail_rejected" || reason === "choice_invalid") setProblems(royalMailProblemMessages(failure, t));
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
      if (!result.services.length) setNotice(t("Royal Mail offers no service for this package and weight. Check the size and weight."));
    });
  }

  async function send() {
    if (!chosen) return;
    await guard("send", async () => {
      const result = await sendOrderToRoyalMail(companyId, orderId, {
        packageFormat, weightGrams, serviceCode: chosen.serviceCode, serviceName: chosen.serviceName, signature, safePlace: safePlace.trim(), notifyRecipient
      });
      setFormOpen(false);
      setNotice(result.outcome === "linked"
        ? t("This order was already in Click & Drop. NivaDesk linked it instead of sending it again.")
        : result.outcome === "existing"
          ? t("This order is already in Click & Drop.")
          : result.outcome === "unknown"
            ? t("Royal Mail did not answer. NivaDesk will look for the order in Click & Drop; press Check now in a minute.")
            : result.shipment.hasLabel
              ? t("Sent to Royal Mail. The label is ready.")
              : t("Sent to Click & Drop. Pay for and print the label there; the tracking number comes back here."));
      await reload();
      await onOrderChanged?.();
    });
  }

  async function checkNow() {
    await guard("check", async () => {
      const result = await refreshOrderRoyalMail(companyId, orderId);
      setShipments(result.shipments);
      setNotice(t("Checked with Royal Mail."));
      await onOrderChanged?.();
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
      {services && services.length > 0 ? (
        <>
          <label className="inventory-check"><input type="checkbox" checked={signature} onChange={e => setSignature(e.target.checked)} /> {t("Signature on delivery")}</label>
          <label className="inventory-check"><input type="checkbox" checked={notifyRecipient} onChange={e => setNotifyRecipient(e.target.checked)} /> {t("Royal Mail tells the customer about the delivery")}</label>
          <label className="inventory-field"><span>{t("Safe place (optional)")}</span>
            <input className="input" value={safePlace} onChange={e => setSafePlace(e.target.value)} maxLength={90} placeholder={t("e.g. Porch")} /></label>
          <div className="shipment-actions">
            <button type="button" className="button" disabled={busy === "send" || !chosen} onClick={() => void send()} data-testid="royal-mail-send">
              {busy === "send" ? t("Sending to Royal Mail…") : t("Send to Click & Drop")}
            </button>
            <button type="button" className="button secondary" onClick={() => { setFormOpen(false); setServices(null); }}>{t("Cancel")}</button>
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="shipment-panel royal-mail-panel" ref={rootRef} data-testid="royal-mail-panel">
      <div className="app-card-divider" />
      <div className="shipment-panel-head"><strong>Royal Mail</strong></div>
      {notConnectedNote}
      {notice ? <p className="shipment-note" role="status">{notice}</p> : null}
      {error ? <p className="shipment-error">{error}</p> : null}
      {problems.length ? <ul className="shipment-list">{problems.map((p, i) => <li key={i} className="shipment-error">{p}</li>)}</ul> : null}

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
                {s.linked ? <p className="shipment-muted">{t("Linked to an order Click & Drop already had.")}</p> : null}
                {s.contactWithheld ? <p className="shipment-muted">{t("An Etsy order: the buyer's e-mail and phone were not given to Royal Mail, so Royal Mail does not notify them.")}</p> : null}
                {connected ? (
                  <div className="shipment-actions">
                    {s.state === "sent" && s.accountType === "olp" ? (
                      <a className="button" href={CLICK_AND_DROP_URL} target="_blank" rel="noopener noreferrer">{t("Pay and print in Click & Drop")} ↗</a>
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
        ) : abroad ? (
          <p className="shipment-note">{t("Royal Mail from NivaDesk sends within the UK for now. Send this one from Click & Drop.")}</p>
        ) : formOpen ? form : (
          <div className="shipment-actions">
            <button type="button" className="button secondary" onClick={() => setFormOpen(true)} data-testid="royal-mail-open-form">{t("+ Send with Royal Mail")}</button>
          </div>
        )
      ) : null}
    </div>
  );
}
