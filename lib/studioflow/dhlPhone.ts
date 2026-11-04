// Phone numbers on a DHL shipment (DHL-10, 4 Nov 2026): the country calling code chosen beside the
// number, as MyDHL+ asks for it. MyDHL API takes one phone string per party, so the form sends
// "+<code> <number>"; DHL texts and calls the recipient on it, and a number written the way it is
// dialled at home reaches no one abroad.
//
// The tables are functions/shipping/phone.js's, character for character (the server applies the
// same rule to anything that reaches it without a "+"; the form always writes the code, so only the
// trunk rule is needed here): ITU-T E.164 calling codes for DHL's own
// country list, including DHL's codes outside ISO (IC +34, KV +383, XB/XC/XE +599, XM/XN +1,
// XS +252, XY +590). scripts/check-dhl-label-form.mts checks every DHL country has one.

export const CALLING_CODES: Readonly<Record<string, string>> = {
  AD: "376", AE: "971", AF: "93", AG: "1", AI: "1", AL: "355", AM: "374", AO: "244", AR: "54", AS: "1",
  AT: "43", AU: "61", AW: "297", AZ: "994", BA: "387", BB: "1", BD: "880", BE: "32", BF: "226", BG: "359",
  BH: "973", BI: "257", BJ: "229", BM: "1", BN: "673", BO: "591", BR: "55", BS: "1", BT: "975", BW: "267",
  BY: "375", BZ: "501", CA: "1", CD: "243", CF: "236", CG: "242", CH: "41", CI: "225", CK: "682", CL: "56",
  CM: "237", CN: "86", CO: "57", CR: "506", CU: "53", CV: "238", CY: "357", CZ: "420", DE: "49", DJ: "253",
  DK: "45", DM: "1", DO: "1", DZ: "213", EC: "593", EE: "372", EG: "20", ER: "291", ES: "34", ET: "251",
  FI: "358", FJ: "679", FK: "500", FM: "691", FO: "298", FR: "33", GA: "241", GB: "44", GD: "1", GE: "995",
  GF: "594", GG: "44", GH: "233", GI: "350", GL: "299", GM: "220", GN: "224", GP: "590", GQ: "240", GR: "30",
  GT: "502", GU: "1", GW: "245", GY: "592", HK: "852", HN: "504", HR: "385", HT: "509", HU: "36", IC: "34",
  ID: "62", IE: "353", IL: "972", IN: "91", IQ: "964", IR: "98", IS: "354", IT: "39", JE: "44", JM: "1",
  JO: "962", JP: "81", KE: "254", KG: "996", KH: "855", KI: "686", KM: "269", KN: "1", KP: "850", KR: "82",
  KV: "383", KW: "965", KY: "1", KZ: "7", LA: "856", LB: "961", LC: "1", LI: "423", LK: "94", LR: "231",
  LS: "266", LT: "370", LU: "352", LV: "371", LY: "218", MA: "212", MC: "377", MD: "373", ME: "382", MG: "261",
  MH: "692", MK: "389", ML: "223", MM: "95", MN: "976", MO: "853", MP: "1", MQ: "596", MR: "222", MS: "1",
  MT: "356", MU: "230", MV: "960", MW: "265", MX: "52", MY: "60", MZ: "258", NA: "264", NC: "687", NE: "227",
  NG: "234", NI: "505", NL: "31", NO: "47", NP: "977", NR: "674", NU: "683", NZ: "64", OM: "968", PA: "507",
  PE: "51", PF: "689", PG: "675", PH: "63", PK: "92", PL: "48", PR: "1", PT: "351", PW: "680", PY: "595",
  QA: "974", RE: "262", RO: "40", RS: "381", RU: "7", RW: "250", SA: "966", SB: "677", SC: "248", SD: "249",
  SE: "46", SG: "65", SH: "290", SI: "386", SK: "421", SL: "232", SM: "378", SN: "221", SO: "252", SR: "597",
  SS: "211", ST: "239", SV: "503", SY: "963", SZ: "268", TC: "1", TD: "235", TG: "228", TH: "66", TJ: "992",
  TL: "670", TM: "993", TN: "216", TO: "676", TR: "90", TT: "1", TV: "688", TW: "886", TZ: "255", UA: "380",
  UG: "256", US: "1", UY: "598", UZ: "998", VA: "39", VC: "1", VE: "58", VG: "1", VI: "1", VN: "84",
  VU: "678", WS: "685", XB: "599", XC: "599", XE: "599", XM: "1", XN: "1", XS: "252", XY: "590", YE: "967",
  YT: "262", ZA: "27", ZM: "260", ZW: "263"
};

