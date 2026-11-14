// Royal Mail Click & Drop — the client half of functions/shipping/royalmail/callables.js.
//
// Nothing here reads or writes Firestore: the connection, its key and every shipment live under
// the server-only royalMail/{companyId} (firestore.rules' catch-all), and every answer is already
// filtered by the member's permissions. A member without financial access gets no price.
//
// The server answers `failed-precondition` with reason `royal_mail_not_enabled` until
// appConfig/shipping.royalMail opens the workspace, so the screens ask getRoyalMailConnection
// first and show nothing when it is off.
//
// Two kinds of Click & Drop account, decided by Royal Mail, read when the key is saved:
//   "olp"     pay-as-you-go: NivaDesk sends the order with Royal Mail's online price; the label is
//             paid for and printed in Click & Drop, and its tracking number comes back here;
//   "account" a Royal Mail business account (OBA): the label PDF comes to NivaDesk.
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type RoyalMailAccountType = "olp" | "account" | "unknown" | "";

export type RoyalMailConnectionView = {
  carrier: "royal_mail";
  enabled: boolean;
  connected: boolean;
  accountType?: RoyalMailAccountType;
  /** "key_rejected" when Royal Mail stopped accepting the saved key. */
  attention?: string;
  /** Owner and admin only. */
  keyLast4?: string;
  tradingName?: string;
};

export type RoyalMailPackageFormat = "letter" | "largeLetter" | "smallParcel" | "mediumParcel" | "parcel";

export const ROYAL_MAIL_PACKAGE_FORMATS: { id: RoyalMailPackageFormat; label: string; hint: string }[] = [
  { id: "largeLetter", label: "Large letter", hint: "Up to 35 × 25 × 2.5 cm, 750 g" },
  { id: "smallParcel", label: "Small parcel", hint: "Up to 45 × 35 × 16 cm, 2 kg" },
  { id: "mediumParcel", label: "Medium parcel", hint: "Up to 61 × 46 × 46 cm, 20 kg" },
  { id: "letter", label: "Letter", hint: "Up to 24 × 16.5 × 0.5 cm, 100 g" },
  { id: "parcel", label: "Large parcel", hint: "Bigger than a medium parcel" }
];

export type RoyalMailService = {
  serviceCode: string;
  serviceName: string;
  brand?: string;
  serviceLevel?: string;
  packageFormat?: string;
  minWeightGrams?: number;
  maxWeightGrams?: number;
  /** Royal Mail's price as its API returns it (`cost`), and the VAT it names (`vatCost`). Whether
   *  `cost` already contains the VAT is read on the first real account (royal-mail.md RM-5), so the
   *  screens show both without adding them up. null without financial access or on a business account. */
  cost: number | null;
  vatCost: number | null;
};

export type RoyalMailShipmentState = "sending" | "sent" | "label" | "dispatched" | "unknown" | "cancelled" | "rejected" | "not_sent";

export type RoyalMailShipment = {
  id: string;
  carrier: "royal_mail";
  orderId: string;
  state: RoyalMailShipmentState;
  accountType: RoyalMailAccountType;
  serviceCode: string;
  serviceName: string;
  packageFormat: string;
  weightGrams: number;
  orderIdentifier: number | null;
  reference: string;
  trackingNumber: string;
  trackingUrl: string;
  printedOn: string;
  shippedOn: string;
  manifestedOn: string;
  hasLabel: boolean;
  /** Found already in Click & Drop (its own shop import) and linked, not created. */
  linked: boolean;
  problems: { code: string; message?: string; fields?: string[] }[];
  /** An Etsy order: the buyer's e-mail and phone were not given to Royal Mail. */
  contactWithheld: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  cost?: number | null;
  vatCost?: number | null;
  /** Whether Royal Mail tells the customer about the delivery (absent from an older server). */
  recipientNotified?: boolean;
  /** Royal Mail refused the notification for this service and the order went without it. */
  notificationsDropped?: boolean;
  /** Sent abroad with a customs declaration (absent from a server from before 14 Nov 2026). */
  international?: boolean;
  destinationCountry?: string;
  customsCategory?: string;
  customsLines?: number;
};

export type RoyalMailChoice = {
  packageFormat: RoyalMailPackageFormat;
  weightGrams: number;
  serviceCode: string;
  serviceName: string;
  signature: boolean;
  safePlace: string;
  notifyRecipient: boolean;
  /** Abroad only; the server drops it for a UK address. */
  customs?: RoyalMailCustoms;
  /** The USA only: the sender's own phone or e-mail. */
  senderContact?: { phone: string; email: string };
  /** What the customer paid for shipping, when the person typed it; absent, the server uses the order's own figure. */
  shippingCharged?: number | string;
};

export * from "./royalMailRules";
import { customsLineField, type RoyalMailAmounts, type RoyalMailCustoms, type RoyalMailDestination, type RoyalMailPrefillLine } from "./royalMailRules";

/** listRoyalMailServices: the services, and what the form starts from (the last three absent from an older server). */
export type RoyalMailServicesAnswer = {
  accountType: RoyalMailAccountType; services: RoyalMailService[]; guidance: string;
  destination?: RoyalMailDestination; amounts?: RoyalMailAmounts | null; prefillLines?: RoyalMailPrefillLine[];
};

