"use client";

// Preparing one DHL Express shipment of an order: who it goes to, the parcels,
// what is inside and who pays the duties, the DHL service, then the label.
//
// The rules the screen follows are the server's (functions/shipping/draft.js);
// the screen only makes them visible:
// - Transport is paid by the workspace's DHL account; destination duties have no
//   default. The person chooses receiver (DAP) or sender (DDP), and the sender
//   option is an owner's or admin's.
// - The order's total is never the customs value. Every line, value, HS code and
//   origin is typed here, and the declaration is confirmed as a whole. Any change
//   afterwards needs a new confirmation (the server compares a fingerprint).
// - Values are shown and sent only to members who may declare goods (finance
//   access). Others see why the section is closed.
// - The label is requested once per click. A lost answer is "unknown" and is
//   searched for by reference on the order; this dialog never sends twice.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { DHL_COUNTRIES, dhlCountryName } from "@/lib/studioflow/dhlCountries";
import {
  EXPORT_REASONS,
  QUANTITY_UNITS,
  checkShipmentDutiesPaid,
  confirmOrderShipmentCustoms,
  createOrderShipment,
  listShipmentProducts,
  saveOrderShipmentDraft,
  shipmentIssueMessage,
  shippingErrorMessage,
  type CustomsItem,
  type OrderShipment,
  type ShipmentDraftPatch,
  type ShipmentIssue,
  type ShipmentProductsResult,
  type ShippingAbilities,
  type ShippingConnectionView
} from "@/lib/studioflow/shipping";

type PieceInput = { weight: string; length: string; width: string; height: string };
type ItemInput = {
  description: string; quantity: string; quantityUnit: string; unitValue: string;
  hsCode: string; manufacturerCountry: string; netWeight: string; grossWeight: string;
};

const DHL_INCOTERMS = ["DAP", "DDP", "EXW", "FCA", "CPT", "CIP", "DPU", "FAS", "FOB", "CFR", "CIF"];
const IMPLIED_INCOTERM: Record<string, string> = { receiver: "DAP", sender: "DDP" };

const asInput = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? "" : String(value));
const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
const emptyItem = (): ItemInput => ({ description: "", quantity: "1", quantityUnit: "PCS", unitValue: "", hsCode: "", manufacturerCountry: "", netWeight: "", grossWeight: "" });

