// A NivaDesk DHL shipment draft as a file for MyDHL+ ▸ Ship ▸ "Upload a Shipment File" (owner's request,
// 3 and 5 Nov 2026: "when we save here, it should be an editable draft on DHL's page too").
//
// Why a file: MyDHL API 3.3.2 has no saved-shipment or draft call — POST /shipments makes a real shipment
// with a waybill and a label. MyDHL+'s own upload does what was asked: "After uploading, you'll find your
// new shipments in Manage Shipments – where you can complete and print labels, or edit and even save for
// later." Nothing in this module talks to DHL; the person uploads the file in MyDHL+ themselves.
//
// The file: CSV, comma-separated, every value in double quotes, UTF-8, a header row with DHL's own field
// names in the order of the saved MyDHL+ upload option "NivaDesk" (one mapping, made once per MyDHL+
// login). ONE ROW PER SHIPMENT, with the FIRST customs line: MyDHL+'s upload has one set of item fields and made
// a separate shipment of every row (two rows with the same reference = "2 of 2 shipment(s) created", 5 Nov 2026),
// so further lines are added in MyDHL+ (the dialog says so; myDhlUploadExtraLines). Lines are never merged into
// one: different HS codes on one line would be a wrong declaration. The sender is not in the file: MyDHL+ takes
// it from its address book for the upload, and the DHL account is picked at upload.
// Shipment Reference 1 is the order's reference (NVD-…), so a label made later in MyDHL+ is found and
// linked by "Find shipments made on MyDHL" on the order.
//
// Pure: the same function runs in the dialog and in scripts/check-mydhl-upload-file.mts.

import { splitPhone, callingCodeFor } from "./dhlPhone";
import type { ShipmentDraftPatch, CustomsItem } from "./shipping";

/** DHL's field names, in the column order of the MyDHL+ upload option "NivaDesk". */
export const MYDHL_UPLOAD_COLUMNS = [
  "Shipment Reference 1",
  "Name (Ship TO)",
  "Company (Ship TO)",
  "Address 1 (Ship TO)",
  "Address 2 (Ship TO)",
  "City (Ship TO)",
  "ZIP/Postal Code (Ship TO)",
  "State/Province Code (Ship TO)",
  "Country Code (Ship TO)",
  "Phone Country Code (Ship TO)",
  "Phone Number (Ship TO)",
  "Email Address (Ship TO)",
  "Shipment Date (YYYYMMDD)",
  "Total Shipment Pieces",
  "Total Weight",
  "Piece Length",
  "Piece Width",
  "Piece Height",
  "Product Code (Global)",
  "Product Code (3 Letter)",
  "Summary of Contents",
  "Shipment Type",
  "Declared Value",
  "Declared Value Currency",
  // The incoterm. ("Terms of Payment" is another field: the first upload asked "Customs Terms of Trade Required".)
  "Trade Term",
  "Invoice Number",
  "Invoice Date (YYYYMMDD)",
  "Reason for Export",
  "Item Description",
  "Commodity Code",
  "Country of Origin (Customs Invoice)",
  "Quantity",
  "Item Units",
  "Item Value",
  "Item Value Currency",
  "Net Weight",
  "Gross Weight",
  // Required by MyDHL+'s mapping; left empty: the account is picked for the whole file at upload.
  "Account Number (Shipper)",
  // MyDHL+ asks for the state's name as well as its code (US: "State/Province (Ship TO) - Required", second upload).
  "State/Province (Ship TO)"
] as const;

export type MyDhlUploadColumn = (typeof MYDHL_UPLOAD_COLUMNS)[number];

/**
 * How NivaDesk's values are written for MyDHL+'s upload. Kept in one place: what MyDHL+ accepts for
 * these fields was read from its own upload (validation messages), not from a published table.
 */
