// Carrier shipping (DHL Express first) — the client half of the shipping callables
// (functions/shipping/callables.js).
//
// Nothing here reads or writes Firestore: shipments, drafts, the connection and
// its credentials are server-only (firestore.rules), and every answer is already
// filtered by the member's permissions on the server. A member without finance
// access gets no customs value from these calls, whatever the screen does.
//
// Every call names its workspace. The server answers `failed-precondition` with
// reason `dhl_not_enabled` until appConfig/shipping opens the workspace, so the
// screens ask getShippingConnection first and show nothing when it is off.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export type ShippingEnvironment = "test" | "production";

export type ShipperRegistration = { typeCode: string; number: string; issuerCountryCode: string };

export type ShipperProfile = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  provinceCode: string;
  countryCode: string;
  timeZone: string;
  registrationNumbers: ShipperRegistration[];
};

export type ShippingConnectionView = {
  carrier: "dhl_express";
  enabled: boolean;
  connected: boolean;
  environment?: ShippingEnvironment | "";
  /** Owner and admin only. */
  accountLast4?: string;
  dutiesAccountLast4?: string;
  shipperProfile?: ShipperProfile | null;
  profileComplete?: boolean;
};

export type ShipmentIssue = { code: string; field: string; detail?: Record<string, unknown> };

export type ShipmentAddress = {
  line1?: string; line2?: string; city?: string; postalCode?: string; provinceCode?: string; countryCode?: string;
};

export type ShipmentParty = {
  fullName?: string; companyName?: string; phone?: string; email?: string; address?: ShipmentAddress;
  registrationNumbers?: ShipperRegistration[];
};

export type ShipmentPiece = { weight: number | null; length: number | null; width: number | null; height: number | null };

export type CustomsItem = {
  description: string;
  quantity: number | null;
  quantityUnit: string;
  unitValue: number | null;
  hsCode: string;
  manufacturerCountry: string;
  netWeight: number | null;
  grossWeight: number | null;
};

export type ShipmentCustomsView = {
  declarable?: boolean | null;
  dutiesPayer: "" | "receiver" | "sender";
  incoterm: string;
  confirmed: boolean;
  // Only with finance access (the server leaves them out otherwise).
  declaredValue?: number | null;
  currency?: string;
  exportReasonType?: string;
  shipmentType?: "" | "personal" | "commercial";
  placeOfIncoterm?: string;
  invoice?: { number: string; date: string };
  items?: CustomsItem[];
};

export type ShipmentDraftView = {
  recipient?: ShipmentParty | null;
  pieces?: ShipmentPiece[];
  contentsDescription?: string;
  service?: { productCode?: string };
  planned?: { date?: string; time?: string; gmtOffset?: string; timeZone?: string } | null;
  shipper?: ShipmentParty | null;
  customs: ShipmentCustomsView;
};

export type ShipmentCreationState = "draft" | "in_progress" | "created" | "unknown" | "rejected" | "not_sent" | "invalid";

export type ShipmentDocumentType = "label" | "commercial_invoice";

export type OrderShipment = {
  id: string;
  carrier: string;
  direction: string;
  source: string;
  sequence: number;
  orderReference: string;
  status: string;
  statusText: string;
  statusAt: string | null;
  attention: boolean;
  trackingNumber: string;
  pieceCount: number;
  dutiesPayer: string;
  incoterm: string;
  declarable: boolean;
  creation: {
    state: ShipmentCreationState;
    attemptReference: string;
    documentsMissing: boolean;
    lastReconcile: { atMs: number; outcome: string; count?: number } | null;
    lastError: { title?: string; detail?: string; status?: number; additionalDetails?: string[] } | null;
    problems: ShipmentIssue[];
  };
  labelCreatedAtMs: number | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  documents: { type: ShipmentDocumentType | string; available: boolean; sizeBytes: number }[];
  draft?: ShipmentDraftView | null;
  issues?: ShipmentIssue[];
};

export type ShippingAbilities = {
  prepare: boolean;
  declareCustoms: boolean;
  senderPaysDuties: boolean;
  overrideIncoterm: boolean;
  openLabel: boolean;
  openCommercialInvoice: boolean;
};

