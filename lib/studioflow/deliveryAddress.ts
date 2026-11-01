// Delivery address (1 Nov 2026): the order's structured recipient, the one Royal Mail and DHL read
// (server: functions/shipping/royalmail/contract.js recipientFromOrder, functions/shipping/service.js).
// A manually created order had no way to fill it on the web — the Customer & Communication
// "Address" is free text (customFields.communicationAddress) and no carrier reads it.
//
// The block on the Shipping & Tracking section saves exactly these seven keys through
// updateWebOrder (details). Rules the native apps follow too:
//   - address rows are joined with ", " before saving (the importers' form; the server folds
//     every run of whitespace, newlines included, into one space, and Royal Mail splits the
//     street on ", " into address lines 1–3);
//   - the country is saved as its two-letter code (DHL's list, which is ISO plus a few DHL codes);
//     a stored value that already names the chosen country is kept as it is, so opening and
//     saving an imported order does not rewrite "United Kingdom" to "GB";
//   - all seven keys go in every save; the server writes only the ones that changed.
import { DHL_COUNTRIES } from "./dhlCountries";

export const DELIVERY_ADDRESS_KEYS = [
  "shippingName",
  "shippingCompany",
  "shippingStreetAddress",
  "shippingCity",
  "shippingPostalCode",
  "shippingCountry",
  "shippingPhone"
] as const;

export type DeliveryAddressKey = typeof DELIVERY_ADDRESS_KEYS[number];
export type DeliveryAddress = Record<DeliveryAddressKey, string>;

/** The server's limits (updateWebOrder applyWebDetailsPatch setTextUpdate). */
export const DELIVERY_ADDRESS_LIMITS: Record<DeliveryAddressKey, number> = {
  shippingName: 180,
  shippingCompany: 100,
  shippingStreetAddress: 400,
  shippingCity: 120,
  shippingPostalCode: 40,
  shippingCountry: 120,
  shippingPhone: 80
};

/** The server's answer when it does not know a detail field (an updateWebOrder without the delivery-address keys). */
export const UNSUPPORTED_DETAIL_FIELD_MESSAGE = "Unsupported order detail field.";