export const MYDHL_UPLOAD_VALUES = {
  /** "Shipment Type": a declared (non-document) package or documents. */
  shipmentType: { goods: "P", documents: "D" } as Record<"goods" | "documents", string>,
  /**
   * "Product Code (3 Letter)": DHL's local product code for the global one NivaDesk keeps (service.productCode).
   * Only pairs DHL's own material gives (P = WPX is MyDHL API 3.3.2's example); another code stays empty and the
   * service is chosen in MyDHL+.
   */
  localProductCode: { P: "WPX", D: "DOX", U: "ECX", K: "TDK", E: "TDE", T: "TDT", Y: "TDY", H: "ESI", W: "ESU", N: "DOM" } as Record<string, string>,
  /**
   * "State/Province (Ship TO)": the name for the code NivaDesk keeps. MyDHL+ refused "NY" there with
   * "Invalid ZIP/Postal Code" and took "New York" (uploads of 5 Nov 2026). US and Canada are written out; any
   * other country gets the code, which MyDHL+ may ask to correct (the shipment is still created, to edit there).
   */
  stateName: {
    US: { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", AA: "Armed Forces Americas", AE: "Armed Forces Europe", AP: "Armed Forces Pacific" },
    CA: { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" }
  } as Record<string, Record<string, string>>,
  /** "Reason for Export": NivaDesk's reason as DHL's MyDHL+ list words it. */
  exportReason: {
    commercial_purpose_or_sale: "Sale",
    return_to_origin: "Return to origin",
    return: "Return",
    warranty_replacement: "Warranty replacement",
    gift: "Gift",
    sample: "Sample",
    personal_belongings_or_personal_use: "Personal belongings or personal use",
    temporary: "Temporary",
    permanent: "Permanent",
    intercompany_use: "Intercompany use",
    used_exhibition_goods_to_origin: "Used exhibition goods to origin",
    diplomatic_goods: "Diplomatic goods",
    defence_material: "Defence material"
  } as Record<string, string>
};

const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");
/** "2026-11-05" → "20261105"; anything else → "". */
const ymd = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value).replace(/-/g, "") : "");
/** Numbers as DHL reads them: a dot, no grouping, no trailing zeros beyond what was typed. */
const num = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "");

export type MyDhlUploadInput = {
  /** The order's reference, NVD-…: Shipment Reference 1. */
  orderReference: string;
  /** The draft as the dialog saves it (buildPatch): the recipient's e-mail is already withheld on an Etsy order. */
  draft: ShipmentDraftPatch;
};

/** Customs lines the file cannot carry (all but the first); the person adds them in MyDHL+. */
export function myDhlUploadExtraLines(draft: ShipmentDraftPatch): number {
  const customs = draft.customs ?? {};
  return customs.declarable === true ? Math.max(0, (customs.items ?? []).length - 1) : 0;
}

