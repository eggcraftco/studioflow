// DHL S4 (owner's decision of 5 Nov 2026), web side: "Check with DHL" on the label form.
//   npx tsx scripts/check-dhl-s4-check.mts
//
// - the button calls checkOrderShipmentWithDhl (never createOrderShipment), after saving, and sends only
//   the order and the shipment (no courier, no "second label" acknowledgement);
// - DHL's "valid" is shown as "DHL check passed … This is not a label" — never as "label created";
//   with a courier on the draft, the screen adds that the courier is not part of the check;
// - an answer is shown only for the details as they were checked: any edit drops it;
// - every reason the server gives has its sentence (problems from DHL, switched off, key refused,
//   no answer, a waybill in the answer);
// - every new word is translated in the eleven other languages, placeholders kept; Turkish says
//   "DHL kontrolü geçti" (the owner's words);
// - the checks can fail: each family is run again on a broken copy (mutant) and must go red.
import { readFileSync } from "node:fs";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";
import { SHIPPING_TRANSLATIONS } from "../lib/studioflow/shippingTranslations";

let failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };

const NEW_WORDS = [
  "Check with DHL",
  "Check with DHL asks DHL to check these details without creating anything: no label, no waybill and no courier.",
  "DHL check passed: DHL accepted these details. This is not a label: nothing was created at DHL.",
  "The courier is not part of this check. It is booked only when the label is created.",
  "DHL found problems in these details. Nothing was created.",
  "The DHL check is switched off at the moment. You can still create the label.",
  "DHL did not accept the connection's API key for the check. An owner can check it in Settings ▸ Integrations ▸ DHL Express.",
  "The DHL check could not be done just now. Nothing was created. You can try again, or create the label.",
  "DHL's answer to the check carried a shipment or pickup number ({numbers}). NivaDesk saved nothing. Look in MyDHL+ before you create a label, and contact NivaDesk support."
];
// Words the screen already had, used again here (their rows are older).
const REUSED = ["Checking with DHL…", "DHL was not asked: the shipment is not complete yet."];
const WORDS = [...NEW_WORDS, ...REUSED];
const languages = SUPPORTED_STUDIO_LANGUAGES.filter(lang => lang !== "English");
expect("eleven other languages", languages.length === 11);
const PLACEHOLDER = /\{[a-z]+\}/g;

type Sources = { dialog: string; shipping: string };
const real: Sources = {
  dialog: readFileSync(new URL("../app/orders/ShipmentDraftDialog.tsx", import.meta.url), "utf8"),
  shipping: readFileSync(new URL("../lib/studioflow/shipping.ts", import.meta.url), "utf8")
};
const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  if (start < 0) return "";
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end < 0 ? undefined : end);
};

function screenChecks(src: Sources, translate: (word: string, language: string) => string): string[] {
  const saved = failures;
  failures = [];
  const { dialog, shipping } = src;
  for (const word of WORDS) {
    expect(`"${word.slice(0, 50)}" is on screen`, dialog.includes(`"${word}"`) || shipping.includes(`"${word}"`));
    for (const language of languages) {
      const shown = translate(word, language);
      expect(`"${word.slice(0, 40)}" in ${language}`, Boolean(shown) && shown !== word);
      expect(`"${word.slice(0, 40)}" in ${language} keeps its placeholders`, JSON.stringify((shown.match(PLACEHOLDER) ?? []).sort()) === JSON.stringify((word.match(PLACEHOLDER) ?? []).sort()));
    }
  }
  expect("Turkish says \"DHL kontrolü geçti\"", translate(NEW_WORDS[2], "Türkçe").startsWith("DHL kontrolü geçti"));
  // The button and its handler.
  expect("the button runs the check", /data-testid="dhl-check-button"[^\n]{0,200}onClick=\{\(\) => void checkWithDhl\(\)\}/.test(dialog));
  expect("the button says Check with DHL / Checking with DHL…", dialog.includes('{busy === "dhlcheck" ? t("Checking with DHL…") : t("Check with DHL")}'));
  const handler = between(dialog, "async function checkWithDhl()", "const dhlCheckView");
  expect("the handler saves first, then asks checkOrderShipmentWithDhl", /await persist\(\)[\s\S]*checkOrderShipmentWithDhl\(companyId, orderId, shipment\.id\)/.test(handler));
  expect("the handler never creates a label, locks the form or reports a creation", handler.length > 0 && !/createOrderShipment|onCreated|setLocked/.test(handler));
  // What the answer says.
  const view = between(dialog, "const dhlCheckView", "async function create()");
  expect("valid → DHL check passed (not a label)", /result\.outcome === "valid"\) return \{ tone: "ok", text: t\("DHL check passed: [^"]*This is not a label[^"]*"\)/.test(view));
  expect("the answer never says a label was created", !/Label created/.test(view));
  expect("DHL's reasons are shown", /result\.dhl\?\.additionalDetails/.test(view) && view.includes('t("DHL found problems in these details. Nothing was created.")'));
  expect("a waybill in the answer is named and nothing is saved", /result\.outcome === "made_something"/.test(view) && view.includes('.replace("{numbers}", numbers'));
  expect("switched off / key refused / no answer each have their sentence", /result\.reason === "check_off"/.test(view) && /result\.reason === "auth"/.test(view) && view.includes('t("The DHL check could not be done just now.'));
  expect("NivaDesk's own issues: nothing sent, the issues are listed", /result\.outcome === "invalid" && result\.sentToDhl === false\)[\s\S]{0,80}takeIssues/.test(handler));
  // Shown only for the details as checked.
  expect("an edit drops the answer", dialog.includes("useEffect(() => { if (dirty) setDhlCheck(null); }, [dirty]);"));
  expect("the answer shows only while nothing is unsaved", dialog.includes("{dhlCheck && !dirty ? (() => {"));
  expect("the courier sentence goes with a passed check when a courier is on the draft", /dhlCheck\.outcome === "valid" && pickupSupported && pickup\.requested \? \(\s*<span className="shipment-muted" data-testid="dhl-check-courier">/.test(dialog));
  expect("the explanation is always there", dialog.includes('data-testid="dhl-check-explain"'));
  // The call.
  const fn = between(shipping, "export async function checkOrderShipmentWithDhl", "\n}\n");
  expect("the client calls the callable checkOrderShipmentWithDhl", fn.includes('call<Record<string, unknown>, DhlCheckResult>("checkOrderShipmentWithDhl")'));
  expect("it sends only the order and the shipment", fn.includes("({ companyId, orderId, shipmentId })") && !/pickup|acknowledge/.test(fn));
  const out = failures;
  failures = saved;
  return out;
}

