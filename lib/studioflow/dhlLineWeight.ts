// DHL S6 (5 Nov 2026): a customs line's weight as MyDHL+ asks for it — the weight of ONE item —
// and the line's total that DHL gets (DHL multiplies nothing: "There is no auto calculation for
// number multiply with weight", MyDHL API 3.3.2 lineItems[].weight). The server works the totals
// out itself (functions/shipping/draft.js lineWeightKg); this copy is for the screen's preview and
// for a server from before S6, which keeps the totals the screen sends. Never a 0 or 1 kg stand-in.

const positive = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** quantity × weight of one item, to DHL's 0.001 kg; null when either is missing or not above zero. */
export function lineWeightKg(quantity: number | null | undefined, unitWeight: number | null | undefined): number | null {
  if (!positive(quantity) || !positive(unitWeight)) return null;
  return Math.round(quantity * unitWeight * 1000) / 1000;
}

/** Grams, to add weights without floating-point noise. */
export const weightGrams = (kg: number) => Math.round(kg * 1000);

/** "0.360" in en-GB, "0,360" in tr: three decimals, the reader's separator. */
export function kgText(kg: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(kg);
  } catch {
    return kg.toFixed(3);
  }
}

/** A typed weight: "0,12" and "0.12" both read 0.12 (a weight has no thousands separator here). */
export function readKg(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normal = trimmed.includes(",") && !trimmed.includes(".") ? trimmed.replace(",", ".") : trimmed;
  if (!/^\d*\.?\d+$/.test(normal)) return null;
  const value = Number(normal);
  return Number.isFinite(value) ? value : null;
}

const typedNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * What a customs line sends about its weight (the dialog's fields as typed):
 * - weight of one item typed → unitNetWeight / unitGrossWeight (the server multiplies) plus the
 *   totals worked out here, which a server from before S6 keeps as they are;
 * - nothing typed per item but a total saved earlier → that total, as it was, and no unit key
 *   (never multiplied again);
 * - neither → empty unit fields, so the server reports the missing weight (never 0 or 1 kg).
 * A gross weight of one item left empty is the net weight of one item (the dialog says so).
 */
export function customsLineWeights(item: { quantity: string; unitNetWeight: string; unitGrossWeight: string; netWeight: string; grossWeight: string }) {
  const unitNet = typedNumber(item.unitNetWeight);
  const unitGross = typedNumber(item.unitGrossWeight) ?? unitNet;
  const legacy = !item.unitNetWeight.trim() && !item.unitGrossWeight.trim() && Boolean(item.netWeight.trim());
  if (legacy) return { netWeight: typedNumber(item.netWeight), grossWeight: typedNumber(item.grossWeight) ?? typedNumber(item.netWeight) };
  const quantity = typedNumber(item.quantity);
  return { unitNetWeight: unitNet, unitGrossWeight: unitGross, netWeight: lineWeightKg(quantity, unitNet), grossWeight: lineWeightKg(quantity, unitGross) };
}

/** S5: the tariff's answer belongs to the code it was asked for; a retyped code waits for the next save. */
export function tariffAnswerFor<T extends { code: string }>(hsCode: string, answer: T | null | undefined, senderCountry: string): T | null {
  if (!answer) return null;
  const typed = hsCode.replace(/[.\s]/g, "");
  return typed === answer.code || (senderCountry.toUpperCase() !== "GB" && typed.slice(0, 6) === answer.code) ? answer : null;
}