export type OrderShipmentsResult = { shipments: OrderShipment[]; orderReference: string; can: ShippingAbilities };

export type ShipmentDraftPatch = {
  recipient?: ShipmentParty;
  shipper?: ShipmentParty;
  pieces?: ShipmentPiece[];
  contentsDescription?: string;
  service?: { productCode: string };
  planned?: { date: string; time: string };
  customs?: Partial<Omit<ShipmentCustomsView, "confirmed">> & { items?: CustomsItem[] };
};

export type CreateShipmentResult = {
  outcome: "created" | "invalid" | "rejected" | "not_sent" | "unknown" | "in_progress";
  shipmentId: string;
  trackingNumber?: string;
  repeated?: boolean;
  reconciled?: boolean;
  issues?: ShipmentIssue[];
  problems?: ShipmentIssue[];
  error?: { title?: string; detail?: string; additionalDetails?: string[] };
  reason?: string;
};

export type ReconcileResult = {
  outcome: "linked" | "none" | "several" | "error" | "conflict" | "not_needed";
  trackingNumber?: string;
  documentsMissing?: boolean;
  count?: number;
  transient?: boolean;
  state?: string;
};

export type ShipmentProduct = {
  productCode: string;
  productName: string;
  networkTypeCode: string;
  customerAgreementOnly: boolean;
  estimatedDelivery: string;
  totalTransitDays: number | null;
};

export type ShipmentProductsResult = {
  outcome: "found" | "none" | "invalid" | "rejected" | "unknown";
  products: ShipmentProduct[];
  problems: ShipmentIssue[];
  pieceCount: number;
  detail: string;
};

function call<Req extends Record<string, unknown>, Res>(name: string) {
  return httpsCallable<Req, Res>(functions, name);
}

// The connection read decides whether any DHL screen shows at all, so it is
// asked once per workspace and kept for a minute rather than on every order.
const connectionCache = new Map<string, { atMs: number; value: Promise<ShippingConnectionView> }>();