export function ShipmentDraftDialog({
  companyId,
  orderId,
  orderReference,
  shipment,
  can,
  connection,
  language,
  onClose,
  onCreated
}: {
  companyId: string;
  orderId: string;
  orderReference: string;
  shipment: OrderShipment;
  can: ShippingAbilities;
  connection: ShippingConnectionView;
  language: string;
  onClose: () => void | Promise<void>;
  onCreated: (message: string) => void | Promise<void>;
}) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const locale = studioLocaleTag(language);
  const draft = shipment.draft ?? { customs: { dutiesPayer: "", incoterm: "", confirmed: false } };
  const customsView = draft.customs;

  const [recipient, setRecipient] = useState(() => ({
    fullName: draft.recipient?.fullName ?? "",
    companyName: draft.recipient?.companyName ?? "",
    phone: draft.recipient?.phone ?? "",
    email: draft.recipient?.email ?? "",
    line1: draft.recipient?.address?.line1 ?? "",
    line2: draft.recipient?.address?.line2 ?? "",
    city: draft.recipient?.address?.city ?? "",
    postalCode: draft.recipient?.address?.postalCode ?? "",
    provinceCode: draft.recipient?.address?.provinceCode ?? "",
    countryCode: draft.recipient?.address?.countryCode ?? ""
  }));
  const [pieces, setPieces] = useState<PieceInput[]>(() => {
    const list = (draft.pieces ?? []).map(p => ({ weight: asInput(p.weight), length: asInput(p.length), width: asInput(p.width), height: asInput(p.height) }));
    return list.length ? list : [{ weight: "", length: "", width: "", height: "" }];
  });
  const [contents, setContents] = useState(draft.contentsDescription ?? "");
  const [plannedDate, setPlannedDate] = useState(draft.planned?.date ?? "");
  const [plannedTime, setPlannedTime] = useState(draft.planned?.time ?? "10:00");
  const [productCode, setProductCode] = useState(draft.service?.productCode ?? "");
  const [declarable, setDeclarable] = useState<boolean | null>(typeof customsView.declarable === "boolean" ? customsView.declarable : null);
  const [dutiesPayer, setDutiesPayer] = useState<"" | "receiver" | "sender">(customsView.dutiesPayer ?? "");
  const [incoterm, setIncoterm] = useState(customsView.incoterm ?? "");
  const [declaredValue, setDeclaredValue] = useState(asInput(customsView.declaredValue ?? null));
  const [currency, setCurrency] = useState(customsView.currency ?? "");
  const [exportReason, setExportReason] = useState(customsView.exportReasonType ?? "");
  const [shipmentType, setShipmentType] = useState<"" | "personal" | "commercial">(customsView.shipmentType ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(customsView.invoice?.number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(customsView.invoice?.date ?? "");
  const [items, setItems] = useState<ItemInput[]>(() => (customsView.items ?? []).map((i: CustomsItem) => ({
    description: i.description ?? "", quantity: asInput(i.quantity), quantityUnit: i.quantityUnit || "PCS", unitValue: asInput(i.unitValue),
    hsCode: i.hsCode ?? "", manufacturerCountry: i.manufacturerCountry ?? "", netWeight: asInput(i.netWeight), grossWeight: asInput(i.grossWeight)
  })));

  const [issues, setIssues] = useState<ShipmentIssue[]>(shipment.issues ?? []);
  const [confirmed, setConfirmed] = useState(Boolean(customsView.confirmed));
  const [customsChanged, setCustomsChanged] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<ShipmentProductsResult | null>(null);
  const [dutiesPaid, setDutiesPaid] = useState<"" | "available" | "unavailable" | "unknown">("");
  const [shipper, setShipper] = useState(draft.shipper ?? {});
  const [confirmClose, setConfirmClose] = useState(false);
  // Once DHL may have the shipment (no answer) or is still making it, this dialog
  // sends nothing more: the order's card carries the search from there.
  const [locked, setLocked] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus moves into the dialog as it opens, so Escape and Tab work from the start.
  useEffect(() => { dialogRef.current?.focus(); }, []);

  // A long form: leaving it with unsaved changes asks first, and only the
  // buttons close it (not a stray click beside it).
  function requestClose() {
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    void onClose();
  }

  const fromCountry = String(shipper.address?.countryCode ?? "").toUpperCase();
  const international = Boolean(fromCountry && recipient.countryCode && fromCountry !== recipient.countryCode.toUpperCase());
  const declaring = international && declarable === true;

  const change = <T,>(setter: (value: T) => void, { customs = false } = {}) => (value: T) => {
    setter(value);
    setDirty(true);
    if (customs) setCustomsChanged(true);
  };

  const countries = useMemo(
    () => DHL_COUNTRIES.map(([code]) => ({ code, name: dhlCountryName(code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale]
  );

  const lineTotalCents = items.reduce((sum, item) => {
    const quantity = asNumber(item.quantity);
    const value = asNumber(item.unitValue);
    return quantity !== null && value !== null ? sum + Math.round(quantity * value * 100) : sum;
  }, 0);
  const declaredCents = asNumber(declaredValue) === null ? null : Math.round((asNumber(declaredValue) as number) * 100);

  function buildPatch(): ShipmentDraftPatch {
    const patch: ShipmentDraftPatch = {
      recipient: {
        fullName: recipient.fullName, companyName: recipient.companyName, phone: recipient.phone, email: recipient.email,
        address: {
          line1: recipient.line1, line2: recipient.line2, city: recipient.city, postalCode: recipient.postalCode,
          provinceCode: recipient.provinceCode, countryCode: recipient.countryCode
        }
      },
      pieces: pieces.map(p => ({ weight: asNumber(p.weight), length: asNumber(p.length), width: asNumber(p.width), height: asNumber(p.height) })),
      contentsDescription: contents,
      planned: { date: plannedDate, time: plannedTime },
      service: { productCode }
    };
    // Customs are sent only by someone who may declare them; the server refuses
    // anyone else, whatever is sent.
    if (can.declareCustoms) {
      patch.customs = {
        declarable,
        dutiesPayer,
        incoterm,
        declaredValue: asNumber(declaredValue),
        currency: currency.trim().toUpperCase(),
        exportReasonType: exportReason,
        shipmentType,
        invoice: { number: invoiceNumber, date: invoiceDate },
        items: items.map(item => ({
          description: item.description, quantity: asNumber(item.quantity), quantityUnit: item.quantityUnit, unitValue: asNumber(item.unitValue),
          hsCode: item.hsCode, manufacturerCountry: item.manufacturerCountry, netWeight: asNumber(item.netWeight), grossWeight: asNumber(item.grossWeight)
        }))
      };
    }
    return patch;
  }

  function takeIssues(next: ShipmentIssue[]) {
    setIssues(next);
    setConfirmed(declaring ? !next.some(issue => issue.code === "customs_not_confirmed") : false);
  }

  async function persist(): Promise<ShipmentIssue[]> {
    const { issues: next } = await saveOrderShipmentDraft(companyId, orderId, shipment.id, buildPatch());
    takeIssues(next);
    setDirty(false);
    return next;
  }

  async function guard(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (failure) {
      setError(shippingErrorMessage(failure, t));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    await guard("save", async () => {
      const next = await persist();
      setMessage(next.length ? t("Saved. Some things are still missing.") : t("Saved. Ready to create the label."));
    });
  }

  async function confirmDeclaration() {
    await guard("confirm", async () => {
      await persist();
      const { issues: next } = await confirmOrderShipmentCustoms(companyId, orderId, shipment.id);
      takeIssues(next);
      setCustomsChanged(false);
      setMessage(t("Declaration confirmed"));
    });
  }

  async function showServices() {
    await guard("products", async () => {
      await persist();
      setProducts(await listShipmentProducts(companyId, orderId, shipment.id));
    });
  }

  async function checkDutiesPaid() {
    await guard("dd", async () => {
      await persist();
      setDutiesPaid((await checkShipmentDutiesPaid(companyId, orderId, shipment.id)).outcome);
    });
  }

  async function useSenderFromSettings() {
    const profile = connection.shipperProfile;
    if (!profile) return;
    await guard("sender", async () => {
      const next = {
        companyName: profile.companyName, fullName: profile.contactName, phone: profile.phone, email: profile.email,
        address: {
          line1: profile.addressLine1, line2: profile.addressLine2, city: profile.city, postalCode: profile.postalCode,
          provinceCode: profile.provinceCode, countryCode: profile.countryCode
        },
        registrationNumbers: profile.registrationNumbers
      };
      const { issues: pending } = await saveOrderShipmentDraft(companyId, orderId, shipment.id, { shipper: next });
      setShipper(next);
      takeIssues(pending);
      setMessage(t("The sender details from Settings are now on this shipment."));
    });
  }

  async function create() {
    await guard("create", async () => {
      const pending = await persist();
      if (pending.length) {
        setMessage(t("Finish the items below first."));
        return;
      }
      const result = await createOrderShipment(companyId, orderId, shipment.id);
      if (result.outcome === "created") {
        await onCreated(`${t("Label created. Waybill")} ${result.trackingNumber ?? ""}`.trim());
        return;
      }
      if (result.outcome === "invalid") {
        takeIssues(result.issues ?? result.problems ?? []);
        setMessage(t("DHL was not asked: the shipment is not complete yet."));
        return;
      }
      if (result.outcome === "rejected") {
        const details = (result.error?.additionalDetails ?? []).join(" · ");
        setError(`${t("DHL refused the shipment. Nothing was created.")} ${result.error?.detail ?? ""}${details ? ` (${details})` : ""}`.trim());
        return;
      }
      if (result.outcome === "not_sent") {
        setError(t("DHL could not be reached, so nothing was created. It can be sent again."));
        return;
      }
      if (result.outcome === "in_progress") {
        setLocked(true);
        setMessage(t("This shipment is already being sent. Wait a moment, then close this and look at the order."));
        return;
      }
      // unknown: it may exist at DHL. The order's card carries the search from here.
      setLocked(true);
      setError(t("DHL did not answer in time, so the shipment may exist at DHL. Do not create it again: close this and use Search DHL again on the order."));
    });
  }

  function setDuties(next: "receiver" | "sender") {
    setDutiesPayer(next);
    // The incoterm follows the payer unless someone allowed to change it did.
    if (!can.overrideIncoterm || !incoterm || incoterm === IMPLIED_INCOTERM[dutiesPayer]) setIncoterm(IMPLIED_INCOTERM[next]);
    setDirty(true);
    setCustomsChanged(true);
    setDutiesPaid("");
  }

  const updateItem = (index: number, key: keyof ItemInput, value: string) => {
    setItems(current => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
    setDirty(true);
    setCustomsChanged(true);
  };
  const updatePiece = (index: number, key: keyof PieceInput, value: string) => {
    setPieces(current => current.map((piece, i) => (i === index ? { ...piece, [key]: value } : piece)));
    setDirty(true);
    setProducts(null);
  };

  const countrySelect = (value: string, onChange: (code: string) => void, label: string) => (
    <select className="input" value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
      <option value="">{t("Choose…")}</option>
      {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
    </select>
  );

  const money = (cents: number) => `${(cents / 100).toFixed(2)}${currency ? ` ${currency.toUpperCase()}` : ""}`;

  return (
    <div className="inventory-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="inventory-modal inventory-modal-wide shipment-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("DHL shipment")}
        onKeyDown={event => { if (event.key === "Escape") requestClose(); }}
      >
        <div className="inventory-modal-head">
          <h2>{t("DHL shipment")} {shipment.sequence} <code className="shipment-mono">{orderReference}</code></h2>
          <button type="button" className="inventory-modal-close" onClick={requestClose} aria-label={t("Close")}>×</button>
        </div>

        {connection.environment === "test" ? (
          <p className="shipment-banner" data-tone="warn">{t("Test environment: labels from DHL's test system are not real shipments.")}</p>
        ) : null}

        <section className="shipment-section">
          <h3>{t("Sender")}</h3>
          <p className="shipment-muted">
            {[shipper.companyName, shipper.address?.line1, shipper.address?.city, fromCountry ? dhlCountryName(fromCountry, locale) : ""].filter(Boolean).join(" · ") || t("Not set")}
          </p>
          {can.senderPaysDuties && connection.shipperProfile ? (
            <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void useSenderFromSettings()}>{t("Use the sender details from Settings")}</button>
          ) : null}
        </section>

        <section className="shipment-section">
          <h3>{t("Recipient")}</h3>
          <div className="inventory-form">
            <label className="inventory-field"><span>{t("Full name")}</span>
              <input className="input" value={recipient.fullName} onChange={e => change(setRecipient)({ ...recipient, fullName: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("Company (optional)")}</span>
              <input className="input" value={recipient.companyName} onChange={e => change(setRecipient)({ ...recipient, companyName: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("Phone")}</span>
              <input className="input" type="tel" value={recipient.phone} onChange={e => change(setRecipient)({ ...recipient, phone: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("Email")}</span>
              <input className="input" type="email" value={recipient.email} onChange={e => change(setRecipient)({ ...recipient, email: e.target.value })} /></label>
            <label className="inventory-field is-wide"><span>{t("Street address")}</span>
              <input className="input" value={recipient.line1} onChange={e => change(setRecipient)({ ...recipient, line1: e.target.value })} /></label>
            <label className="inventory-field is-wide"><span>{t("Address line 2 (optional)")}</span>
              <input className="input" value={recipient.line2} onChange={e => change(setRecipient)({ ...recipient, line2: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("City")}</span>
              <input className="input" value={recipient.city} onChange={e => change(setRecipient)({ ...recipient, city: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("Postcode")}</span>
              <input className="input" value={recipient.postalCode} onChange={e => change(setRecipient)({ ...recipient, postalCode: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("State or province code (optional)")}</span>
              <input className="input" value={recipient.provinceCode} onChange={e => change(setRecipient)({ ...recipient, provinceCode: e.target.value })} /></label>
            <label className="inventory-field"><span>{t("Country")}</span>
              {countrySelect(recipient.countryCode, code => { change(setRecipient)({ ...recipient, countryCode: code }); setProducts(null); }, t("Country"))}</label>
          </div>
        </section>

        <section className="shipment-section">
          <h3>{t("Parcels")}</h3>
          {pieces.map((piece, index) => (
            <div key={index} className="shipment-piece-row">
              <span className="shipment-muted">{t("Parcel")} {index + 1}</span>
              <label className="inventory-field"><span>{t("Weight (kg)")}</span>
                <input className="input" type="number" min="0" step="any" inputMode="decimal" value={piece.weight} onChange={e => updatePiece(index, "weight", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Length (cm)")}</span>
                <input className="input" type="number" min="1" step="any" inputMode="decimal" value={piece.length} onChange={e => updatePiece(index, "length", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Width (cm)")}</span>
                <input className="input" type="number" min="1" step="any" inputMode="decimal" value={piece.width} onChange={e => updatePiece(index, "width", e.target.value)} /></label>
              <label className="inventory-field"><span>{t("Height (cm)")}</span>
                <input className="input" type="number" min="1" step="any" inputMode="decimal" value={piece.height} onChange={e => updatePiece(index, "height", e.target.value)} /></label>
              {pieces.length > 1 ? (
                <button type="button" className="inventory-link inventory-link-danger" onClick={() => { setPieces(current => current.filter((_, i) => i !== index)); setDirty(true); setProducts(null); }}>{t("Remove")}</button>
              ) : null}
            </div>
          ))}
          <button type="button" className="inventory-link" onClick={() => { setPieces(current => [...current, { weight: "", length: "", width: "", height: "" }]); setDirty(true); setProducts(null); }}>{t("+ Add a parcel")}</button>
          <label className="inventory-field is-wide"><span>{t("What is inside")} ({contents.length}/70)</span>
            <input className="input" value={contents} onChange={e => change(setContents)(e.target.value)} /></label>
        </section>

        {international ? (
          <section className="shipment-section">
            <h3>{t("Contents and customs")}</h3>
            {!can.declareCustoms ? (
              <p className="shipment-note">{t("Declaring goods needs access to financial information. An owner, an admin or a member with finance access completes this part.")}</p>
            ) : (
              <>
                <div className="inventory-type-choice">
                  <button type="button" className={`inventory-type-option${declarable === true ? " is-on" : ""}`} onClick={() => { change(setDeclarable, { customs: true })(true); setProducts(null); }}>
                    <strong>{t("Goods to declare")}</strong><span>{t("Anything with a value. Needs a customs declaration.")}</span>
                  </button>
                  <button type="button" className={`inventory-type-option${declarable === false ? " is-on" : ""}`} onClick={() => { change(setDeclarable, { customs: true })(false); setProducts(null); }}>
                    <strong>{t("Documents")}</strong><span>{t("Papers only, with no commercial value.")}</span>
                  </button>
                </div>

                {declarable === true ? (
                  <>
                    <div className="shipment-subhead">{t("Who pays destination duties and taxes?")}</div>
                    <div className="inventory-type-choice">
                      <button type="button" className={`inventory-type-option${dutiesPayer === "receiver" ? " is-on" : ""}`} onClick={() => setDuties("receiver")}>
                        <strong>{t("The recipient (DAP)")}</strong><span>{t("DHL collects duties and taxes from the recipient before delivery.")}</span>
                      </button>
                      <button
                        type="button"
                        className={`inventory-type-option${dutiesPayer === "sender" ? " is-on" : ""}`}
                        disabled={!can.senderPaysDuties && dutiesPayer !== "sender"}
                        onClick={() => setDuties("sender")}
                      >
                        <strong>{t("You, the sender (DDP)")}</strong>
                        <span>{can.senderPaysDuties
                          ? t("DHL bills duties and taxes to your account. Needs DHL's duties-paid service on the account.")
                          : t("Only an owner or admin can choose this.")}</span>
                      </button>
                    </div>
                    <p className="shipment-muted">{t("Transport is paid by your DHL account either way. Nothing is chosen for you here.")}</p>

                    <div className="inventory-form">
                      <label className="inventory-field"><span>{t("Incoterm")}</span>
                        {can.overrideIncoterm ? (
                          <select className="input" value={incoterm} onChange={e => change(setIncoterm, { customs: true })(e.target.value)}>
                            <option value="">{t("Choose…")}</option>
                            {DHL_INCOTERMS.map(code => <option key={code} value={code}>{code}</option>)}
                          </select>
                        ) : (
                          <input className="input" value={incoterm || "—"} readOnly />
                        )}
                      </label>
                      <label className="inventory-field"><span>{t("Shipment type")}</span>
                        <select className="input" value={shipmentType} onChange={e => change(setShipmentType, { customs: true })(e.target.value as "" | "personal" | "commercial")}>
                          <option value="">{t("Choose…")}</option>
                          <option value="commercial">{t("Commercial")}</option>
                          <option value="personal">{t("Personal")}</option>
                        </select>
                      </label>
                      <label className="inventory-field"><span>{t("Reason for export")}</span>
                        <select className="input" value={exportReason} onChange={e => change(setExportReason, { customs: true })(e.target.value)}>
                          <option value="">{t("Choose…")}</option>
                          {EXPORT_REASONS.map(reason => <option key={reason.value} value={reason.value}>{t(reason.label)}</option>)}
                        </select>
                      </label>
                      <label className="inventory-field"><span>{t("Currency (3 letters)")}</span>
                        <input className="input" maxLength={3} value={currency} onChange={e => change(setCurrency, { customs: true })(e.target.value.toUpperCase())} placeholder="GBP" /></label>
                      <label className="inventory-field"><span>{t("Invoice number")}</span>
                        <input className="input" value={invoiceNumber} onChange={e => change(setInvoiceNumber, { customs: true })(e.target.value)} placeholder={orderReference} /></label>
                      <label className="inventory-field"><span>{t("Invoice date")}</span>
                        <input className="input" type="date" value={invoiceDate} onChange={e => change(setInvoiceDate, { customs: true })(e.target.value)} /></label>
                    </div>

                    <div className="shipment-subhead">{t("Declared goods")}</div>
                    {items.length === 0 ? <p className="shipment-muted">{t("Add one line per kind of item in the parcel.")}</p> : null}
                    {items.map((item, index) => (
                      <div key={index} className="shipment-item">
                        <label className="inventory-field is-wide"><span>{t("Description")}</span>
                          <input className="input" value={item.description} onChange={e => updateItem(index, "description", e.target.value)} /></label>
                        <label className="inventory-field"><span>{t("Quantity")}</span>
                          <input className="input" type="number" min="0" step="any" value={item.quantity} onChange={e => updateItem(index, "quantity", e.target.value)} /></label>
                        <label className="inventory-field"><span>{t("Unit")}</span>
                          <select className="input" value={item.quantityUnit} onChange={e => updateItem(index, "quantityUnit", e.target.value)}>
                            {QUANTITY_UNITS.map(unit => <option key={unit.value} value={unit.value}>{t(unit.label)}</option>)}
                          </select></label>
                        <label className="inventory-field"><span>{t("Value of one")}</span>
                          <input className="input" type="number" min="0" step="any" inputMode="decimal" value={item.unitValue} onChange={e => updateItem(index, "unitValue", e.target.value)} /></label>
                        <label className="inventory-field"><span>{t("HS code")}</span>
                          <input className="input" value={item.hsCode} onChange={e => updateItem(index, "hsCode", e.target.value)} placeholder="9114.30" /></label>
                        <label className="inventory-field"><span>{t("Made in")}</span>
                          {countrySelect(item.manufacturerCountry, code => updateItem(index, "manufacturerCountry", code), t("Made in"))}</label>
                        <label className="inventory-field"><span>{t("Net weight (kg)")}</span>
                          <input className="input" type="number" min="0" step="any" inputMode="decimal" value={item.netWeight} onChange={e => updateItem(index, "netWeight", e.target.value)} /></label>
                        <label className="inventory-field"><span>{t("Gross weight (kg)")}</span>
                          <input className="input" type="number" min="0" step="any" inputMode="decimal" value={item.grossWeight} onChange={e => updateItem(index, "grossWeight", e.target.value)} /></label>
                        <button type="button" className="inventory-link inventory-link-danger" onClick={() => { setItems(current => current.filter((_, i) => i !== index)); setDirty(true); setCustomsChanged(true); }}>{t("Remove line")}</button>
                      </div>
                    ))}
                    <button type="button" className="inventory-link" onClick={() => { setItems(current => [...current, emptyItem()]); setDirty(true); setCustomsChanged(true); }}>{t("+ Add a line")}</button>

                    <div className="shipment-total">
                      <span>{t("Total of the lines")} <strong>{money(lineTotalCents)}</strong></span>
                      <label className="inventory-field"><span>{t("Declared value")}</span>
                        <input className="input" type="number" min="0" step="any" inputMode="decimal" value={declaredValue} onChange={e => change(setDeclaredValue, { customs: true })(e.target.value)} /></label>
                      {lineTotalCents > 0 && declaredCents !== lineTotalCents ? (
                        <button type="button" className="inventory-link" onClick={() => change(setDeclaredValue, { customs: true })((lineTotalCents / 100).toFixed(2))}>{t("Use the total of the lines")}</button>
                      ) : null}
                    </div>
                    {declaredCents !== null && lineTotalCents > 0 && declaredCents !== lineTotalCents ? (
                      <p className="shipment-error">{t("The declared value must equal the total of the lines.")}</p>
                    ) : null}
                    <p className="shipment-muted">{t("This is not the order's price. Declare what the goods are worth for customs, line by line.")}</p>

                    <div className="shipment-confirm">
                      {confirmed && !customsChanged ? (
                        <span className="shipment-chip" data-tone="good">{t("Declaration confirmed")}</span>
                      ) : (
                        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void confirmDeclaration()}>
                          {busy === "confirm" ? t("Confirming…") : t("Confirm the declaration")}
                        </button>
                      )}
                      <span className="shipment-muted">{confirmed && customsChanged
                        ? t("Changed since it was confirmed. Confirm it again.")
                        : t("Confirming records that you checked every value, HS code and origin above. Any change afterwards needs a new confirmation.")}</span>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <section className="shipment-section">
          <h3>{t("DHL service")}</h3>
          <div className="inventory-form">
            <label className="inventory-field"><span>{t("Shipping date")}</span>
              <input className="input" type="date" value={plannedDate} onChange={e => { change(setPlannedDate)(e.target.value); setProducts(null); }} /></label>
            <label className="inventory-field"><span>{t("Ready at")}</span>
              <input className="input" type="time" value={plannedTime} onChange={e => change(setPlannedTime)(e.target.value)} /></label>
          </div>
          {draft.planned?.timeZone ? <p className="shipment-muted">{t("Times are in the sender's time zone:")} {draft.planned.timeZone}</p> : null}
          <div className="shipment-actions">
            <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void showServices()}>
              {busy === "products" ? t("Asking DHL…") : t("Show DHL services for this parcel")}
            </button>
            {productCode ? <span>{t("Chosen:")} <strong className="shipment-mono">{productCode}</strong></span> : null}
          </div>
          {products ? (
            products.outcome === "found" ? (
              <div className="shipment-products">
                {products.products.map(product => (
                  <label key={product.productCode} className={`shipment-product${productCode === product.productCode ? " is-on" : ""}`}>
                    <input type="radio" name={`product-${shipment.id}`} value={product.productCode} checked={productCode === product.productCode} onChange={() => change(setProductCode)(product.productCode)} />
                    <span>
                      <strong>{product.productName}</strong> <code className="shipment-mono">{product.productCode}</code>
                      <small>
                        {product.estimatedDelivery ? `${t("Estimated delivery")} ${product.estimatedDelivery.replace("T", " ").slice(0, 16)}` : ""}
                        {product.totalTransitDays !== null ? ` · ${product.totalTransitDays === 1 ? t("1 day in transit") : t("{count} days in transit").replace("{count}", String(product.totalTransitDays))}` : ""}
                      </small>
                    </span>
                  </label>
                ))}
                {products.pieceCount > 1 ? <p className="shipment-muted">{t("DHL lists services for one parcel, the heaviest. It checks every parcel again when the label is created.")}</p> : null}
              </div>
            ) : products.outcome === "invalid" ? (
              <ul className="shipment-issues">{products.problems.map(problem => <li key={`${problem.code}:${problem.field}`}>{shipmentIssueMessage(problem, t)}</li>)}</ul>
            ) : products.outcome === "none" ? (
              <p className="shipment-note">{t("DHL offers no service for this parcel, route and date. Try another date or check the parcel's size and weight.")}</p>
            ) : products.outcome === "rejected" ? (
              <p className="shipment-error">{t("DHL refused the question.")} {products.detail}</p>
            ) : (
              <p className="shipment-error">{t("DHL could not be asked just now. Try again in a moment.")}</p>
            )
          ) : null}

          {declaring && dutiesPayer === "sender" && can.senderPaysDuties ? (
            <div className="shipment-actions">
              <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void checkDutiesPaid()}>
                {busy === "dd" ? t("Asking DHL…") : t("Check that DHL offers duties paid on this account")}
              </button>
              {dutiesPaid === "available" ? <span className="shipment-chip" data-tone="good">{t("Duties paid is available")}</span> : null}
              {dutiesPaid === "unavailable" ? <span className="shipment-chip" data-tone="bad">{t("Duties paid is not available on this account")}</span> : null}
              {dutiesPaid === "unknown" ? <span className="shipment-chip" data-tone="warn">{t("DHL's answer was unclear: treat duties paid as not available")}</span> : null}
            </div>
          ) : null}
        </section>

        <section className="shipment-section">
          <h3>{t("Check and create")}</h3>
          {dirty ? <p className="shipment-muted">{t("You have unsaved changes. Saving shows what is still missing.")}</p> : null}
          {!dirty && issues.length === 0 ? <p className="shipment-ready">{t("Ready to create the label.")}</p> : null}
          {issues.length > 0 ? (
            <ul className="shipment-issues">
              {issues.map(issue => <li key={`${issue.code}:${issue.field}`}>{shipmentIssueMessage(issue, t)}</li>)}
            </ul>
          ) : null}
          <p className="shipment-muted">{t("Creating the label sends this shipment to DHL once. No pickup is booked, and the order is not marked dispatched until DHL scans the parcel.")}</p>
        </section>

        {error ? <p className="shipment-error">{error}</p> : null}
        {message ? <p className="shipment-note">{message}</p> : null}

        {confirmClose ? (
          <div className="shipment-banner" data-tone="warn">
            <span>{t("You have unsaved changes. Close without saving them?")}</span>
            <span className="shipment-actions">
              <button type="button" className="inventory-link inventory-link-danger" onClick={() => void onClose()}>{t("Close without saving")}</button>
              <button type="button" className="inventory-link" onClick={() => setConfirmClose(false)}>{t("Keep editing")}</button>
            </span>
          </div>
        ) : null}

        <div className="inventory-modal-foot">
          <button type="button" className="inventory-secondary" onClick={requestClose}>{t("Close")}</button>
          <span className="shipment-actions">
            <button type="button" className="inventory-secondary" disabled={Boolean(busy) || locked} onClick={() => void save()}>
              {busy === "save" ? t("Saving…") : t("Save draft")}
            </button>
            <button type="button" className="button" disabled={Boolean(busy) || locked || (!dirty && issues.length > 0)} onClick={() => void create()}>
              {busy === "create" ? t("Sending to DHL…") : t("Create DHL label")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