const translate = (word: string, language: string) => studioT(word, language);
for (const failure of screenChecks(real, translate)) failures.push(failure);
for (const word of NEW_WORDS) {
  const row = SHIPPING_TRANSLATIONS[word];
  expect(`"${word.slice(0, 40)}" has its own row`, Boolean(row));
  if (row) for (const language of languages) expect(`"${word.slice(0, 40)}" in ${language} is the table's own`, studioT(word, language) === row[language as keyof typeof row]);
}

const mutants: [string, Sources, (w: string, l: string) => string][] = [
  ["the button creates the label", { ...real, dialog: real.dialog.replace('onClick={() => void checkWithDhl()}', 'onClick={() => void create()}') }, translate],
  ["the handler calls createOrderShipment", { ...real, dialog: real.dialog.replace("await checkOrderShipmentWithDhl(companyId, orderId, shipment.id)", "await createOrderShipment(companyId, orderId, shipment.id)") }, translate],
  ["valid shown as label created", { ...real, dialog: real.dialog.replace('t("DHL check passed: DHL accepted these details. This is not a label: nothing was created at DHL.")', 't("Label created. Waybill")') }, translate],
  ["an edit keeps the old answer", { ...real, dialog: real.dialog.replace("useEffect(() => { if (dirty) setDhlCheck(null); }, [dirty]);", "") }, translate],
  ["DHL's reasons dropped", { ...real, dialog: real.dialog.replace("(result.dhl?.additionalDetails ?? [])", "([] as string[])") }, translate],
  ["courier sentence gone", { ...real, dialog: real.dialog.replace('data-testid="dhl-check-courier"', 'data-testid="x"') }, translate],
  ["the client calls another callable", { ...real, shipping: real.shipping.replace('("checkOrderShipmentWithDhl")({ companyId, orderId, shipmentId })', '("createOrderShipment")({ companyId, orderId, shipmentId })') }, translate],
  ["the client asks for a courier", { ...real, shipping: real.shipping.replace('("checkOrderShipmentWithDhl")({ companyId, orderId, shipmentId })', '("checkOrderShipmentWithDhl")({ companyId, orderId, shipmentId, pickup: { requested: true } })') }, translate],
  ["a language missing", real, (w, l) => (l === "Deutsch" && w.startsWith("DHL check passed") ? w : translate(w, l))],
  ["a placeholder lost in translation", real, (w, l) => (l === "Türkçe" && w.startsWith("DHL's answer to the check") ? translate(w, l).replace("{numbers}", "") : translate(w, l))],
  ["Turkish says label created", real, (w, l) => (l === "Türkçe" && w.startsWith("DHL check passed") ? "Etiket oluşturuldu." : translate(w, l))]
];
for (const [name, src, tr] of mutants) {
  const red = screenChecks(src, tr);
  expect(`mutant "${name}" is caught`, red.length > 0);
}

if (failures.length) {
  console.log(`check-dhl-s4-check: ${failures.length} of ${checks} FAILED`);
  for (const failure of failures.slice(0, 60)) console.log(`  FAIL ${failure}`);
  process.exit(1);
}
console.log(`check-dhl-s4-check: ${checks}/${checks} OK (${mutants.length} mutants caught)`);