export function getShippingConnection(companyId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ShippingConnectionView> {
  const cached = connectionCache.get(companyId);
  if (!fresh && cached && Date.now() - cached.atMs < 60_000) return cached.value;
  const value = call<{ companyId: string }, ShippingConnectionView>("getShippingConnection")({ companyId })
    .then(result => result.data)
    .catch(error => {
      connectionCache.delete(companyId);
      throw error;
    });
  connectionCache.set(companyId, { atMs: Date.now(), value });
  return value;
}

function forgetConnection(companyId: string) {
  connectionCache.delete(companyId);
}

export async function saveShippingConnection(companyId: string, input: {
  environment: ShippingEnvironment; apiKey: string; apiSecret: string; accountNumber: string; dutiesAccountNumber?: string;
}): Promise<{ connected: boolean; environment: ShippingEnvironment; accountLast4: string }> {
  return withWebSyncStatus(async () => {
    const result = await call<Record<string, unknown>, { connected: boolean; environment: ShippingEnvironment; accountLast4: string }>("saveShippingConnection")({ companyId, ...input });
    forgetConnection(companyId);
    return result.data;
  }, "Checking with DHL…");
}

export async function saveShippingSenderProfile(companyId: string, profile: ShipperProfile): Promise<{ saved: boolean }> {
  return withWebSyncStatus(async () => {
    const result = await call<Record<string, unknown>, { saved: boolean }>("saveShippingSenderProfile")({ companyId, profile });
    forgetConnection(companyId);
    return result.data;
  });
}

export async function disconnectShippingConnection(companyId: string): Promise<{ connected: boolean }> {
  return withWebSyncStatus(async () => {
    const result = await call<Record<string, unknown>, { connected: boolean }>("disconnectShippingConnection")({ companyId });
    forgetConnection(companyId);
    return result.data;
  });
}

export async function listOrderShipments(companyId: string, orderId: string): Promise<OrderShipmentsResult> {
  return (await call<Record<string, unknown>, OrderShipmentsResult>("listOrderShipments")({ companyId, orderId })).data;
}

export async function startOrderShipment(companyId: string, orderId: string): Promise<{ shipmentId: string }> {
  return withWebSyncStatus(async () => (await call<Record<string, unknown>, { shipmentId: string }>("startOrderShipment")({ companyId, orderId })).data);
}

export async function saveOrderShipmentDraft(companyId: string, orderId: string, shipmentId: string, patch: ShipmentDraftPatch): Promise<{ issues: ShipmentIssue[] }> {
  return withWebSyncStatus(async () => (await call<Record<string, unknown>, { issues: ShipmentIssue[] }>("saveOrderShipmentDraft")({ companyId, orderId, shipmentId, patch })).data);
}

export async function confirmOrderShipmentCustoms(companyId: string, orderId: string, shipmentId: string): Promise<{ issues: ShipmentIssue[] }> {
  return withWebSyncStatus(async () => (await call<Record<string, unknown>, { issues: ShipmentIssue[] }>("confirmOrderShipmentCustoms")({ companyId, orderId, shipmentId })).data);
}

/** One request per click: the server holds a lock and never retries on its own. */
export async function createOrderShipment(companyId: string, orderId: string, shipmentId: string, acknowledgeSecondLabelRisk = false): Promise<CreateShipmentResult> {
  return withWebSyncStatus(
    async () => (await call<Record<string, unknown>, CreateShipmentResult>("createOrderShipment")({ companyId, orderId, shipmentId, acknowledgeSecondLabelRisk })).data,
    "Sending to DHL…"
  );
}

export async function reconcileOrderShipment(companyId: string, orderId: string, shipmentId: string): Promise<ReconcileResult> {
  return (await call<Record<string, unknown>, ReconcileResult>("reconcileOrderShipment")({ companyId, orderId, shipmentId })).data;
}

export async function openOrderShipmentDocument(companyId: string, orderId: string, shipmentId: string, type: ShipmentDocumentType): Promise<{ fileName: string; contentType: string; base64: string }> {
  return (await call<Record<string, unknown>, { fileName: string; contentType: string; base64: string }>("openOrderShipmentDocument")({ companyId, orderId, shipmentId, type })).data;
}

export async function refreshOrderShipmentTracking(companyId: string, orderId: string): Promise<{ synced: number; added: number }> {
  return (await call<Record<string, unknown>, { synced: number; added: number }>("refreshOrderShipmentTracking")({ companyId, orderId })).data;
}

export async function checkShipmentDutiesPaid(companyId: string, orderId: string, shipmentId: string): Promise<{ outcome: "available" | "unavailable" | "unknown"; service: string }> {
  return (await call<Record<string, unknown>, { outcome: "available" | "unavailable" | "unknown"; service: string }>("checkShipmentDutiesPaid")({ companyId, orderId, shipmentId })).data;
}

export type ExternalMatchResult = {
  outcome: "found" | "none" | "error";
  reference: string;
  linked: number;
  alreadyLinked: number;
  conflicts: number;
  trackingNumbers?: string[];
  transient?: boolean;
};

/** Shipments made on the MyDHL website for this order, found by its exact reference. */
export async function findOrderShipmentsOnDhl(companyId: string, orderId: string): Promise<ExternalMatchResult> {
  return (await call<Record<string, unknown>, ExternalMatchResult>("findOrderShipmentsOnDhl")({ companyId, orderId })).data;
}

export async function listShipmentProducts(companyId: string, orderId: string, shipmentId: string): Promise<ShipmentProductsResult> {
  return (await call<Record<string, unknown>, ShipmentProductsResult>("listShipmentProducts")({ companyId, orderId, shipmentId })).data;
}

/** The server's stable reason for a refusal (HttpsError details.reason), or "". */
export function shippingErrorReason(error: unknown): string {
  const details = (error as { details?: unknown } | null)?.details;
  const reason = details && typeof details === "object" ? (details as { reason?: unknown }).reason : undefined;
  return typeof reason === "string" ? reason : "";
}

// Each server reason, in the words the screen uses. English is the key; the
// translations live in language.ts (SHIPPING_TRANSLATIONS).
const REASON_MESSAGES: Record<string, string> = {
  dhl_not_enabled: "DHL Express is not available for this workspace yet.",
  not_connected: "Connect DHL Express in Settings ▸ Integrations first.",
  owner_only: "Only the workspace owner can connect or disconnect DHL Express.",
  manager_only: "Only an owner or admin can change the sender details.",
  not_allowed: "Your role cannot do this with shipments.",
  not_assigned: "This order is not assigned to you.",
  order_not_found: "This order could not be found.",
  shipment_not_found: "This shipment could not be found.",
  not_editable: "This shipment has been sent to DHL and can no longer be edited.",
  customs_not_allowed: "Declaring goods needs access to financial information.",
  sender_duties_not_allowed: "Only an owner or admin can make the sender pay destination duties.",
  shipper_not_allowed: "Only an owner or admin can change the sender details.",
  label_not_allowed: "Your role cannot open shipping labels.",
  invoice_not_allowed: "The commercial invoice needs access to financial information.",
  document_missing: "That document is not stored for this shipment.",
  credentials_missing: "Enter the DHL API key and secret.",
  credentials_rejected: "DHL did not accept this API key and secret.",
  account_invalid: "Enter the DHL Express account number (digits only).",
  duties_account_invalid: "The duties account number is not valid.",
  environment_invalid: "Choose the DHL test or production environment.",
  dhl_unreachable: "DHL could not be reached to check the key. Try again.",
  no_token_key: "Carrier credentials cannot be stored on this server yet.",
  credentials_unreadable: "The stored DHL credentials cannot be read. Connect DHL Express again.",
  profile_invalid: "The sender details are not complete.",
  reference_taken: "That reference already belongs to another shipment.",
  internal: "The shipping request failed. Try again."
};

export function shippingErrorMessage(error: unknown, t: (text: string) => string): string {
  const reason = shippingErrorReason(error);
  if (reason && REASON_MESSAGES[reason]) return t(REASON_MESSAGES[reason]);
  return t("The shipping request failed. Try again.");
}

// What stops a draft from being sent, one sentence per issue code
// (functions/shipping/draft.js, dhl/request.js and dhl/adapter.js).
const ISSUE_MESSAGES: Record<string, string> = {
  recipient_name_missing: "Add the recipient's name.",
  recipient_phone_missing: "Add the recipient's phone number.",
  recipient_address_missing: "Add the recipient's street address.",
  recipient_city_missing: "Add the recipient's city.",
  recipient_country_missing: "Choose the recipient's country.",
  recipient_route_incomplete: "Add the recipient's city and country.",
  shipper_profile_incomplete: "The sender details are incomplete. An owner or admin completes them in Settings ▸ Integrations ▸ DHL Express.",
  shipper_route_incomplete: "The sender's city and country are missing.",
  freight_payer_missing: "Choose who pays for the transport.",
  product_missing: "Choose a DHL service.",
  no_pieces: "Add at least one parcel.",
  piece_weight_invalid: "Every parcel needs a weight.",
  piece_weight_needed: "Add the parcel's weight.",
  piece_dimensions_invalid: "Give all three dimensions of a parcel, or none.",
  piece_dimensions_needed: "Add the parcel's length, width and height to see DHL's services.",
  contents_description_missing: "Describe what is in the parcel.",
  declarable_not_chosen: "Say whether this shipment is goods (customs declaration) or documents.",
  duties_payer_not_chosen: "Choose who pays destination duties and taxes.",
  incoterm_invalid: "Choose a valid incoterm.",
  incoterm_override_not_allowed: "Only an owner or admin can change the incoterm from what the duties payer implies.",
  sender_pays_needs_ddp: "When the sender pays duties, the incoterm must be DDP.",
  receiver_pays_cannot_be_ddp: "When the receiver pays duties, the incoterm cannot be DDP.",
  currency_missing: "Choose the currency of the declared value.",
  declared_value_missing: "Enter the declared customs value.",
  export_reason_invalid: "Choose the reason for export.",
  shipment_type_missing: "Say whether this is a personal or a commercial shipment.",
  invoice_number_missing: "Add the invoice number.",
  invoice_date_missing: "Add the invoice date.",
  no_customs_items: "Add at least one line to the declaration.",
  item_description_missing: "Every line needs a description.",
  item_quantity_invalid: "Every line needs a quantity above zero.",
  item_unit_invalid: "Every line needs a unit.",
  item_value_missing: "Every line needs a value.",
  item_hs_code_missing: "Every line needs an HS code (6 to 10 digits).",
  item_origin_missing: "Every line needs its country of origin.",
  item_net_weight_invalid: "Every line needs a net weight.",
  item_gross_weight_invalid: "Every line needs a gross weight at least equal to its net weight.",
  declared_value_mismatch: "The declared value must equal the total of the lines.",
  customs_not_confirmed: "Confirm the customs declaration.",
  planned_date_invalid: "Choose a valid shipping date and time.",
  too_long: "One of the fields is longer than DHL accepts.",
  account_missing: "The DHL account number is missing from the connection.",
  shipment_not_found: "This shipment could not be found."
};

export function shipmentIssueMessage(issue: ShipmentIssue, t: (text: string) => string): string {
  return t(ISSUE_MESSAGES[issue.code] ?? "Something in this shipment needs attention.");
}

/**
 * Show a PDF the server returned, without storing it anywhere.
 *
 * `target` is a tab the caller opened while the click was still the person's
 * (window.open("") straight in the handler), so no pop-up blocker stops it; the
 * PDF goes into it once the server has answered. Without one, or if it was
 * closed, the PDF is downloaded instead. (A tab opened with "noopener" cannot
 * be used here: window.open then returns null even when it opened.)
 */
export function openShipmentPdf(document: { fileName: string; contentType: string; base64: string }, target: Window | null = null) {
  const bytes = Uint8Array.from(atob(document.base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: document.contentType || "application/pdf" }));
  if (target && !target.closed) {
    target.location.href = url;
  } else {
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.fileName;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * DHL's thirteen export reasons, exactly as its contract spells them
 * (functions/shipping/dhl/contract-snapshot.json, enums.exportReasonTypes), with
 * the words the screen shows. The common ones for a workshop come first.
 */
export const EXPORT_REASONS: { value: string; label: string }[] = [
  { value: "commercial_purpose_or_sale", label: "Sale" },
  { value: "return_to_origin", label: "Return to origin" },
  { value: "return", label: "Return" },
  { value: "warranty_replacement", label: "Warranty replacement" },
  { value: "gift", label: "Gift" },
  { value: "sample", label: "Sample" },
  { value: "personal_belongings_or_personal_use", label: "Personal belongings or personal use" },
  { value: "temporary", label: "Temporary export" },
  { value: "permanent", label: "Permanent export" },
  { value: "intercompany_use", label: "Use within the same company" },
  { value: "used_exhibition_goods_to_origin", label: "Exhibition goods going back" },
  { value: "diplomatic_goods", label: "Diplomatic goods" },
  { value: "defence_material", label: "Defence material" }
];

/** A short list of DHL's quantity units (all in enums.quantityUnits). */
export const QUANTITY_UNITS: { value: string; label: string }[] = [
  { value: "PCS", label: "Pieces" },
  { value: "SET", label: "Sets" },
  { value: "PRS", label: "Pairs" },
  { value: "BOX", label: "Boxes" },
  { value: "DOZ", label: "Dozens" },
  { value: "KG", label: "Kilograms" },
  { value: "GM", label: "Grams" },
  { value: "M", label: "Metres" },
  { value: "CM", label: "Centimetres" },
  { value: "LTR", label: "Litres" }
];

/** DHL's registration number types (enums.registrationTypes), EORI and VAT first. */
export const REGISTRATION_TYPES: string[] = ["EOR","VAT","EIN","SSN","DUN","FED","STA","CNP","IE","INN","KPP","OGR","OKP","MRN","SDT","FTZ","DAN","TAN","DTF","RGP","NID","PAS","IMS","EIC","FTN","CIC","PEP","FII","FSR"];
