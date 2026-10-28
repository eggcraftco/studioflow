// DHL Express texts (23 Oct 2026, owner): the public integrations card, the in-app
// Integrations tile and Settings ▸ DHL Express say the same, honest thing.
//   npx tsx scripts/check-dhl-texts.mts
//
// Facts the code supports today: per-workspace switch (appConfig/shipping, one business),
// each business's own DHL Express account + MyDHL key/secret, DHL services for the route
// (GET /products: names and delivery estimates, no prices), label, commercial invoice for
// declarable shipments (GB↔NI included), tracking. pickup.isRequested is always false.
// Status (28 Oct 2026, docs/integrations/dhl-express.md §4): NivaDesk's label and commercial
// invoice tests in DHL's test environment are complete; DHL reviewed them and gave the first
// business production access on 27 Oct 2026 (that business's MyDHL API app only — other
// businesses are not covered); NivaDesk's connection still runs in DHL's test environment, so
// no real shipment has been sent. Card stays Limited access. Never "acceptance" / "approved" /
// "kabul" / "onay" — it reads as if DHL endorsed NivaDesk itself, or opened it for everyone.
// (23 Oct wording, replaced: "sample documents were sent to DHL for verification".)
//
// Never: "approved / certified / partner / official" (EN) or "onayladı / sertifika / ortak"
// (TR); a price or quote claim; a pickup or courier mention that is not a negation.
// The rules run first against known-bad mutants of the real texts, so a check that cannot
// fail is itself a failure.
import { readFileSync } from "node:fs";
import { PUBLIC_SITE_TRANSLATIONS } from "../lib/publicSite/translations";
import { studioT, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures: string[] = [];
let checks = 0;
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };

const PUBLIC_KEYS = ["integrations.summary.dhl", "integrations.detail.dhl", "integrations.note.dhl"] as const;
const APP_KEYS = [
  "See the DHL Express services for an order's route, create the label with the commercial invoice where customs needs one, and follow each parcel.",
  "NivaDesk's label and commercial invoice tests in DHL's test environment are complete. DHL reviewed them and gave the first business production access on 27 October 2026. No real shipment has been sent through NivaDesk yet.",
  "Each business connects its own DHL Express account and MyDHL API credentials.",
  "Limited access", "DHL services", "Commercial invoice", "Tracking",
  "NivaDesk never books a pickup, and never marks an order dispatched before DHL scans the parcel."
];

