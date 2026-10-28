// DHL Express texts (23 Oct 2026, owner): the public integrations card, the in-app
// Integrations tile and Settings ▸ DHL Express say the same, honest thing.
//   npx tsx scripts/check-dhl-texts.mts
//
// Facts the code supports today: per-workspace switch (appConfig/shipping; "*": true, every
// workspace, since 28 Oct 2026 — an exact false still closes one),
// each business's own DHL Express account + MyDHL key/secret, DHL services for the route
// (GET /products: names and delivery estimates, no prices), label, commercial invoice for
// declarable shipments (GB↔NI included), tracking. pickup.isRequested is always false.
// Status (28 Oct 2026, late; docs/integrations/dhl-express.md §4): Live. Every workspace sees
// DHL; each business needs its own MyDHL API access from DHL (Get Access on the MyDHL API page
// of developer.dhl.com; DHL sends a test key first and decides when production opens); DHL gave
// the first NivaDesk business production access on 27 Oct 2026. Never "acceptance" /
// "approved" / "kabul" / "onay" — it reads as if DHL endorsed NivaDesk itself.
// (Earlier wordings, replaced: 23 Oct "sample documents were sent to DHL for verification";
// 28 Oct 7b0dec48 "no real shipment … switched on for that business only".)
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
  "No MyDHL API key yet? Request one from DHL: on the MyDHL API page of developer.dhl.com, choose Get Access and fill in DHL's form with your DHL Express account number. DHL sends a test key first and decides when production access opens.",
  "Each business connects its own DHL Express account and MyDHL API credentials.",
  "Open the MyDHL API page", "DHL services", "Commercial invoice", "Tracking",
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
    ["where to get a key", /MyDHL API page of developer\.dhl\.com/], ["Get Access", /\bGet Access\b/],
    ["test key first, DHL decides production", /DHL sends a test key first and decides when production access opens/],
    ["own account + API", /own DHL Express account and MyDHL API credentials/i],
    ["services", /DHL Express services/i], ["label", /\blabel\b/i], ["commercial invoice", /commercial invoice/i], ["tracking", /tracking/i]
  ],
  tr: [
    ["anahtar nereden", /developer\.dhl\.com'daki MyDHL API sayfasında/], ["Get Access", /\bGet Access/],
    ["önce test anahtarı", /DHL önce bir test anahtarı gönderir/],
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
  ["EN 'approved'", "en", en.replace("DHL sends a test key first", "DHL approved NivaDesk and sends a test key first")],
  ["EN 'acceptance'", "en", en.replace("decides when production access opens", "has accepted NivaDesk for production")],
  ["EN instant connect claimed", "en", en.replace("DHL sends a test key first and decides when production access opens", "Connect at once with NivaDesk's DHL account")],
  ["EN key route dropped", "en", en.replaceAll("Get Access", "the button")],
  ["EN 'certified'", "en", `${en} NivaDesk is DHL certified.`],
  ["EN 'partner'", "en", `${en} An official DHL partner.`],
  ["EN positive pickup", "en", `${en} Book a DHL courier pickup from the order.`],
  ["EN price claim", "en", `${en} Compare DHL prices for each parcel.`],
  ["EN where-to-ask dropped", "en", en.replace("the MyDHL API page of developer.dhl.com", "DHL")],
  ["EN own account dropped", "en", en.replace("its own DHL Express account and MyDHL API credentials", "the NivaDesk DHL account")],
  ["TR 'onayladı'", "tr", tr.replace("DHL önce bir test anahtarı gönderir", "DHL NivaDesk'i onayladı ve önce bir test anahtarı gönderir")],
  ["TR anında bağlantı", "tr", tr.replace("DHL önce bir test anahtarı gönderir", "Tüm işletmeler hemen bağlanır")],
  ["TR 'kabul'", "tr", tr.replace("production erişiminin ne zaman açılacağına kendisi karar verir", "NivaDesk'i production için kabul etti")],
  ["TR 'sertifikalı'", "tr", `${tr} NivaDesk DHL sertifikalı.`],
  ["TR positive courier", "tr", `${tr} Siparişten kurye çağırın.`],
  ["TR price claim", "tr", `${tr} Her koli için DHL fiyatlarını karşılaştırın.`],
  ["TR nereden sorulacağı düştü", "tr", tr.replace("developer.dhl.com'daki MyDHL API sayfasında", "bir yerde")]
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

// ---- the screens use these words, and DHL is Live ---------------------------------
const directory = read("app/integrations/IntegrationsDirectory.tsx");
expect("public card state is live", /name: "DHL Express"[^\n]*state: "live"/.test(directory));
const settings = read("app/settings/page.tsx");
const section = read("app/settings/DhlExpressIntegrationSection.tsx");
expect("tile blurb", settings.includes(`blurb: ${JSON.stringify(APP_KEYS[0])}`));
expect("tile capabilities", settings.includes('capabilities: ["DHL services", "Shipping labels", "Commercial invoice", "Tracking"]'));
expect("tile shows the connection's DHL environment, no access label", /detail: !dhl\.connected \? "" : dhl\.environment === "production" \? t\("DHL production"\) : t\("DHL test environment"\)/.test(settings) && !/t\("Limited access"\)/.test(section));
expect("section links DHL's MyDHL API page", section.includes('const MYDHL_API_PAGE = "https://developer.dhl.com/api-reference/dhl-express-mydhl-api"') && /href=\{MYDHL_API_PAGE\} target="_blank" rel="noopener noreferrer"/.test(section));
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