/** The file's two rows: the header, then the shipment. Without a customs declaration the line columns stay empty. */
export function myDhlUploadRows({ orderReference, draft }: MyDhlUploadInput): string[][] {
  const recipient = draft.recipient ?? {};
  const address = recipient.address ?? {};
  const country = text(address.countryCode).toUpperCase();
  const phone = splitPhone(text(recipient.phone), country);
  const phoneCountry = callingCodeFor(phone.country || country);
  const pieces = (draft.pieces ?? []).filter(p => typeof p.weight === "number" && p.weight > 0);
  const totalWeight = pieces.reduce((sum, p) => sum + (p.weight ?? 0), 0);
  const onePiece = pieces.length === 1 ? pieces[0] : null;
  const customs = draft.customs ?? {};
  const declared = customs.declarable === true;
  const company = text(recipient.companyName) || text(recipient.fullName);
  const shipment: Partial<Record<MyDhlUploadColumn, string>> = {
    "Shipment Reference 1": text(orderReference),
    "Name (Ship TO)": text(recipient.fullName),
    "Company (Ship TO)": company,
    "Address 1 (Ship TO)": text(address.line1),
    "Address 2 (Ship TO)": text(address.line2),
    "City (Ship TO)": text(address.city),
    "ZIP/Postal Code (Ship TO)": text(address.postalCode),
    "State/Province Code (Ship TO)": text(address.provinceCode).toUpperCase(),
    "State/Province (Ship TO)": MYDHL_UPLOAD_VALUES.stateName[country]?.[text(address.provinceCode).toUpperCase()] ?? text(address.provinceCode).toUpperCase(),
    "Country Code (Ship TO)": country,
    "Phone Country Code (Ship TO)": phoneCountry,
    "Phone Number (Ship TO)": digits(phone.national),
    "Email Address (Ship TO)": text(recipient.email),
    "Shipment Date (YYYYMMDD)": ymd(draft.planned?.date),
    "Total Shipment Pieces": pieces.length ? String(pieces.length) : "",
    "Total Weight": pieces.length ? num(totalWeight) : "",
    "Piece Length": onePiece ? num(onePiece.length) : "",
    "Piece Width": onePiece ? num(onePiece.width) : "",
    "Piece Height": onePiece ? num(onePiece.height) : "",
    "Product Code (Global)": text(draft.service?.productCode).toUpperCase(),
    "Product Code (3 Letter)": MYDHL_UPLOAD_VALUES.localProductCode[text(draft.service?.productCode).toUpperCase()] ?? "",
    "Summary of Contents": text(draft.contentsDescription),
    "Shipment Type": declared ? MYDHL_UPLOAD_VALUES.shipmentType.goods : MYDHL_UPLOAD_VALUES.shipmentType.documents
  };
  if (declared) {
    Object.assign(shipment, {
      "Declared Value": num(customs.declaredValue ?? null),
      "Declared Value Currency": text(customs.currency).toUpperCase(),
      "Trade Term": text(customs.incoterm).toUpperCase(),
      "Invoice Number": text(customs.invoice?.number),
      "Invoice Date (YYYYMMDD)": ymd(customs.invoice?.date),
      "Reason for Export": MYDHL_UPLOAD_VALUES.exportReason[text(customs.exportReasonType)] ?? ""
    });
  }
  const lines: (CustomsItem | null)[] = [declared && (customs.items ?? []).length ? (customs.items ?? [])[0] : null];
  const rows = lines.map(item => {
    const row: Partial<Record<MyDhlUploadColumn, string>> = { ...shipment };
    if (item) {
      Object.assign(row, {
        "Item Description": text(item.description),
        "Commodity Code": digits(text(item.hsCode)),
        "Country of Origin (Customs Invoice)": text(item.manufacturerCountry).toUpperCase(),
        "Quantity": num(item.quantity),
        "Item Units": text(item.quantityUnit).toUpperCase(),
        "Item Value": num(item.unitValue),
        "Item Value Currency": text(customs.currency).toUpperCase(),
        "Net Weight": num(item.netWeight),
        "Gross Weight": num(item.grossWeight)
      });
    }
    return MYDHL_UPLOAD_COLUMNS.map(column => row[column] ?? "");
  });
  return [[...MYDHL_UPLOAD_COLUMNS], ...rows];
}

/** A CSV cell: double-quoted, a quote inside doubled; line breaks become spaces (one record per line). */
const cell = (value: string) => `"${value.replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

/**
 * The file's text: CRLF line ends, UTF-8 (the character set picked at upload). No byte-order mark: MyDHL+ read
 * one as part of the first header ("\"Shipment Reference 1\"", upload of 5 Nov 2026).
 */
export function myDhlUploadCsv(input: MyDhlUploadInput): string {
  return myDhlUploadRows(input).map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** "nivadesk-mydhl-NVD-102-S1.csv" */
export function myDhlUploadFileName(orderReference: string, sequence: number | string): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9-]+/g, "");
  return `nivadesk-mydhl-${safe(text(orderReference)) || "order"}-S${safe(String(sequence)) || "1"}.csv`;
}
