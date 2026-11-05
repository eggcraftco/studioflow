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
// - DHL-10 (4 Nov 2026, the owner's comparison with MyDHL+): the phone's country
//   code is chosen beside the number; the company is the person's name unless one
//   is typed (DHL needs one on every label); the currency is picked from DHL's
//   list, the sender's country's first, and amounts show its mark and the reader's
//   grouping; a courier can be booked with the label, with the latest collection
//   time; incoterms carry their names.
// - DHL S2–S7 (5 Nov 2026, the owner's decisions before the first real shipment):
//   S3 — NivaDesk cannot cancel a courier: said beside the courier box before it is ticked, and on
//   the order card with the pickup number (no cancel button). S5 — the HS code's entry in the
//   official tariff is shown under the field once saved (the server looks it up); nothing fills or
//   confirms a code. S6 — the person types the weight of ONE item; the line's total DHL gets is
//   shown (3 × 0.120 = 0.360 kg) and worked out again by the server; an older app's line total is
//   kept as it is until a weight of one item is typed. S7 — a line can start from the order or its
//   held inventory (description + codes only) and is then ticked as checked; the EUDR TARIC code
//   is picked from HMRC's list.
// - DHL S4 (5 Nov 2026, after DHL's test environment showed validateDataOnly makes nothing):
//   "Check with DHL" asks DHL to check the details as the label would send them, without a label,
//   a waybill or a courier (checkOrderShipmentWithDhl; the courier is never asked, nothing is
//   stored). Its answer says "DHL check passed", never "label created", and is dropped as soon as
//   anything is edited.
// - MyDHL+ draft (owner, 3 + 5 Nov 2026): DHL's API cannot save a draft in MyDHL+, so "Download for MyDHL+"
//   saves the draft and downloads it as a file for MyDHL+'s own "Upload a Shipment File"
//   (lib/studioflow/mydhlUploadFile.ts). There it is an unsent shipment to edit, save for later or label.
//   NivaDesk sends nothing to DHL for it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import { DHL_COUNTRIES, dhlCountryName } from "@/lib/studioflow/dhlCountries";
import { currencyChoices, currencyMark, currencyName, dhlCountryCurrency } from "@/lib/studioflow/dhlCurrencies";
import { callingCodeFor, composePhone, splitPhone } from "@/lib/studioflow/dhlPhone";
import { amountText, formatMoney, readAmount } from "@/lib/studioflow/customsAmount";
import { customsLineWeights, kgText, lineWeightKg, tariffAnswerFor, weightGrams } from "@/lib/studioflow/dhlLineWeight";
import { EUDR_TARIC_CODES, isEudrTaricCode } from "@/lib/studioflow/dhlEudr";
import {
  EXPORT_REASONS,
  QUANTITY_UNITS,
  checkOrderShipmentWithDhl,
  checkShipmentDutiesPaid,
  confirmOrderShipmentCustoms,
  createOrderShipment,
  getShippingConnection,
  listOrderShipments,
  listShipmentProducts,
  needsCustomsChoice,
  saveOrderShipmentDraft,
  shipmentIssueMessage,
  shippingErrorMessage,
  type CustomsItem,
  type DhlCheckResult,
  type OrderShipment,
  type ProductIdSuggestion,
  type ShipmentDraftPatch,
  type ShipmentIssue,
  type ShipmentProductsResult,
  type ShippingAbilities,
  type ShippingConnectionView
} from "@/lib/studioflow/shipping";
import { senderFromProfile, senderWarningLabels } from "@/lib/studioflow/shippingSender";
import { ETSY_DHL_EMAIL_NOTE } from "@/lib/studioflow/etsyOrder";
import { myDhlUploadCsv, myDhlUploadExtraLines, myDhlUploadFileName } from "@/lib/studioflow/mydhlUploadFile";

type PieceInput = { weight: string; length: string; width: string; height: string };
type ItemInput = {
  description: string; quantity: string; quantityUnit: string; unitValue: string;
  hsCode: string; manufacturerCountry: string;
  // S6: the weight of ONE item as typed. netWeight / grossWeight hold a line TOTAL saved earlier
  // (an older app, or a server from before S6): sent back unchanged until a unit weight is typed.
  unitNetWeight: string; unitGrossWeight: string; netWeight: string; grossWeight: string;
  // S5: the server's tariff answer as read (never sent back). S7: where the line was filled from.
  hsTariff: CustomsItem["hsTariff"] | null; prefillSource: "" | NonNullable<CustomsItem["prefillSource"]>; lineChecked: boolean;
  // Product identifiers (DHL-8): sent as typed; the server checks and keeps them.
  merchantProductId: string; manufacturerProductId: string; standardProductId: string;
  ddsReference: string; taricDocumentCode: string;
  /** "This product has no barcode": the server declares TARIC Y081 for the line. */
  standardProductIdAbsent: boolean;
};

const DHL_INCOTERMS = ["DAP", "DDP", "EXW", "FCA", "CPT", "CIP", "DPU", "FAS", "FOB", "CFR", "CIF"];
// The ICC's Incoterms® 2020 names, shown beside each code as MyDHL+ does.
const INCOTERM_NAMES: Record<string, string> = {
  DAP: "Delivered at Place", DDP: "Delivered Duty Paid", EXW: "Ex Works", FCA: "Free Carrier", CPT: "Carriage Paid To",
  CIP: "Carriage and Insurance Paid To", DPU: "Delivered at Place Unloaded", FAS: "Free Alongside Ship", FOB: "Free on Board",
  CFR: "Cost and Freight", CIF: "Cost, Insurance and Freight"
};
const IMPLIED_INCOTERM: Record<string, string> = { receiver: "DAP", sender: "DDP" };

// DHL's price in its own currency (the account's billing currency), in the reader's number format.
const formatShipmentPrice = (price: { amount: number; currency: string }, locale: string) => {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(price.amount);
  } catch {
    return `${price.amount.toFixed(2)} ${price.currency}`;
  }
};
const asInput = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? "" : String(value));
const asNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
const emptyItem = (): ItemInput => ({
  description: "", quantity: "1", quantityUnit: "PCS", unitValue: "", hsCode: "", manufacturerCountry: "",
  unitNetWeight: "", unitGrossWeight: "", netWeight: "", grossWeight: "", hsTariff: null, prefillSource: "", lineChecked: false,
  merchantProductId: "", manufacturerProductId: "", standardProductId: "", ddsReference: "", taricDocumentCode: "", standardProductIdAbsent: false
});
// How the server read the recipient (functions/shipping/productIds.js recipientKind), for the hint under the choice.
const RECIPIENT_KIND_SOURCE: Record<string, string> = {
  tax_id: "Read as a business: the recipient has a VAT or EORI number.",
  no_company_name: "Read as a consumer: there is no company name.",
  company_name_only: "A company name alone does not show that the recipient is a business. Choose Business or Consumer."
};
const BUSINESS_TAX_TYPES = new Set(["VAT", "EOR", "EIN", "DUN", "FED", "STA"]);
// Where a suggested code came from (functions/shipping/productIds.js suggestionsFrom).
const SUGGESTION_SOURCE: Record<ProductIdSuggestion["source"], string> = {
  order_line: "Order line",
  order_watch_ref: "Watch reference on the order",
  inventory_item: "Held for this order"
};

