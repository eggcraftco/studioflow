// DHL S7 (5 Nov 2026): the EUDR TARIC document codes a seller may give on a customs line, picked
// from a list instead of typed — the same list as the server (functions/shipping/productIds.js
// EUDR_TARIC_CODES). Source: HMRC CDS Appendix 5A (3 Nov 2026) and the XI tariff's certificate
// table, valid from 30 Dec 2026; Y188/Y196 (exports from the EU only) are left out. A C code
// carries a reference number (the DDS field on the same line); a Y code is an exemption the seller
// must be able to evidence. The names are short English summaries of HMRC's official wording.
export const EUDR_TARIC_CODES: ReadonlyArray<readonly [string, string]> = [
  ["C716", "Due diligence statement (DDS) reference"],
  ["C717", "Simplified declaration identifier (micro or small primary operator)"],
  ["C718", "Product placed on the EU market in the transition period (re-import / export)"],
  ["C720", "Downstream operator, not an SME, registered: DDS or declaration reference"],
  ["C725", "Downstream SME operator, not registered: DDS or declaration reference"],
  ["Y129", "Goods not covered by the EUDR (Regulation 2023/1115)"],
  ["Y132", "Produced before 29 June 2023"],
  ["Y133", "Used, second-hand, waste or recovered products"],
  ["Y141", "Operator exemption under Article 38(3) (established by 31 December 2024)"],
  ["Y142", "Non-commercial consumer-to-consumer consignment"],
  ["Y187", "Samples of negligible value for examination, analysis or tests"],
  ["Y190", "Packing material used only to support, protect or carry another product"],
  ["Y191", "Medicinal-product inputs, correspondence or marketing material"]
];

export const isEudrTaricCode = (code: string) => EUDR_TARIC_CODES.some(([c]) => c === code.trim().toUpperCase());