type Lang = "en" | "tr";
const FORBIDDEN: Record<Lang, RegExp[]> = {
  en: [/\baccept/i, /\bapprov/i, /\bcertif/i, /\bpartner/i, /\bofficial/i, /\bendorse/i, /\bprices?\b|\bpricing\b|\bquotes?\b|\brates?\b/i],
  tr: [/kabul/i, /onayl/i, /sertifika/i, /ortakl|\bortağ/i, /\bresmi\b/i, /fiyat|ücret teklifi/i]
};
const PICKUP: Record<Lang, RegExp> = { en: /pick-?ups?|courier|collection/i, tr: /kurye|teslim alma/i };
const NEGATION: Record<Lang, RegExp> = { en: /\b(not|never|no)\b/i, tr: /(maz|mez|değil|yok)\b/i };
const REQUIRED: Record<Lang, [string, RegExp][]> = {
  en: [
    ["NivaDesk's tests done", /NivaDesk's label and commercial invoice tests in DHL's test environment are complete/],
    ["DHL reviewed + first business only", /DHL reviewed them and gave the first business production access on 27 October 2026/],
    ["no real shipment yet", /No real shipment has been sent through NivaDesk yet/],
    ["own account + API", /own DHL Express account and MyDHL API credentials/i],
    ["services", /DHL Express services/i], ["label", /\blabel\b/i], ["commercial invoice", /commercial invoice/i], ["tracking", /tracking/i]
  ],
  tr: [
    ["NivaDesk testleri tamam", /NivaDesk'in DHL test ortamındaki etiket ve ticari fatura testleri tamamlandı/],
    ["DHL inceledi + yalnız ilk işletme", /DHL bunları inceledi ve 27 Ekim 2026'da ilk işletmeye production erişimi verdi/],
    ["henüz gerçek gönderi yok", /NivaDesk üzerinden henüz gerçek gönderi yapılmadı/],
    ["kendi hesap + API", /kendi DHL Express hesabı ve MyDHL API bilgileriyle/],
    ["servisler", /DHL Express servislerini/], ["etiket", /etiket/i], ["ticari fatura", /ticari fatura/i], ["takip", /takip/i]
  ]
};

function textProblems(lang: Lang, surface: string, text: string): string[] {
  const out: string[] = [];
  for (const rule of FORBIDDEN[lang]) if (rule.test(text)) out.push(`${surface} [${lang}]: forbidden ${rule}`);
  for (const sentence of text.split(/(?<=[.!?。])\s+/)) {
    if (PICKUP[lang].test(sentence) && !NEGATION[lang].test(sentence)) out.push(`${surface} [${lang}]: pickup/courier without a negation: "${sentence}"`);
  }
  for (const [name, rule] of REQUIRED[lang]) if (!rule.test(text)) out.push(`${surface} [${lang}]: missing ${name}`);
  return out;
}

// ---- the real texts --------------------------------------------------------
const publicText = (lang: "English" | "Türkçe") => PUBLIC_KEYS.map(key => (PUBLIC_SITE_TRANSLATIONS[lang] as Record<string, string>)[key] ?? "").join(" ");
const appText = (lang: "English" | "Türkçe") => APP_KEYS.map(key => studioT(key, lang)).join(" ");
const surfaces: [string, Lang, string][] = [
  ["public card", "en", publicText("English")], ["public card", "tr", publicText("Türkçe")],
  ["app tile + Settings", "en", appText("English")], ["app tile + Settings", "tr", appText("Türkçe")]
];

// ---- mutation proof: every rule must catch its mutant -------------------------
const en = publicText("English");
const tr = publicText("Türkçe");
const mutants: [string, Lang, string][] = [
  ["EN 'approved'", "en", en.replace("DHL reviewed them and gave", "DHL approved NivaDesk and gave")],
  ["EN 'acceptance'", "en", en.replace("NivaDesk's label and commercial invoice tests in DHL's test environment are complete", "Label and customs document acceptance is complete in DHL's test environment")],
  ["EN every business claimed", "en", en.replace("gave the first business production access", "gave every business production access")],
  ["EN 'no real shipment' dropped", "en", en.replace("No real shipment has been sent through NivaDesk yet", "Real shipments are underway")],
  ["EN 'certified'", "en", `${en} NivaDesk is DHL certified.`],
  ["EN 'partner'", "en", `${en} An official DHL partner.`],
  ["EN positive pickup", "en", `${en} Book a DHL courier pickup from the order.`],
  ["EN price claim", "en", `${en} Compare DHL prices for each parcel.`],
  ["EN real shipments claimed", "en", en.replace("No real shipment has been sent through NivaDesk yet", "Real shipments are live")],
  ["EN own account dropped", "en", en.replace("its own DHL Express account and MyDHL API credentials", "the NivaDesk DHL account")],
  ["TR 'onayladı'", "tr", tr.replace("DHL bunları inceledi", "DHL NivaDesk'i onayladı")],
  ["TR tüm işletmeler", "tr", tr.replace("ilk işletmeye production erişimi verdi", "tüm işletmelere production erişimi verdi")],
  ["TR gerçek gönderi var", "tr", tr.replace("NivaDesk üzerinden henüz gerçek gönderi yapılmadı", "Gerçek gönderiler başladı")],
  ["TR 'kabul'", "tr", tr.replace("etiket ve ticari fatura testleri tamamlandı", "etiket ve gümrük belgesi kabulü tamamlandı")],
  ["TR 'sertifikalı'", "tr", `${tr} NivaDesk DHL sertifikalı.`],
  ["TR positive courier", "tr", `${tr} Siparişten kurye çağırın.`],
  ["TR price claim", "tr", `${tr} Her koli için DHL fiyatlarını karşılaştırın.`],
  ["TR tests sentence dropped", "tr", tr.replace("NivaDesk'in DHL test ortamındaki etiket ve ticari fatura testleri tamamlandı", "DHL entegrasyonu hazır")]
];
for (const [name, lang, text] of mutants) expect(`mutant caught: ${name}`, textProblems(lang, "mutant", text).length > 0);

for (const [surface, lang, text] of surfaces) {
  const problems = textProblems(lang, surface, text);
  for (const problem of problems) failures.push(problem);
  checks += 1;
}

// ---- every language has its own words -----------------------------------------
const LANGS = SUPPORTED_STUDIO_LANGUAGES.filter(l => l !== "English");
expect("12 languages (EN + 11)", SUPPORTED_STUDIO_LANGUAGES.length === 12);
for (const lang of LANGS) {
  const table = PUBLIC_SITE_TRANSLATIONS[lang] as Record<string, string> | undefined;
  for (const key of PUBLIC_KEYS) {
    const value = table?.[key] ?? "";
    expect(`public ${key} in ${lang}`, Boolean(value) && value !== (PUBLIC_SITE_TRANSLATIONS.English as Record<string, string>)[key]);
  }
  expect(`public chip "Limited access" in ${lang} matches the app's`, (table?.["integrations.state.limited"] ?? "") === studioT("Limited access", lang));
  for (const key of APP_KEYS) expect(`app "${key.slice(0, 40)}…" in ${lang}`, studioT(key, lang) !== key);
}

// ---- the screens use these words, and DHL stays Limited access -------------------
const directory = read("app/integrations/IntegrationsDirectory.tsx");
expect("public card state is limited", /name: "DHL Express"[^\n]*state: "limited"/.test(directory));
const settings = read("app/settings/page.tsx");
const section = read("app/settings/DhlExpressIntegrationSection.tsx");
expect("tile blurb", settings.includes(`blurb: ${JSON.stringify(APP_KEYS[0])}`));
expect("tile capabilities", settings.includes('capabilities: ["DHL services", "Shipping labels", "Commercial invoice", "Tracking"]'));
expect("tile says Limited access", /detail: dhl\.connected[^\n]*t\("Limited access"\)/.test(settings));
for (const key of APP_KEYS.slice(0, 4).concat(APP_KEYS[7])) expect(`section uses "${key.slice(0, 40)}…"`, section.includes(`t(${JSON.stringify(key)})`));
expect("status shown on the not-available card too", (section.match(/\{accessStatus\}/g) ?? []).length === 2);
for (const [name, source] of [["settings", settings], ["section", section]] as const) {
  // "Longer than DHL accepts." is a field-length message, not a status claim.
  const literals = [...source.matchAll(/t\("([^"]*DHL[^"]*)"\)/g)].map(m => m[1]).filter(text => text !== "Longer than DHL accepts.").join(" ");
  for (const rule of FORBIDDEN.en) expect(`${name} DHL literals free of ${rule}`, !rule.test(literals));
}

if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`check-dhl-texts: ${failures.length} of ${checks} FAILED`);
  process.exit(1);
}
console.log(`check-dhl-texts: ${checks}/${checks} passed (${mutants.length} mutants caught)`);
