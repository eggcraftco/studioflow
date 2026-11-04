// DHL Express countries' currencies: the "isoCurrency" column of the "country" sheet of DHL's reference
// data (ExpressReferenceData_2026-09-06.xlsx, sha256 f8efa16f…), as pinned in
// functions/shipping/dhl/contract-snapshot.json. Generated from that file; do not edit by hand.
//
// The customs value of a DHL shipment is declared in a currency the person chooses from this list
// (DHL-10, 4 Nov 2026: never typed). The first choice offered is the sender's country's: what a DHL
// account there is billed in, and what its invoices are usually made out in.

export const DHL_COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  AD: "EUR", AE: "AED", AF: "USD", AG: "XCD", AI: "XCD", AL: "EUR", AM: "AMD", AO: "AOA", AR: "ARS",
  AS: "USD", AT: "EUR", AU: "AUD", AW: "AWG", AZ: "AZN", BA: "BAM", BB: "BBD", BD: "BDT", BE: "EUR",
  BF: "XOF", BG: "EUR", BH: "BHD", BI: "BIF", BJ: "XOF", BM: "BMD", BN: "BND", BO: "BOB", BR: "BRL",
  BS: "BSD", BT: "BTN", BW: "BWP", BY: "BYN", BZ: "BZD", CA: "CAD", CD: "CDF", CF: "XAF", CG: "XAF",
  CH: "CHF", CI: "XOF", CK: "NZD", CL: "CLP", CM: "XAF", CN: "CNY", CO: "COP", CR: "CRC", CU: "CUC",
  CV: "CVE", CY: "EUR", CZ: "CZK", DE: "EUR", DJ: "DJF", DK: "DKK", DM: "XCD", DO: "DOP", DZ: "DZD",
  EC: "USD", EE: "EUR", EG: "EGP", ER: "ERN", ES: "EUR", ET: "ETB", FI: "EUR", FJ: "FJD", FK: "GBP",
  FM: "USD", FO: "DKK", FR: "EUR", GA: "XAF", GB: "GBP", GD: "XCD", GE: "GEL", GF: "EUR", GG: "GBP",
  GH: "GHS", GI: "GBP", GL: "DKK", GM: "GMD", GN: "GNF", GP: "EUR", GQ: "XAF", GR: "EUR", GT: "GTQ",
  GU: "USD", GW: "XOF", GY: "GYD", HK: "HKD", HN: "HNL", HR: "EUR", HT: "HTG", HU: "HUF", IC: "EUR",
  ID: "IDR", IE: "EUR", IL: "ILS", IN: "INR", IQ: "USD", IR: "IRR", IS: "ISK", IT: "EUR", JE: "GBP",
  JM: "JMD", JO: "JOD", JP: "JPY", KE: "KES", KG: "KGS", KH: "KHR", KI: "AUD", KM: "EUR", KN: "XCD",
  KP: "KPW", KR: "KRW", KV: "EUR", KW: "KWD", KY: "KYD", KZ: "KZT", LA: "LAK", LB: "USD", LC: "XCD",
  LI: "CHF", LK: "LKR", LR: "LRD", LS: "LSL", LT: "EUR", LU: "EUR", LV: "EUR", LY: "LYD", MA: "MAD",
  MC: "EUR", MD: "MDL", ME: "EUR", MG: "MGA", MH: "USD", MK: "MKD", ML: "XOF", MM: "MMK", MN: "MNT",
  MO: "MOP", MP: "USD", MQ: "EUR", MR: "MRU", MS: "XCD", MT: "EUR", MU: "MUR", MV: "MVR", MW: "MWK",
  MX: "MXN", MY: "MYR", MZ: "MZN", NA: "NAD", NC: "XPF", NE: "XOF", NG: "NGN", NI: "NIO", NL: "EUR",
  NO: "NOK", NP: "NPR", NR: "AUD", NU: "NZD", NZ: "NZD", OM: "OMR", PA: "USD", PE: "PEN", PF: "XPF",
  PG: "PGK", PH: "PHP", PK: "PKR", PL: "PLN", PR: "USD", PT: "EUR", PW: "USD", PY: "PYG", QA: "QAR",
  RE: "EUR", RO: "RON", RS: "RSD", RU: "RUB", RW: "RWF", SA: "SAR", SB: "SBD", SC: "SCR", SD: "SDG",
  SE: "SEK", SG: "SGD", SH: "SHP", SI: "EUR", SK: "EUR", SL: "SLE", SM: "EUR", SN: "XOF", SO: "SOS",
  SR: "SRD", SS: "SSP", ST: "STN", SV: "USD", SY: "SYP", SZ: "SZL", TC: "USD", TD: "XAF", TG: "XOF",
  TH: "THB", TJ: "TJS", TL: "USD", TM: "TMT", TN: "TND", TO: "TOP", TR: "TRY", TT: "TTD", TV: "AUD",
  TW: "TWD", TZ: "TZS", UA: "UAH", UG: "UGX", US: "USD", UY: "UYU", UZ: "UZS", VA: "EUR", VC: "XCD",
  VE: "VES", VG: "USD", VI: "USD", VN: "VND", VU: "VUV", WS: "WST", XB: "EUR", XC: "XCG", XE: "USD",
  XM: "XCG", XN: "XCD", XS: "USD", XY: "EUR", YE: "YER", YT: "EUR", ZA: "ZAR", ZM: "ZMW", ZW: "ZWG"
};

/** Every currency DHL's country list names, A–Z. */
export const DHL_CURRENCIES: readonly string[] = Array.from(new Set(Object.values(DHL_COUNTRY_CURRENCY))).sort();

/** The currency of a DHL country ("GB" → "GBP"), or "" for one not in the list. */
export function dhlCountryCurrency(countryCode: string): string {
  return DHL_COUNTRY_CURRENCY[String(countryCode || "").toUpperCase()] ?? "";
}

/** A currency's name in the reader's language ("GBP" → "British pound"), else the code. */
export function currencyName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    if (name && name !== code) return name;
  } catch {
    // An unknown locale or code: the code below.
  }
  return code;
}

/** The mark printed beside an amount in this currency ("£", "€", "$", "CHF"), from the browser's own data. */
export function currencyMark(code: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find(p => p.type === "currency");
    if (part?.value) return part.value;
  } catch {
    // An unknown code: the code itself.
  }
  return code;
}

/**
 * The list a person picks from: the sender's country's currency first, then GBP, EUR and USD, then
 * every other currency DHL names, A–Z. A currency already on the draft is kept even if DHL's list
 * no longer names it.
 */
export function currencyChoices(senderCountry: string, current = ""): string[] {
  const first = [dhlCountryCurrency(senderCountry), "GBP", "EUR", "USD"].filter(Boolean);
  const rest = DHL_CURRENCIES.filter(code => !first.includes(code));
  const list = Array.from(new Set([...first, ...rest]));
  const kept = String(current || "").toUpperCase();
  return /^[A-Z]{3}$/.test(kept) && !list.includes(kept) ? [kept, ...list] : list;
}