export function ShipmentDraftDialog({
  companyId,
  orderId,
  orderReference,
  shipment,
  can,
  connection,
  language,
  onClose,
  onCreated,
  etsyOrder = false
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
  /** Etsy API Terms: an Etsy buyer's e-mail is never passed to DHL (the server strips it too). */
  etsyOrder?: boolean;
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
    countryCode: draft.recipient?.address?.countryCode ?? "",
    // DHL-8: business or consumer as chosen here ("" = read from the details), and the recipient's VAT number.
    kind: (draft.recipient?.kind ?? "") as "" | "business" | "consumer",
    vat: (draft.recipient?.registrationNumbers ?? []).find(r => String(r.typeCode).toUpperCase() === "VAT")?.number ?? ""
  }));
  // The phone as MyDHL+ asks for it: the country code chosen beside the number ("+44" · "7700 900123").
  const [phone, setPhone] = useState(() => splitPhone(draft.recipient?.phone ?? "", draft.recipient?.address?.countryCode ?? ""));
  // DHL needs a company on every label; a private person's own name is what it expects there. Stored
  // empty (the server sends the name), so the EU consumer rule still reads "no company".
  const [noCompany, setNoCompany] = useState(() => {
    const company = String(draft.recipient?.companyName ?? "").trim().toLowerCase();
    return !company || company === String(draft.recipient?.fullName ?? "").trim().toLowerCase();
  });
  const [pieces, setPieces] = useState<PieceInput[]>(() => {
    const list = (draft.pieces ?? []).map(p => ({ weight: asInput(p.weight), length: asInput(p.length), width: asInput(p.width), height: asInput(p.height) }));
    return list.length ? list : [{ weight: "", length: "", width: "", height: "" }];
  });
  const [contents, setContents] = useState(draft.contentsDescription ?? "");
  const [plannedDate, setPlannedDate] = useState(draft.planned?.date ?? "");
  const [plannedTime, setPlannedTime] = useState(draft.planned?.time ?? "10:00");
  // A DHL courier booked with the label (DHL-10): from the ready time until the close time.
  const [pickup, setPickup] = useState(() => ({
    requested: draft.pickup?.requested === true,
    closeTime: draft.pickup?.closeTime || "17:00",
    location: draft.pickup?.location ?? "",
    instructions: draft.pickup?.instructions ?? ""
  }));
  const [productCode, setProductCode] = useState(draft.service?.productCode ?? "");
  const [declarable, setDeclarable] = useState<boolean | null>(typeof customsView.declarable === "boolean" ? customsView.declarable : null);
  const [dutiesPayer, setDutiesPayer] = useState<"" | "receiver" | "sender">(customsView.dutiesPayer ?? "");
  const [incoterm, setIncoterm] = useState(customsView.incoterm ?? "");
  // The sender's country's currency in DHL's list is offered first and fills an empty draft.
  const senderCurrency = dhlCountryCurrency(String(draft.shipper?.address?.countryCode ?? ""));
  const [currency, setCurrency] = useState(() => (customsView.currency || senderCurrency).toUpperCase());
  // Money fields keep the text as typed; they show the value with the reader's grouping once left.
  const [declaredValue, setDeclaredValue] = useState(() => amountText(customsView.declaredValue ?? null, customsView.currency || senderCurrency, locale));
  const [exportReason, setExportReason] = useState(customsView.exportReasonType ?? "");
  const [shipmentType, setShipmentType] = useState<"" | "personal" | "commercial">(customsView.shipmentType ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(customsView.invoice?.number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(customsView.invoice?.date ?? "");
  const [items, setItems] = useState<ItemInput[]>(() => (customsView.items ?? []).map((i: CustomsItem) => ({
    description: i.description ?? "", quantity: asInput(i.quantity), quantityUnit: i.quantityUnit || "PCS", unitValue: amountText(i.unitValue, customsView.currency || senderCurrency, locale),
    hsCode: i.hsCode ?? "", manufacturerCountry: i.manufacturerCountry ?? "",
    unitNetWeight: asInput(i.unitNetWeight), unitGrossWeight: asInput(i.unitGrossWeight),
    // A line with a unit weight shows only that; a line saved as a total keeps the total aside.
    netWeight: typeof i.unitNetWeight === "number" ? "" : asInput(i.netWeight), grossWeight: typeof i.unitNetWeight === "number" ? "" : asInput(i.grossWeight),
    hsTariff: i.hsTariff ?? null, prefillSource: i.prefillSource ?? "", lineChecked: i.lineChecked === true,
    merchantProductId: i.merchantProductId ?? "", manufacturerProductId: i.manufacturerProductId ?? "", standardProductId: i.standardProductId ?? "",
    ddsReference: i.ddsReference ?? "", taricDocumentCode: i.taricDocumentCode ?? "", standardProductIdAbsent: i.standardProductIdAbsent === true
  })));
  // What the server says the lines need here (DHL-8): EU consumer → codes required, or refused by the owner's choice.
  const productIdsView = customsView.productIds;
  const productIdsRequired = productIdsView?.required === true;
  const productIdsRefused = productIdsView?.refused === true;
  const productIdSuggestions = customsView.productIdSuggestions ?? [];
  // How the server read the recipient, shown only where the EU rule is in play and nobody chose yet.
  const kindView = productIdsView?.recipientKind;
  const euScope = ["eu_b2c", "eu_b2b", "eu_unconfirmed"].includes(productIdsView?.scope ?? "");
  const recipientKindNote = !kindView || !euScope || recipient.kind
    ? ""
    : [
        kindView.staleChoice ? t("The recipient changed after the type was chosen. Choose again.") : "",
        recipient.vat.trim() || (draft.recipient?.registrationNumbers ?? []).some(r => BUSINESS_TAX_TYPES.has(String(r.typeCode).toUpperCase()) && String(r.number ?? "").trim())
          ? t(RECIPIENT_KIND_SOURCE.tax_id)
          : t(RECIPIENT_KIND_SOURCE[kindView.source] ?? ""),
        kindView.hint === "consumer" && kindView.source === "company_name_only" ? t("Orders from online shops and marketplaces usually come from consumers.") : ""
      ].filter(Boolean).join(" ");

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
  // S4: DHL's answer to "Check with DHL" — only for the details as they were checked.
  const [dhlCheck, setDhlCheck] = useState<DhlCheckResult | null>(null);
  useEffect(() => { if (dirty) setDhlCheck(null); }, [dirty]);
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
  // The profile as Settings holds it NOW: the card's connection may have been read before an edit in
  // Settings, so the dialog asks once more on opening (the same owner/admin-only read; no server change).
  const [latestProfile, setLatestProfile] = useState(connection.shipperProfile ?? null);
  useEffect(() => {
    let active = true;
    getShippingConnection(companyId, { fresh: true })
      .then(view => { if (active && view.shipperProfile !== undefined) setLatestProfile(view.shipperProfile ?? null); })
      .catch(() => { /* keep the card's copy */ });
    return () => { active = false; };
  }, [companyId]);
  // The server's reading of this draft's sender (field names only), for every role: a member never reads the
  // profile, so only the server can tell them. Re-read on opening for the same reason as the profile above.
  // Absent (a server from before 22 Oct 2026): the owner/admin compare below, as before.
  const [serverOutdated, setServerOutdated] = useState<string[] | undefined>(shipment.senderOutdated);
  useEffect(() => {
    let active = true;
    listOrderShipments(companyId, orderId)
      .then(result => {
        const row = (result.shipments ?? []).find(s => s.id === shipment.id);
        if (active && row && Array.isArray(row.senderOutdated)) setServerOutdated(row.senderOutdated);
      })
      .catch(() => { /* keep the card's copy */ });
    return () => { active = false; };
  }, [companyId, orderId, shipment.id]);
  const senderChanged = useMemo(
    () => senderWarningLabels({ serverFields: serverOutdated, draftShipper: shipper, profile: latestProfile, manager: can.senderPaysDuties }),
    [serverOutdated, shipper, latestProfile, can.senderPaysDuties]
  );
  // Another country, or Great Britain ↔ Northern Ireland (a BT postcode): DHL treats both as customs routes.
  const international = needsCustomsChoice(fromCountry, String(shipper.address?.postalCode ?? ""), recipient.countryCode, recipient.postalCode);
  const declaring = international && declarable === true;
  // A server from before DHL-10 neither shows nor keeps a pickup on the draft: the choice is offered
  // only when the draft comes back with its pickup field (null or the booking).
  const pickupSupported = draft.pickup !== undefined;
  const pickupTimesWrong = pickup.requested && /^\d{2}:\d{2}$/.test(plannedTime) && /^\d{2}:\d{2}$/.test(pickup.closeTime) && pickup.closeTime <= plannedTime;

  const change = <T,>(setter: (value: T) => void, { customs = false } = {}) => (value: T) => {
    setter(value);
    setDirty(true);
    if (customs) setCustomsChanged(true);
  };

  const countries = useMemo(
    () => DHL_COUNTRIES.map(([code]) => ({ code, name: dhlCountryName(code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale]
  );
  const phoneCountries = useMemo(() => countries.map(country => ({ ...country, calling: callingCodeFor(country.code) })).filter(country => country.calling), [countries]);

  const amount = (raw: string) => readAmount(raw, currency, locale);
  // DHL's collection hours for the chosen service on the shipping date (from "Show DHL services").
  const chosenWindow = products?.outcome === "found" ? products.products.find(p => p.productCode === productCode)?.pickupWindow ?? null : null;
  const pickupOutsideWindow = Boolean(pickup.requested && chosenWindow && (
    (chosenWindow.latest && plannedTime > chosenWindow.latest) || (chosenWindow.earliest && pickup.closeTime < chosenWindow.earliest)
  ));
  const lineTotalCents = items.reduce((sum, item) => {
    const quantity = asNumber(item.quantity);
    const value = amount(item.unitValue).value;
    return quantity !== null && value !== null ? sum + Math.round(quantity * value * 100) : sum;
  }, 0);
  const declaredAmount = amount(declaredValue).value;
  const declaredCents = declaredAmount === null ? null : Math.round(declaredAmount * 100);
  // MyDHL+'s summary under the lines: units beside the value.
  const totalUnits = items.reduce((sum, item) => sum + (asNumber(item.quantity) ?? 0), 0);
  // S6: the lines' net weight (as DHL will get it) against the parcels', in grams.
  const linesNetGrams = items.reduce((sum, item) => {
    const net = customsLineWeights(item).netWeight;
    return sum + (typeof net === "number" && net > 0 ? weightGrams(net) : 0);
  }, 0);
  const parcelsGrams = pieces.reduce((sum, piece) => {
    const weight = asNumber(piece.weight);
    return sum + (weight !== null && weight > 0 ? weightGrams(weight) : 0);
  }, 0);
  const currencyList = useMemo(() => currencyChoices(fromCountry, currency), [fromCountry, currency]);
  const mark = currency ? currencyMark(currency, locale) : "";

  // S6: what a line says about its weight (lib/studioflow/dhlLineWeight.ts customsLineWeights).
  const lineWeights = (item: ItemInput) => customsLineWeights(item);

  function buildPatch(): ShipmentDraftPatch {
    const patch: ShipmentDraftPatch = {
      recipient: {
        fullName: recipient.fullName, companyName: noCompany ? "" : recipient.companyName, phone: composePhone(phone.country, phone.national), email: etsyOrder ? "" : recipient.email,
        kind: recipient.kind,
        // The VAT number typed here replaces any VAT on the draft; other registrations stay as they were.
        registrationNumbers: [
          ...(draft.recipient?.registrationNumbers ?? []).filter(r => String(r.typeCode).toUpperCase() !== "VAT"),
          ...(recipient.vat.trim() ? [{ typeCode: "VAT", number: recipient.vat.trim(), issuerCountryCode: recipient.countryCode }] : [])
        ],
        address: {
          line1: recipient.line1, line2: recipient.line2, city: recipient.city, postalCode: recipient.postalCode,
          provinceCode: recipient.provinceCode, countryCode: recipient.countryCode
        }
      },
      pieces: pieces.map(p => ({ weight: asNumber(p.weight), length: asNumber(p.length), width: asNumber(p.width), height: asNumber(p.height) })),
      contentsDescription: contents,
      planned: { date: plannedDate, time: plannedTime },
      pickup: { requested: pickup.requested, closeTime: pickup.closeTime, location: pickup.location, instructions: pickup.instructions },
      service: { productCode }
    };
    // Customs are sent only by someone who may declare them; the server refuses
    // anyone else, whatever is sent.
    if (can.declareCustoms) {
      patch.customs = {
        declarable,
        dutiesPayer,
        incoterm,
        declaredValue: amount(declaredValue).value,
        currency: currency.trim().toUpperCase(),
        exportReasonType: exportReason,
        shipmentType,
        invoice: { number: invoiceNumber, date: invoiceDate },
        items: items.map(item => ({
          description: item.description, quantity: asNumber(item.quantity), quantityUnit: item.quantityUnit, unitValue: amount(item.unitValue).value,
          hsCode: item.hsCode, manufacturerCountry: item.manufacturerCountry,
          ...lineWeights(item),
          merchantProductId: item.merchantProductId, manufacturerProductId: item.manufacturerProductId, standardProductId: item.standardProductId,
          ddsReference: item.ddsReference, taricDocumentCode: item.taricDocumentCode,
          standardProductIdAbsent: !item.standardProductId.trim() && item.standardProductIdAbsent,
          ...(item.prefillSource ? { prefillSource: item.prefillSource, lineChecked: item.lineChecked } : {})
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
    const profile = latestProfile ?? connection.shipperProfile;
    if (!profile) return;
    await guard("sender", async () => {
      // The whole sender block, contactTitle included (it was left out before, so a title added
      // in Settings never reached a draft opened earlier).
      const next = senderFromProfile(profile);
      const { issues: pending } = await saveOrderShipmentDraft(companyId, orderId, shipment.id, { shipper: next });
      setShipper(next);
      // The draft now carries the profile: the warning is cleared here, and the card's list is read again on close.
      setServerOutdated(current => (Array.isArray(current) ? [] : current));
      takeIssues(pending);
      setMessage(t("The sender details from Settings are now on this shipment."));
    });
  }

  // S4: DHL checks the details; nothing is created at DHL or stored in NivaDesk, the courier is never asked.
  async function checkWithDhl() {
    await guard("dhlcheck", async () => {
      setDhlCheck(null);
      const pending = await persist();
      if (pending.length) {
        setMessage(t("DHL was not asked: the shipment is not complete yet."));
        return;
      }
      const result = await checkOrderShipmentWithDhl(companyId, orderId, shipment.id);
      if (result.outcome === "invalid" && result.sentToDhl === false) {
        takeIssues(result.issues ?? result.problems ?? []);
        setMessage(t("DHL was not asked: the shipment is not complete yet."));
        return;
      }
      setDhlCheck(result);
    });
  }

  // MyDHL+ draft: save, then the same draft as a file for MyDHL+ ▸ Ship ▸ Upload a Shipment File. Nothing goes to DHL.
  async function downloadForMyDhl() {
    await guard("mydhlfile", async () => {
      await persist();
      const fileName = myDhlUploadFileName(orderReference, shipment.sequence);
      const draftNow = buildPatch();
      const extraLines = myDhlUploadExtraLines(draftNow);
      const url = URL.createObjectURL(new Blob([myDhlUploadCsv({ orderReference, draft: draftNow })], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage([
        t("The file for MyDHL+ was downloaded: {file}. Upload it in MyDHL+ ▸ Ship ▸ Upload a Shipment File.").replace("{file}", fileName),
        // MyDHL+'s upload takes one customs line per shipment (lib/studioflow/mydhlUploadFile.ts).
        extraLines > 0 ? t("MyDHL+'s upload takes one customs line per shipment, so the file carries the first line. Add the other {count} customs lines in MyDHL+ before you print the label.").replace("{count}", String(extraLines)) : ""
      ].filter(Boolean).join(" "));
    });
  }

  // What DHL's answer to the check says, in the screen's words.
  const dhlCheckView = (result: DhlCheckResult): { tone: "ok" | "warn" | "error"; text: string } => {
    if (result.outcome === "valid") return { tone: "ok", text: t("DHL check passed: DHL accepted these details. This is not a label: nothing was created at DHL.") };
    if (result.outcome === "invalid") {
      const details = (result.dhl?.additionalDetails ?? []).join(" · ");
      return { tone: "error", text: `${t("DHL found problems in these details. Nothing was created.")} ${result.dhl?.detail ?? ""}${details ? ` (${details})` : ""}`.trim() };
    }
    if (result.outcome === "made_something") {
      const made = result.made ?? {};
      const numbers = [made.shipmentTrackingNumber, ...(made.packageTrackingNumbers ?? []), made.dispatchConfirmationNumber].filter(Boolean).join(", ");
      return { tone: "error", text: t("DHL's answer to the check carried a shipment or pickup number ({numbers}). NivaDesk saved nothing. Look in MyDHL+ before you create a label, and contact NivaDesk support.").replace("{numbers}", numbers || "—") };
    }
    if (result.reason === "check_off") return { tone: "warn", text: t("The DHL check is switched off at the moment. You can still create the label.") };
    if (result.reason === "auth") return { tone: "error", text: t("DHL did not accept the connection's API key for the check. An owner can check it in Settings ▸ Integrations ▸ DHL Express.") };
    return { tone: "warn", text: t("The DHL check could not be done just now. Nothing was created. You can try again, or create the label.") };
  };

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

  const updateItem = (index: number, key: keyof ItemInput, value: string | boolean) => {
    setItems(current => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
    setDirty(true);
    setCustomsChanged(true);
  };
  // S7: a line started from the order or its held inventory — the description and the codes only.
  // The HS code, origin and weight stay the person's; the line is then ticked as checked.
  const applySuggestion = (index: number, suggestion: ProductIdSuggestion) => {
    setItems(current => current.map((item, i) => (i === index ? {
      ...item,
      ...(suggestion.description ? { description: suggestion.description } : {}),
      ...(suggestion.merchantProductId ? { merchantProductId: suggestion.merchantProductId } : {}),
      ...(suggestion.manufacturerProductId ? { manufacturerProductId: suggestion.manufacturerProductId } : {}),
      prefillSource: suggestion.source,
      lineChecked: false
    } : item)));
    setDirty(true);
    setCustomsChanged(true);
  };
  // S5: the tariff's answer for the code as typed now (lib/studioflow/dhlLineWeight.ts tariffAnswerFor).
  const tariffFor = (item: ItemInput) => tariffAnswerFor(item.hsCode, item.hsTariff, fromCountry);
  // An issue on one customs line names that line ("Line 2 (Strap): …"); the server sends line and description.
  const issueText = (issue: ShipmentIssue) => {
    const line = Number(issue.detail?.line);
    const description = String(issue.detail?.description ?? "").trim();
    const sentence = shipmentIssueMessage(issue, t);
    if (!Number.isInteger(line) || line < 1) return sentence;
    return `${t("Line {n}").replace("{n}", String(line))}${description ? ` (${description})` : ""}: ${sentence}`;
  };
  const suggestionLabel = (suggestion: ProductIdSuggestion) => {
    const codes = [suggestion.merchantProductId ? `SKU ${suggestion.merchantProductId}` : "", suggestion.manufacturerProductId ?? ""].filter(Boolean).join(" · ");
    return `${t(SUGGESTION_SOURCE[suggestion.source] ?? suggestion.source)}: ${suggestion.label}${codes ? ` (${codes})` : ""}`;
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

  const money = (cents: number) => formatMoney(cents / 100, currency, locale);
  const incotermLabel = (code: string) => (INCOTERM_NAMES[code] ? `${code} – ${t(INCOTERM_NAMES[code])}` : code);

  // A new currency re-reads what was typed: "1.750" is 1750 in a currency with no decimals.
  function changeCurrency(next: string) {
    const reformat = (raw: string) => {
      const read = readAmount(raw, currency, locale);
      return read.value === null ? raw : amountText(read.value, next, locale);
    };
    setItems(current => current.map(item => ({ ...item, unitValue: reformat(item.unitValue) })));
    setDeclaredValue(current => reformat(current));
    change(setCurrency, { customs: true })(next);
  }

  // A money field: the currency's mark beside it, the text as typed, and the value regrouped once left.
  const moneyInput = (value: string, onChange: (next: string) => void, testId: string) => {
    const read = amount(value);
    return (
      <>
        <span className="shipment-money">
          {mark ? <span className="shipment-money-mark" aria-hidden="true">{mark}</span> : null}
          <input
            className="input"
            inputMode="decimal"
            value={value}
            data-testid={testId}
            aria-invalid={read.error ? true : undefined}
            onChange={e => onChange(e.target.value)}
            onBlur={() => { if (read.value !== null) onChange(amountText(read.value, currency, locale)); }}
          />
          {currency ? <span className="shipment-money-code">{currency}</span> : null}
        </span>
        {read.error ? <small className="shipment-error">{t(read.error)}</small> : null}
      </>
    );
  };

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
          {senderChanged.length > 0 ? (
            // A draft keeps the sender as it was when the shipment was opened; Settings changed since.
            // Only this not-yet-created draft is offered the update — created labels and invoices are history.
            <div className="shipment-banner" data-tone="warn" role="status" data-testid="sender-outdated">
              <p><strong>{t("The sender details in Settings have changed since this shipment was opened.")}</strong></p>
              <p className="shipment-muted">{t("Different now:")} {senderChanged.map(label => t(label)).join(", ")}</p>
              {can.senderPaysDuties ? (
                <button type="button" className="inventory-primary" disabled={Boolean(busy)} onClick={() => void useSenderFromSettings()}>{t("Use updated sender details")}</button>
              ) : (
                <p className="shipment-muted">{t("An owner or admin can update them.")}</p>
              )}
            </div>
          ) : can.senderPaysDuties && (latestProfile ?? connection.shipperProfile) ? (
            <button type="button" className="inventory-link" disabled={Boolean(busy)} onClick={() => void useSenderFromSettings()}>{t("Use the sender details from Settings")}</button>
          ) : null}
        </section>

        <section className="shipment-section">
          <h3>{t("Recipient")}</h3>
          <div className="inventory-form">
            <label className="inventory-field"><span>{t("Full name")}</span>
              <input className="input" value={recipient.fullName} onChange={e => change(setRecipient)({ ...recipient, fullName: e.target.value })} /></label>
            <div className="inventory-field">
              <label htmlFor={`company-${shipment.id}`}><span>{t("Company")}</span></label>
              <input
                id={`company-${shipment.id}`}
                className="input"
                value={noCompany ? recipient.fullName : recipient.companyName}
                disabled={noCompany}
                placeholder={noCompany ? "" : t("Company name")}
                onChange={e => change(setRecipient)({ ...recipient, companyName: e.target.value })}
              />
              <label className="inventory-check shipment-inline-check">
                <input type="checkbox" checked={noCompany} onChange={e => change(setNoCompany)(e.target.checked)} />
                {t("Not a company: use the recipient's name")}
              </label>
            </div>
            <div className="inventory-field">
              <label htmlFor={`phone-${shipment.id}`}><span>{t("Phone")}</span></label>
              <div className="shipment-phone">
                <select className="input" value={phone.country} aria-label={t("Country code")} onChange={e => change(setPhone)({ ...phone, country: e.target.value })}>
                  <option value="">{t("Code…")}</option>
                  {phoneCountries.map(country => <option key={country.code} value={country.code}>{`${country.name} +${country.calling}`}</option>)}
                </select>
                <input id={`phone-${shipment.id}`} className="input" type="tel" inputMode="tel" value={phone.national} onChange={e => change(setPhone)({ ...phone, national: e.target.value })} />
              </div>
              {composePhone(phone.country, phone.national) ? (
                <small className="shipment-muted" data-testid="phone-for-dhl">{t("DHL gets:")} <code className="shipment-mono" dir="ltr">{composePhone(phone.country, phone.national)}</code></small>
              ) : null}
            </div>
            {etsyOrder ? (
              <p className="inventory-field shipment-muted" data-etsy-compliance="dhl-email" role="note">{t(ETSY_DHL_EMAIL_NOTE)}</p>
            ) : (
              <label className="inventory-field"><span>{t("Email")}</span>
                <input className="input" type="email" value={recipient.email} onChange={e => change(setRecipient)({ ...recipient, email: e.target.value })} /></label>
            )}
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
              {countrySelect(recipient.countryCode, code => {
                change(setRecipient)({ ...recipient, countryCode: code });
                // The phone's code follows the country until someone picks another one for it.
                if (!phone.country || phone.country === recipient.countryCode) setPhone(current => ({ ...current, country: code }));
                setProducts(null);
              }, t("Country"))}</label>
            <label className="inventory-field"><span>{t("Recipient type")}</span>
              <select className="input" value={recipient.kind} onChange={e => change(setRecipient, { customs: true })({ ...recipient, kind: e.target.value as "" | "business" | "consumer" })}>
                <option value="">{t("Automatic (from the details above)")}</option>
                <option value="business">{t("Business")}</option>
                <option value="consumer">{t("Consumer")}</option>
              </select></label>
            <label className="inventory-field"><span>{t("Recipient's VAT number (businesses only)")}</span>
              <input className="input" value={recipient.vat} onChange={e => change(setRecipient, { customs: true })({ ...recipient, vat: e.target.value })} /></label>
          </div>
          <p className="shipment-muted">{t("DHL needs a company name on every label. For a private person it is their own name, as in MyDHL+.")}</p>
          {recipientKindNote ? <p className="shipment-muted" data-testid="recipient-kind-note">{recipientKindNote}</p> : null}
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
                            {DHL_INCOTERMS.map(code => <option key={code} value={code}>{incotermLabel(code)}</option>)}
                          </select>
                        ) : (
                          <input className="input" value={incoterm ? incotermLabel(incoterm) : "—"} readOnly />
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
                      <label className="inventory-field"><span>{t("Currency")}</span>
                        <select className="input" value={currency} onChange={e => changeCurrency(e.target.value)} data-testid="customs-currency">
                          <option value="">{t("Choose…")}</option>
                          {currencyList.map(code => <option key={code} value={code}>{`${code} · ${currencyName(code, locale)}`}</option>)}
                        </select>
                        {senderCurrency && currency === senderCurrency ? <small className="shipment-muted">{t("From the sender's country. Change it if the invoice is in another currency.")}</small> : null}
                      </label>
                      <label className="inventory-field"><span>{t("Invoice number")}</span>
                        <input className="input" value={invoiceNumber} onChange={e => change(setInvoiceNumber, { customs: true })(e.target.value)} placeholder={orderReference} /></label>
                      <label className="inventory-field"><span>{t("Invoice date")}</span>
                        <input className="input" type="date" value={invoiceDate} onChange={e => change(setInvoiceDate, { customs: true })(e.target.value)} /></label>
                    </div>

                    <div className="shipment-subhead">{t("Declared goods")}</div>
                    {productIdsRefused ? (
                      <p className="shipment-banner" data-tone="warn" role="status" data-testid="eu-product-ids-refused">
                        {shipmentIssueMessage({ code: productIdsView?.mode === "mydhl_plus" ? "eu_b2c_use_mydhl_plus" : "eu_product_ids_not_supported", field: "customs.items" }, t)}
                        {productIdsView?.mode === "mydhl_plus" ? <> <code className="shipment-mono">{orderReference}</code></> : null}
                      </p>
                    ) : productIdsRequired ? (
                      <p className="shipment-note" data-testid="eu-product-ids-required">{t("This shipment goes to a consumer in the EU: from 1 November 2026 every line needs your product code and the manufacturer's product code. If you made the item, the manufacturer's code is your own model code. One code per product variant, never an order or batch number.")}</p>
                    ) : null}
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
                          {moneyInput(item.unitValue, value => updateItem(index, "unitValue", value), `unit-value-${index}`)}</label>
                        <label className="inventory-field"><span>{t("HS code")}</span>
                          <input className="input" value={item.hsCode} onChange={e => updateItem(index, "hsCode", e.target.value)} placeholder="9114.30" />
                          {(() => {
                            // S5: the official tariff's entry for this code, for the person to read; never a verdict on the goods.
                            if (!item.hsCode.trim()) return null;
                            const answer = tariffFor(item);
                            if (!answer) return <small className="shipment-muted" data-testid={`hs-tariff-${index}`}>{t("Saving looks the code up in the official tariff.")}</small>;
                            if (answer.outcome === "found") {
                              return (
                                <small className="shipment-muted" data-testid={`hs-tariff-${index}`} data-outcome="found">
                                  {t(answer.tariff === "xi" ? "Northern Ireland tariff: {description}" : "UK tariff: {description}").replace("{description}", answer.description ?? "")}
                                  {answer.declarable === false ? ` ${t("More detailed codes exist under this one. UK export declarations use an 8-digit commodity code.")}` : ""}
                                </small>
                              );
                            }
                            if (answer.outcome === "not_found") return <small className="shipment-error" data-testid={`hs-tariff-${index}`} data-outcome="not_found">{t("This HS code is not in the official tariff. Check it on the UK Trade Tariff.")}</small>;
                            return <small className="shipment-muted" data-testid={`hs-tariff-${index}`} data-outcome="unavailable">{t("The tariff could not be checked just now. Check this code yourself on the UK Trade Tariff.")}</small>;
                          })()}</label>
                        <label className="inventory-field"><span>{t("Made in")}</span>
                          {countrySelect(item.manufacturerCountry, code => updateItem(index, "manufacturerCountry", code), t("Made in"))}</label>
                        <label className="inventory-field"><span>{t("Net weight of one item (kg)")}</span>
                          <input className="input" type="number" min="0" step="any" inputMode="decimal" value={item.unitNetWeight} data-testid={`unit-net-weight-${index}`} onChange={e => updateItem(index, "unitNetWeight", e.target.value)} /></label>
                        <label className="inventory-field"><span>{t("Gross weight of one item (kg)")}</span>
                          <input className="input" type="number" min="0" step="any" inputMode="decimal" value={item.unitGrossWeight} placeholder={item.unitNetWeight} onChange={e => updateItem(index, "unitGrossWeight", e.target.value)} />
                          {!item.unitGrossWeight.trim() && item.unitNetWeight.trim() ? <small className="shipment-muted">{t("Left empty, the net weight is used.")}</small> : null}</label>
                        {(() => {
                          // S6: what DHL gets for this line, as the server works it out.
                          const quantity = asNumber(item.quantity);
                          const unit = asNumber(item.unitNetWeight);
                          const total = lineWeightKg(quantity, unit);
                          if (total !== null && quantity !== null && unit !== null) {
                            return <p className="shipment-muted is-wide" data-testid={`line-weight-${index}`}>{t("Line total sent to DHL: {quantity} × {unit} kg = {total} kg").replace("{quantity}", quantity.toLocaleString(locale)).replace("{unit}", kgText(unit, locale)).replace("{total}", kgText(total, locale))}</p>;
                          }
                          const saved = asNumber(item.netWeight);
                          if (!item.unitNetWeight.trim() && saved !== null) {
                            return <p className="shipment-note is-wide" data-testid={`line-weight-legacy-${index}`}>{t("Saved earlier as the line's total: {total} kg. Type the weight of one item to replace it.").replace("{total}", kgText(saved, locale))}</p>;
                          }
                          return null;
                        })()}
                        <div className="shipment-subhead is-wide">{t("Product codes")}</div>
                        {productIdsRequired
                          ? <p className="shipment-muted is-wide" data-testid="product-codes-why">{t("* Required by EU customs: from 1 November 2026, every line of a consumer shipment into the EU needs at least your product code and the manufacturer's product code (EU rule 2026/1022). DHL asks for them on every such shipment, whatever its value. MyDHL+ shows the same fields without a star.")}</p>
                          : <p className="shipment-muted is-wide">{t("Needed on shipments to consumers in the EU from 1 November 2026. Optional here.")}</p>}
                        {productIdSuggestions.length > 0 ? (
                          <label className="inventory-field is-wide"><span>{t("Fill this line from…")}</span>
                            <select className="input" value="" onChange={e => { const chosen = productIdSuggestions[Number(e.target.value)]; if (chosen) applySuggestion(index, chosen); }}>
                              <option value="">{t("Choose…")}</option>
                              {productIdSuggestions.map((suggestion, i) => <option key={i} value={i}>{suggestionLabel(suggestion)}</option>)}
                            </select></label>
                        ) : null}
                        <label className="inventory-field"><span>{t("Your product code (SKU)")}{productIdsRequired ? " *" : ""}</span>
                          <input className="input" value={item.merchantProductId} onChange={e => updateItem(index, "merchantProductId", e.target.value)} />
                          <small className="shipment-muted">{t("In MyDHL+: {name}").replace("{name}", "Merchant Product ID")}</small></label>
                        <label className="inventory-field"><span>{t("Manufacturer's product code")}{productIdsRequired ? " *" : ""}</span>
                          <input className="input" value={item.manufacturerProductId} onChange={e => updateItem(index, "manufacturerProductId", e.target.value)} />
                          <small className="shipment-muted">{t("In MyDHL+: {name}").replace("{name}", "Non-standardized Manufacturer Product ID")}</small></label>
                        <label className="inventory-field"><span>{t("Barcode (GTIN/EAN/UPC), if any")}</span>
                          <input className="input" value={item.standardProductId} inputMode="numeric" onChange={e => updateItem(index, "standardProductId", e.target.value)} />
                          <small className="shipment-muted">{t("In MyDHL+: {name}").replace("{name}", "Standardized Manufacturer Product ID")}</small></label>
                        <label className="inventory-field shipment-check"><span>
                          <input type="checkbox" checked={item.standardProductIdAbsent && !item.standardProductId.trim()} disabled={Boolean(item.standardProductId.trim())} onChange={e => updateItem(index, "standardProductIdAbsent", e.target.checked)} />{" "}
                          {t("This product has no barcode (GTIN/EAN/UPC)")}</span></label>
                        <details className="shipment-item-eudr is-wide" open={Boolean(item.ddsReference || item.taricDocumentCode)}>
                          <summary>{t("EUDR references (only for goods the EU deforestation rules cover)")}</summary>
                          <div className="shipment-item-eudr-fields">
                          <label className="inventory-field"><span>{t("EUDR due-diligence reference (DDS)")}</span>
                            <input className="input" value={item.ddsReference} onChange={e => updateItem(index, "ddsReference", e.target.value)} />
                            <small className="shipment-muted">{t("In MyDHL+: {name}").replace("{name}", "Due Diligence Statement Reference Number")}</small></label>
                          <label className="inventory-field"><span>{t("TARIC document code")}</span>
                            {/* S7: HMRC's EUDR list, not free text; a code saved earlier that is not in it stays visible until changed. */}
                            <select className="input" value={item.taricDocumentCode} data-testid={`eudr-taric-${index}`} onChange={e => updateItem(index, "taricDocumentCode", e.target.value)}>
                              <option value="">—</option>
                              {item.taricDocumentCode && !isEudrTaricCode(item.taricDocumentCode) ? <option value={item.taricDocumentCode}>{item.taricDocumentCode}</option> : null}
                              {EUDR_TARIC_CODES.map(([code, name]) => <option key={code} value={code}>{`${code} – ${name}`}</option>)}
                            </select>
                            <small className="shipment-muted">{t("In MyDHL+: {name}").replace("{name}", "EUDR TARIC Document Code")}</small></label>
                          </div>
                        </details>
                        {item.prefillSource ? (
                          // S7: a filled line is checked line by line before the shipment can go (the server asks for this tick).
                          <div className="is-wide" data-testid={`line-check-${index}`}>
                            <p className="shipment-muted">{t("Description and product codes copied from: {source}. Check them. The HS code, origin and weight are not copied.").replace("{source}", t(SUGGESTION_SOURCE[item.prefillSource] ?? item.prefillSource))}</p>
                            <label className="inventory-check">
                              <input type="checkbox" checked={item.lineChecked} onChange={e => updateItem(index, "lineChecked", e.target.checked)} />
                              {t("I checked this line: description, HS code, origin and weight")}
                            </label>
                          </div>
                        ) : null}
                        <button type="button" className="inventory-link inventory-link-danger" onClick={() => { setItems(current => current.filter((_, i) => i !== index)); setDirty(true); setCustomsChanged(true); }}>{t("Remove line")}</button>
                      </div>
                    ))}
                    <button type="button" className="inventory-link" onClick={() => { setItems(current => [...current, emptyItem()]); setDirty(true); setCustomsChanged(true); }}>{t("+ Add a line")}</button>
                    {linesNetGrams > 0 && parcelsGrams > 0 ? (
                      <p className={linesNetGrams > parcelsGrams ? "shipment-error" : "shipment-muted"} data-testid="weights-total">
                        {t("Net weight of all lines: {lines} kg. Parcels: {parcels} kg.").replace("{lines}", kgText(linesNetGrams / 1000, locale)).replace("{parcels}", kgText(parcelsGrams / 1000, locale))}
                        {linesNetGrams > parcelsGrams ? ` ${t("The lines weigh more than the parcels. Check each line's weight of one item and the parcel weights.")}` : ""}
                      </p>
                    ) : null}
                    <p className="shipment-muted" data-testid="hs-code-rule">
                      {t("NivaDesk never fills in or confirms an HS code for you. If you are not sure of a code, HMRC can give a binding Advance Tariff Ruling.")}{" "}
                      <a className="inventory-link" href="https://www.trade-tariff.service.gov.uk/find_commodity" target="_blank" rel="noopener noreferrer">{t("Find a commodity code on the UK Trade Tariff")}</a>
                    </p>

                    <div className="shipment-total">
                      <span>{t("Total units")} <strong>{totalUnits.toLocaleString(locale)}</strong></span>
                      <span>{t("Total of the lines")} <strong data-testid="lines-total">{money(lineTotalCents)}</strong></span>
                      <label className="inventory-field"><span>{t("Declared value")}</span>
                        {moneyInput(declaredValue, value => change(setDeclaredValue, { customs: true })(value), "declared-value")}</label>
                      {lineTotalCents > 0 && declaredCents !== lineTotalCents ? (
                        <button type="button" className="inventory-link" onClick={() => change(setDeclaredValue, { customs: true })(amountText(lineTotalCents / 100, currency, locale))}>{t("Use the total of the lines")}</button>
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
            <label className="inventory-field"><span>{pickup.requested ? t("Ready for collection at") : t("Ready at")}</span>
              <input className="input" type="time" value={plannedTime} onChange={e => change(setPlannedTime)(e.target.value)} /></label>
          </div>
          {pickupSupported ? (
            <div className="shipment-pickup" data-testid="pickup">
              <label className="inventory-check">
                <input type="checkbox" checked={pickup.requested} onChange={e => change(setPickup)({ ...pickup, requested: e.target.checked })} />
                {t("Book a DHL courier to collect it")}
              </label>
              {/* S3: said before anyone books — NivaDesk has no courier cancellation (DHL's API has one; not built until proven on DHL's test system). */}
              <p className="shipment-note" data-testid="pickup-cancel-note">{t("NivaDesk cannot cancel a DHL courier booking. To cancel it, use the pickup number in MyDHL+ or contact DHL Express customer service. Cancelling the order in NivaDesk cancels neither the courier nor the label.")}</p>
              {pickup.requested ? (
                <>
                  <div className="inventory-form">
                    <label className="inventory-field"><span>{t("Latest collection time")}</span>
                      <input className="input" type="time" value={pickup.closeTime} aria-invalid={pickupTimesWrong ? true : undefined} onChange={e => change(setPickup)({ ...pickup, closeTime: e.target.value })} /></label>
                    <label className="inventory-field"><span>{t("Where to collect it (optional)")}</span>
                      <input className="input" maxLength={80} value={pickup.location} placeholder={t("Reception")} onChange={e => change(setPickup)({ ...pickup, location: e.target.value })} /></label>
                    <label className="inventory-field is-wide"><span>{t("Note for the courier (optional)")}</span>
                      <input className="input" maxLength={80} value={pickup.instructions} onChange={e => change(setPickup)({ ...pickup, instructions: e.target.value })} /></label>
                  </div>
                  {pickupTimesWrong ? <p className="shipment-error">{t("The latest collection time must be after the ready time.")}</p> : null}
                  {chosenWindow ? (
                    <p className="shipment-muted" data-testid="pickup-window">
                      {t("DHL collects between {from} and {to} on this day.").replace("{from}", chosenWindow.earliest || "—").replace("{to}", chosenWindow.latest || "—")}
                      {chosenWindow.cutoff ? ` ${t("For this service, the parcel must be handed over by {time}.").replace("{time}", chosenWindow.cutoff.slice(11, 16))}` : ""}
                    </p>
                  ) : (
                    <p className="shipment-muted">{t("Show DHL's services for this parcel to see when DHL can collect on this day.")}</p>
                  )}
                  {pickupOutsideWindow ? <p className="shipment-note" data-tone="warn">{t("These times are outside DHL's collection hours for this day. DHL may move or refuse the pickup.")}</p> : null}
                </>
              ) : null}
            </div>
          ) : null}
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
                      {product.price ? <> · <strong className="shipment-price">{formatShipmentPrice(product.price, locale)}</strong></> : null}
                      <small>
                        {product.estimatedDelivery ? `${t("Estimated delivery")} ${product.estimatedDelivery.replace("T", " ").slice(0, 16)}` : ""}
                        {product.totalTransitDays !== null ? ` · ${product.totalTransitDays === 1 ? t("1 day in transit") : t("{count} days in transit").replace("{count}", String(product.totalTransitDays))}` : ""}
                      </small>
                    </span>
                  </label>
                ))}
                {products.pieceCount > 1 ? <p className="shipment-muted">{t("DHL lists services for one parcel, the heaviest. It checks every parcel again when the label is created.")}</p> : null}
                {products.priceOutcome === "priced" ? <p className="shipment-muted">{t("Prices are DHL's quote for your account and every parcel, at the time of asking. Your DHL invoice can differ, for example with surcharges or duties.")}</p> : null}
                {products.priceOutcome === "unknown" ? <p className="shipment-muted">{t("DHL gave no prices this time. The services are still correct; ask again to see prices.")}</p> : null}
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
              {issues.map(issue => <li key={`${issue.code}:${issue.field}`}>{issueText(issue)}</li>)}
            </ul>
          ) : null}
          {issues.some(issue => issue.detail?.alternative === "mydhl_plus") ? (
            <p className="shipment-note" data-testid="mydhl-alternative">
              {t("Or create this shipment in MyDHL+ with the reference {reference}, then use “Find shipments made on MyDHL” on the order to link it.").replace("{reference}", orderReference)}
            </p>
          ) : null}
          <p className="shipment-muted" data-testid="mydhl-file-explain">
            {t("Download for MyDHL+ saves this draft and downloads it as a file for MyDHL+ ▸ Ship ▸ Upload a Shipment File (upload option “NivaDesk”). In MyDHL+ it becomes an unsent shipment under Manage Shipments, which you can edit, save for later or label there. NivaDesk sends nothing to DHL.")}{" "}
            <button type="button" className="inventory-link" data-testid="mydhl-file-button" disabled={Boolean(busy) || locked} onClick={() => void downloadForMyDhl()}>
              {busy === "mydhlfile" ? t("Preparing…") : t("Download for MyDHL+")}
            </button>
          </p>
          <p className="shipment-muted" data-testid="dhl-check-explain">{t("Check with DHL asks DHL to check these details without creating anything: no label, no waybill and no courier.")}</p>
          {dhlCheck && !dirty ? (() => {
            const view = dhlCheckView(dhlCheck);
            return (
              <div className="shipment-banner" data-tone={view.tone} data-testid="dhl-check-result" data-outcome={dhlCheck.outcome} role="status">
                <span>{view.text}</span>
                {dhlCheck.outcome === "valid" && pickupSupported && pickup.requested ? (
                  <span className="shipment-muted" data-testid="dhl-check-courier">{t("The courier is not part of this check. It is booked only when the label is created.")}</span>
                ) : null}
              </div>
            );
          })() : null}
          {pickupSupported && pickup.requested ? (
            <p className="shipment-muted" data-testid="create-with-pickup">
              {t("Creating the label sends this shipment to DHL once and books a DHL courier for {date}, between {from} and {to}. The order is not marked dispatched until DHL scans the parcel.")
                .replace("{date}", plannedDate ? new Date(`${plannedDate}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: "UTC" }) : "—")
                .replace("{from}", plannedTime || "—")
                .replace("{to}", pickup.closeTime || "—")}
            </p>
          ) : (
            <p className="shipment-muted">{t("Creating the label sends this shipment to DHL once. No pickup is booked, and the order is not marked dispatched until DHL scans the parcel.")}</p>
          )}
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
            <button type="button" className="inventory-secondary" data-testid="dhl-check-button" disabled={Boolean(busy) || locked || (!dirty && issues.length > 0)} onClick={() => void checkWithDhl()}>
              {busy === "dhlcheck" ? t("Checking with DHL…") : t("Check with DHL")}
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