export function deliveryAddressFrom(source: Partial<Record<DeliveryAddressKey, unknown>> | null | undefined): DeliveryAddress {
  const out = {} as DeliveryAddress;
  for (const key of DELIVERY_ADDRESS_KEYS) {
    const value = source?.[key];
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

export function deliveryAddressIsEmpty(address: DeliveryAddress): boolean {
  return DELIVERY_ADDRESS_KEYS.every(key => !address[key].trim());
}

/** The stored street as textarea rows: the same split Royal Mail makes (new lines or ", "). */
export function addressRowsFromStreet(street: string): string {
  return String(street || "")
    .split(/\r?\n|,\s*/)
    .map(row => row.trim())
    .filter(Boolean)
    .join("\n");
}

/** Textarea rows to the stored street: one row per address line, joined with ", ". */
export function streetFromAddressRows(rows: string): string {
  return String(rows || "")
    .split(/\r?\n/)
    .map(row => row.replace(/\s+/g, " ").trim().replace(/^,+|,+$/g, "").trim())
    .filter(Boolean)
    .join(", ");
}

const DHL_CODES = new Set(DHL_COUNTRIES.map(([code]) => code));

// Names people type for a country that are not DHL's name for it (the server's own list,
// functions/shipping/dhl/contract.js COUNTRY_ALIASES, plus "United Kingdom" spelt out).
const COUNTRY_ALIASES: Record<string, string> = {
  "UK": "GB", "U.K.": "GB", "GREAT BRITAIN": "GB", "BRITAIN": "GB", "ENGLAND": "GB", "SCOTLAND": "GB",
  "WALES": "GB", "NORTHERN IRELAND": "GB", "UNITED KINGDOM": "GB",
  "USA": "US", "U.S.A.": "US", "U.S.": "US", "UNITED STATES": "US", "AMERICA": "US",
  "TÜRKİYE": "TR", "TÜRKIYE": "TR", "TURKIYE": "TR", "TÜRKEI": "TR",
  "DEUTSCHLAND": "DE", "NEDERLAND": "NL", "HOLLAND": "NL", "ESPAÑA": "ES", "ITALIA": "IT", "ÖSTERREICH": "AT"
};

let englishNames: Map<string, string> | null = null;
function englishNameIndex(): Map<string, string> {
  if (englishNames) return englishNames;
  englishNames = new Map();
  let display: Intl.DisplayNames | null = null;
  try { display = new Intl.DisplayNames(["en"], { type: "region" }); } catch { display = null; }
  for (const [code, dhlName] of DHL_COUNTRIES) {
    englishNames.set(dhlName.toLocaleUpperCase("en-GB"), code);
    if (display && !code.startsWith("X")) {
      try {
        const name = display.of(code);
        if (name && name !== code) englishNames.set(name.toLocaleUpperCase("en-GB"), code);
      } catch { /* a code the browser does not know: DHL's name above */ }
    }
  }
  return englishNames;
}

/** The two-letter code a stored country names, or "" when it names none of DHL's countries. */
export function countryCodeFor(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toLocaleUpperCase("en-GB");
  if (/^[A-Z]{2}$/.test(upper) && DHL_CODES.has(upper)) return upper;
  if (COUNTRY_ALIASES[upper]) return COUNTRY_ALIASES[upper];
  return englishNameIndex().get(upper) ?? "";
}

/** The country the form starts on when the order has none: the workspace's own, else the UK. */
export function defaultCountryCode(workspaceCountry: string): string {
  return countryCodeFor(workspaceCountry) || "GB";
}

/** What the Country field saves: the stored text when it already names the chosen country, else the code. */
export function countryValueForSave(chosen: string, stored: string): string {
  const code = String(chosen || "").trim();
  if (!code) return "";
  if (!DHL_CODES.has(code)) return code === stored.trim() ? stored : code; // a stored name we could not place, kept
  return countryCodeFor(stored) === code ? stored : code;
}

export type DeliveryAddressDraft = {
  name: string;
  company: string;
  rows: string;
  city: string;
  postcode: string;
  /** A code from DHL's list, or the stored text when it names none of them. */
  country: string;
  phone: string;
};

/** The form's starting values: the stored fields; the customer's name when no recipient is stored. */
export function draftFromAddress(address: DeliveryAddress, customerName: string, workspaceCountry: string): DeliveryAddressDraft {
  const stored = address.shippingCountry.trim();
  return {
    name: address.shippingName.trim() || String(customerName || "").trim(),
    company: address.shippingCompany,
    rows: addressRowsFromStreet(address.shippingStreetAddress),
    city: address.shippingCity,
    postcode: address.shippingPostalCode,
    country: stored ? (countryCodeFor(stored) || stored) : defaultCountryCode(workspaceCountry),
    phone: address.shippingPhone
  };
}

/** The details patch one save sends: exactly the seven delivery-address keys. */
export function deliveryAddressPatch(draft: DeliveryAddressDraft, stored: DeliveryAddress): DeliveryAddress {
  const clip = (key: DeliveryAddressKey, value: string) => value.replace(/\s+/g, " ").trim().slice(0, DELIVERY_ADDRESS_LIMITS[key]);
  return {
    shippingName: clip("shippingName", draft.name),
    shippingCompany: clip("shippingCompany", draft.company),
    shippingStreetAddress: clip("shippingStreetAddress", streetFromAddressRows(draft.rows)),
    shippingCity: clip("shippingCity", draft.city),
    shippingPostalCode: clip("shippingPostalCode", draft.postcode),
    shippingCountry: clip("shippingCountry", countryValueForSave(draft.country, stored.shippingCountry)),
    shippingPhone: clip("shippingPhone", draft.phone)
  };
}

/** What a shipping label still needs (Royal Mail: name, first address line, city, postcode). */
export function deliveryAddressMissing(address: DeliveryAddress, customerName: string): Array<"name" | "street" | "city" | "postcode"> {
  const missing: Array<"name" | "street" | "city" | "postcode"> = [];
  if (!address.shippingName.trim() && !String(customerName || "").trim()) missing.push("name");
  if (!streetFromAddressRows(addressRowsFromStreet(address.shippingStreetAddress))) missing.push("street");
  if (!address.shippingCity.trim()) missing.push("city");
  if (!address.shippingPostalCode.trim()) missing.push("postcode");
  return missing;
}