// A trunk "0" written at home and not dialled from abroad ("020 7946 0000" → +44 20 7946 0000).
const TRUNK_ZERO: ReadonlySet<string> = new Set([
  "GB", "GG", "JE", "IE", "DE", "AT", "CH", "FR", "BE", "NL", "SE", "FI", "TR", "AU", "NZ", "JP", "CN",
  "KR", "TW", "IN", "PK", "BD", "LK", "ID", "MY", "TH", "VN", "PH", "IL", "SA", "AE", "EG", "MA", "ZA",
  "NG", "KE", "GH", "BR", "AR", "PE", "RO", "BG", "HR", "SI", "SK", "RS", "BA", "ME", "MK", "AL", "UA",
  "RE", "GP", "MQ", "GF", "YT"
]);

const digitsOf = (value: string) => String(value ?? "").replace(/\D/g, "");

/** The calling code of a DHL country ("44"), or "". */
export function callingCodeFor(countryCode: string): string {
  return CALLING_CODES[String(countryCode || "").toUpperCase()] ?? "";
}

/**
 * The number written at home, without what dialling from abroad leaves out: the trunk "0" where the
 * country uses one, a leading "1" in a +1 country. Spaces and dashes as typed.
 */
function nationalPart(raw: string, country: string): string {
  const code = callingCodeFor(country);
  const trimmed = raw.trim();
  if (code === "1") return trimmed.replace(/^\+?1[\s.\-]*(?=\(?\d{3})/, "");
  if (TRUNK_ZERO.has(country) && /^0(?!0)/.test(trimmed)) return trimmed.replace(/^0\s*/, "");
  return trimmed;
}

// The country a shared code means when the recipient is not in one of its countries.
const PREFERRED: Readonly<Record<string, string>> = { "1": "US", "7": "RU", "44": "GB", "599": "XC", "590": "GP", "262": "RE", "34": "ES", "39": "IT", "252": "SO" };

/** The longest calling code the digits start with, or "". */
function codeAtStart(digits: string): string {
  return Object.values(CALLING_CODES).filter(code => digits.startsWith(code)).sort((a, b) => b.length - a.length)[0] ?? "";
}

/**
 * A stored phone split for the form: the country whose code it starts with, and the rest.
 * "+44 7700 900123" → GB, "7700 900123"; a number without a code keeps the recipient's country.
 * Where a code is shared (+1, +7, +44, +599 …) the recipient's country wins when it has that code.
 */
export function splitPhone(stored: string, recipientCountry: string): { country: string; national: string } {
  const country = String(recipientCountry || "").toUpperCase();
  const raw = String(stored ?? "").trim();
  const international = raw.startsWith("+") ? raw.slice(1) : /^00\d/.test(raw) ? raw.slice(2) : null;
  if (international === null) return { country, national: nationalPart(raw, country) };
  const digits = digitsOf(international);
  const own = callingCodeFor(country);
  const code = own && digits.startsWith(own) ? own : codeAtStart(digits);
  if (!code) return { country, national: raw };
  const owner = code === own ? country : PREFERRED[code] ?? Object.keys(CALLING_CODES).find(k => CALLING_CODES[k] === code) ?? country;
  // The code's digits come off the front; the person's own spacing after them stays.
  let seen = 0;
  let cut = 0;
  while (cut < international.length && seen < code.length) {
    if (/\d/.test(international[cut])) seen += 1;
    cut += 1;
  }
  return { country: owner, national: international.slice(cut).replace(/^[\s.\-)]+/, "").replace(/^\(0\)\s*/, "") };
}

/** "+44 7700 900123" from the chosen country and the number as typed; "" when there is no number. */
export function composePhone(country: string, national: string): string {
  const code = callingCodeFor(country);
  const rest = nationalPart(String(national ?? ""), String(country || "").toUpperCase()).replace(/\s+/g, " ").trim();
  if (!digitsOf(rest)) return "";
  return code ? `+${code} ${rest}` : rest;
}