/** Click & Drop's own orders screen, where a pay-as-you-go account pays for and prints the label. */
export const CLICK_AND_DROP_URL = "https://business.parcel.royalmail.com/orders/";
/** Where a business creates the API key NivaDesk needs (Click & Drop ▸ Settings ▸ Integrations). */
export const CLICK_AND_DROP_SIGN_UP_URL = "https://parcel.royalmail.com/click-and-drop";

function call<Req extends Record<string, unknown>, Res>(name: string) {
  return httpsCallable<Req, Res>(functions, name);
}

// The connection decides whether any Royal Mail screen shows at all: asked once per workspace a minute.
const connectionCache = new Map<string, { atMs: number; value: Promise<RoyalMailConnectionView> }>();

export function getRoyalMailConnection(companyId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<RoyalMailConnectionView> {
  const cached = connectionCache.get(companyId);
  if (!fresh && cached && Date.now() - cached.atMs < 60_000) return cached.value;
  const value = call<{ companyId: string }, RoyalMailConnectionView>("getRoyalMailConnection")({ companyId })
    .then(result => result.data)
    .catch(error => {
      connectionCache.delete(companyId);
      throw error;
    });
  connectionCache.set(companyId, { atMs: Date.now(), value });
  return value;
}

export async function saveRoyalMailConnection(companyId: string, input: { apiKey: string; tradingName: string }): Promise<{ connected: boolean; accountType: RoyalMailAccountType; keyLast4: string }> {
  connectionCache.delete(companyId);
  return (await call<Record<string, unknown>, { connected: boolean; accountType: RoyalMailAccountType; keyLast4: string }>("saveRoyalMailConnection")({ companyId, ...input })).data;
}

export async function disconnectRoyalMailConnection(companyId: string): Promise<{ connected: boolean }> {
  connectionCache.delete(companyId);
  return (await call<Record<string, unknown>, { connected: boolean }>("disconnectRoyalMailConnection")({ companyId })).data;
}

export async function listRoyalMailServices(companyId: string, orderId: string, packageFormat: RoyalMailPackageFormat, weightGrams: number): Promise<RoyalMailServicesAnswer> {
  return (await call<Record<string, unknown>, RoyalMailServicesAnswer>("listRoyalMailServices")({ companyId, orderId, packageFormat, weightGrams })).data;
}

export async function listOrderRoyalMailShipments(companyId: string, orderId: string): Promise<RoyalMailShipment[]> {
  return (await call<Record<string, unknown>, { shipments: RoyalMailShipment[] }>("listOrderRoyalMailShipments")({ companyId, orderId })).data.shipments || [];
}

export async function sendOrderToRoyalMail(companyId: string, orderId: string, choice: RoyalMailChoice): Promise<{ outcome: "sent" | "linked" | "existing" | "unknown"; shipment: RoyalMailShipment }> {
  return (await call<Record<string, unknown>, { outcome: "sent" | "linked" | "existing" | "unknown"; shipment: RoyalMailShipment }>("sendOrderToRoyalMail")({ companyId, orderId, choice })).data;
}

export async function refreshOrderRoyalMail(companyId: string, orderId: string): Promise<{ synced: number; shipments: RoyalMailShipment[] }> {
  return (await call<Record<string, unknown>, { synced: number; shipments: RoyalMailShipment[] }>("refreshOrderRoyalMail")({ companyId, orderId })).data;
}

export async function cancelRoyalMailShipment(companyId: string, orderId: string, shipmentId: string): Promise<{ outcome: string }> {
  return (await call<Record<string, unknown>, { outcome: string }>("cancelRoyalMailShipment")({ companyId, orderId, shipmentId })).data;
}

export async function openRoyalMailLabel(companyId: string, orderId: string, shipmentId: string): Promise<{ fileName: string; contentType: string; base64: string }> {
  return (await call<Record<string, unknown>, { fileName: string; contentType: string; base64: string }>("openRoyalMailLabel")({ companyId, orderId, shipmentId })).data;
}

/** The server's stable reason for a refusal (HttpsError details.reason), or "". */
export function royalMailErrorReason(error: unknown): string {
  const details = (error as { details?: unknown } | null)?.details;
  const reason = details && typeof details === "object" ? (details as { reason?: unknown }).reason : undefined;
  return typeof reason === "string" ? reason : "";
}

// Each server reason, in the words the screens use. English is the key; the translations are in
// royalMailTranslations.ts (merged in language.ts).
const REASON_MESSAGES: Record<string, string> = {
  royal_mail_not_enabled: "Royal Mail is not available for this workspace yet.",
  not_connected: "Connect Royal Mail in Settings ▸ Integrations first.",
  owner_only: "Only the workspace owner can connect or disconnect Royal Mail.",
  key_invalid: "Paste the Click & Drop API key exactly as Click & Drop shows it.",
  key_rejected: "Royal Mail did not accept this API key. Create a new one in Click & Drop and connect again.",
  royal_mail_unreachable: "Royal Mail could not be reached. Nothing was sent; try again.",
  credentials_unreadable: "The stored Royal Mail key cannot be read. Connect Royal Mail again.",
  no_token_key: "Carrier credentials cannot be stored on this server yet.",
  not_allowed: "Your role cannot send parcels.",
  not_assigned: "This order is not assigned to you.",
  order_not_found: "This order could not be found.",
  shipment_not_found: "This shipment could not be found.",
  choice_invalid: "Choose the package, its weight and a service.",
  customs_incomplete: "The customs details for this parcel are not complete.",
  recipient_incomplete: "This order's delivery address cannot go to Royal Mail from NivaDesk yet.",
  royal_mail_rejected: "Royal Mail did not accept this order.",
  label_exists: "This order already has a label. Cancel it in Click & Drop.",
  cancel_failed: "Royal Mail did not remove the order. Try again, or remove it in Click & Drop.",
  label_in_click_and_drop: "Print this label in Click & Drop: Royal Mail gives labels to NivaDesk for business accounts only.",
  label_unavailable: "The label is not ready yet. Try again in a minute.",
  internal: "The Royal Mail request failed. Try again."
};

export function royalMailErrorMessage(error: unknown, t: (text: string) => string): string {
  const reason = royalMailErrorReason(error);
  if (reason && REASON_MESSAGES[reason]) return t(REASON_MESSAGES[reason]);
  return t("The Royal Mail request failed. Try again.");
}

// What stops an order going to Royal Mail from NivaDesk (functions/shipping/royalmail/contract.js).
const PROBLEM_MESSAGES: Record<string, string> = {
  "required:recipient.name": "Add the recipient's name.",
  "required:recipient.addressLine1": "Add the recipient's street address.",
  "required:recipient.city": "Add the recipient's city.",
  // From a server from before 14 Nov 2026 only.
  "uk_only:recipient.country": "Royal Mail from NivaDesk sends within the UK for now. Send this one from Click & Drop.",
  "country_unknown:recipient.country": "NivaDesk does not recognise this order's country. Choose the country in the delivery address above.",
  "required:customs.category": "Choose what the parcel contains.",
  "customs_required:customs.items": "Add at least one customs line: what is in the parcel.",
  "customs_weight_over:customs.items": "The items weigh more than the parcel. Check the parcel's weight and the weight of each item.",
  "ioss_invalid:customs.iossNumber": "An IOSS number is IM followed by 10 digits.",
  "required:senderContact": "Add your own phone number or e-mail: Royal Mail asks for one on parcels to the USA.",
  "weight_invalid:weightGrams": "Type the parcel's weight in grams.",
  "shipping_invalid:shippingCharged": "Type the shipping the customer paid as a number, or leave it empty.",
  "postcode_invalid:recipient.postcode": "Add a valid UK postcode.",
  "ni_business:recipient.company": "A business in Northern Ireland needs customs details. Send this one from Click & Drop."
};

// What a customs line is missing, by the line's own field (customs.items[2].hsCode → "hsCode").
const LINE_PROBLEM_MESSAGES: Record<string, string> = {
  "required:description": "Say what the item is.",
  "quantity_invalid:quantity": "The quantity must be 1 or more.",
  "value_invalid:unitValue": "Add the value of one item.",
  "weight_invalid:unitWeightGrams": "Add the weight of one item in grams.",
  "required:hsCode": "Add the customs (HS) code.",
  "hs_invalid:hsCode": "A customs (HS) code is 6 to 10 digits.",
  "required:manufacturerCountry": "Choose the country the item was made in.",
  "country_unknown:manufacturerCountry": "Choose the country the item was made in.",
  "required:merchantProductId": "Add your product code (SKU): the EU asks for it on goods that were sold."
};

export function royalMailProblemMessages(error: unknown, t: (text: string) => string): string[] {
  const details = (error as { details?: { problems?: { code: string; field?: string; message?: string }[] } } | null)?.details;
  const problems = Array.isArray(details?.problems) ? details!.problems : [];
  return problems.map(problem => {
    const known = PROBLEM_MESSAGES[`${problem.code}:${problem.field || ""}`];
    if (known) return t(known);
    const line = customsLineField(problem.field || "");
    const lineMessage = line ? LINE_PROBLEM_MESSAGES[`${problem.code}:${line.field}`] : undefined;
    if (line && lineMessage) return `${t("Customs line {n}:").replace("{n}", String(line.line))} ${t(lineMessage)}`;
    // Royal Mail's own sentence (royal_mail_rejected) is passed on as Royal Mail wrote it.
    return problem.message || t("Check this field.");
  });
}

/** "£3.13 (VAT £0.62)" in the workspace's locale: Royal Mail's two figures, not added up (see RoyalMailService). */
export function royalMailPrice(service: Pick<RoyalMailService, "cost" | "vatCost">, locale: string, t: (text: string) => string): string {
  if (service.cost == null) return "";
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "GBP" }).format(n);
  return service.vatCost ? `${money(service.cost)} (${t("VAT")} ${money(service.vatCost)})` : money(service.cost);
}
