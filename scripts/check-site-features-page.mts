// /features lists what NivaDesk does (owner, 1 Nov 2026: "sitedeki feature sayfasina suana kadar ekledigimiz tum
// ozellikleri eklemek istiyorum … sayfanin suanki duzenini bozmadan").
//
// 1. Every line the page draws from its feature lists (FEATURE_HIGHLIGHTS, ADVANCED_AREAS, FEATURES_PAGE_AREAS,
//    PLAN_FEATURE_BRIDGE) is written in all twelve languages. publicSiteT falls back to English, so a missing row
//    is an English sentence on a German page — that is how cards 10–15 read until 1 Nov 2026.
// 2. The phone matrix draws PLAN_FEATURE_ICONS[i] beside PLAN_FEATURE_BRIDGE[i]: the two lists are the same length.
//    A row added without an icon moved every icon below it one row down (the help assistant row did).
// 3. The home page keeps its six back-office tiles; areas added for /features go in FEATURES_PAGE_AREAS, and every
//    area has its icon.
// 4. The lists name only what every workspace can use: pilot or switched features stay off until they open.
//
//   npx tsx scripts/check-site-features-page.mts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PUBLIC_SITE_EN, PUBLIC_SITE_TRANSLATIONS } from "../lib/publicSite/translations";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(root, "components/PublicMarketing.tsx"), "utf8");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

type Table = Record<string, Record<string, string | undefined>>;
const EN = PUBLIC_SITE_EN as Record<string, string>;
const TABLE = PUBLIC_SITE_TRANSLATIONS as unknown as Table;

const block = (source: string, name: string) => {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) return "";
  const end = source.indexOf("\n]", start); // "\n];" or "\n] as const;"
  return source.slice(start, end < 0 ? undefined : end);
};
const pageKeys = (source: string) => {
  const keys = new Set<string>();
  for (const name of ["FEATURE_HIGHLIGHTS", "ADVANCED_AREAS", "FEATURES_PAGE_AREAS", "PLAN_FEATURE_BRIDGE"]) {
    for (const m of block(source, name).matchAll(/"((?:feature|adv|planBridge)\.[^"]+)"/g)) keys.add(m[1]);
  }
  return [...keys];
};

// A row equal to English is right only where the word is the same in that language.
const SAME_AS_ENGLISH_OK: Record<string, string[]> = {
  "feature.dashboard.title": ["Türkçe", "Deutsch", "Italiano"],
  "feature.chatgpt.title": ["Türkçe"],
  "feature.export.title": ["Deutsch", "Français"],
  "planBridge.messages.title": ["Français"],
  "feature.team.eyebrow": ["Español (Spanish)"],
  "feature.claude.title": ["Deutsch", "Italiano"], // "NivaDesk in Claude"
};

// ---- the rules ------------------------------------------------------------------------------------
function translationProblems(source: string, table: Table): string[] {
  const out: string[] = [];
  const keys = pageKeys(source);
  if (keys.length < 200) out.push(`read ${keys.length} keys — the reader is out of date`);
  for (const key of keys) {
    if (!EN[key]) { out.push(`${key}: no English row`); continue; }
    for (const [language, rows] of Object.entries(table)) {
      if (language === "English") continue;
      const value = rows[key];
      if (!value || !value.trim()) out.push(`${language} ${key}: missing (shows English)`);
      else if (value === EN[key] && !(SAME_AS_ENGLISH_OK[key] ?? []).includes(language)) out.push(`${language} ${key}: same as English`);
    }
  }
  return out;
}

function structureProblems(source: string): string[] {
  const out: string[] = [];
  const rows = (block(source, "PLAN_FEATURE_BRIDGE").match(/titleKey: "planBridge\./g) ?? []).length;
  const icons = (block(source, "PLAN_FEATURE_ICONS").match(/\{ tone: "/g) ?? []).length;
  if (rows < 10) out.push(`read ${rows} matrix rows — the reader is out of date`);
  if (rows !== icons) out.push(`${rows} plan rows but ${icons} phone icons`);
  const homeTiles = (block(source, "ADVANCED_AREAS").match(/\{ id: "/g) ?? []).length;
  if (homeTiles !== 6) out.push(`the home page has ${homeTiles} back-office tiles, not six`);
  const homeBranch = source.slice(source.indexOf('className="public-backoffice-grid"'), source.indexOf('className="public-backoffice-grid"') + 400);
  if (/FEATURES_PAGE_AREAS/.test(homeBranch)) out.push("the home tiles draw the /features-only areas");
  const iconStart = source.indexOf("function AdvancedAreasSection");
  const iconMap = source.slice(iconStart, source.indexOf("const areaIcon", iconStart));
  const ids = [...`${block(source, "ADVANCED_AREAS")}${block(source, "FEATURES_PAGE_AREAS")}`.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) if (!new RegExp(`\\n\\s*${id}: <`).test(iconMap)) out.push(`area ${id} has no icon`);
  return out;
}

const PILOT_ONLY = /online booking|royal mail|click & drop|\bsms\b|whatsapp|instagram|pandle|amazon|public api/i;
function claimProblems(source: string, en: Record<string, string>): string[] {
  return pageKeys(source).filter((key) => PILOT_ONLY.test(en[key] ?? "")).map((key) => `${key} names a feature that is not open to everyone: "${en[key]}"`);
}

// ---- run --------------------------------------------------------------------------------------------
const translation = translationProblems(SOURCE, TABLE);
ok(`every feature line is written in all twelve languages${translation.length ? ` (${translation.length}: ${translation.slice(0, 12).join("; ")})` : ""}`, translation.length === 0);
const structure = structureProblems(SOURCE);
ok(`the lists line up${structure.length ? ` (${structure.join("; ")})` : ""}`, structure.length === 0);
const claims = claimProblems(SOURCE, EN);
ok(`no pilot feature is offered${claims.length ? ` (${claims.join("; ")})` : ""}`, claims.length === 0);

// ---- the rules catch what they are for -------------------------------------------------------------
const without = (language: string, key: string): Table => ({ ...TABLE, [language]: { ...TABLE[language], [key]: undefined } });
const englishIn = (language: string, key: string): Table => ({ ...TABLE, [language]: { ...TABLE[language], [key]: EN[key] } });
const translationMutants: Array<[string, Table]> = [
  ["a German card line missing", without("Deutsch", "feature.calendar.body")],
  ["an Arabic matrix row missing", without("العربية (Arabic)", "planBridge.bankSpending.title")],
  ["English pasted as Japanese", englishIn("日本語 (Japanese)", "feature.sections.bullet1")],
  ["an old card line missing again", without("Français", "feature.history.body")],
];
for (const [name, mutant] of translationMutants) ok(`the rules catch the mutant: ${name}`, translationProblems(SOURCE, mutant).length > 0);
const iconLine = block(SOURCE, "PLAN_FEATURE_ICONS").split("\n").find((line) => /\{ tone: "violet", icon: FI\("M12 4v16/.test(line)) ?? "";
const structureMutants: Array<[string, string]> = [
  ["a plan row without its icon", SOURCE.replace(`${iconLine}\n`, "")],
  ["a seventh home tile", SOURCE.replace('{ id: "domain", titleKey: "adv.domain.title", bodyKey: "adv.domain.body" }', '{ id: "domain", titleKey: "adv.domain.title", bodyKey: "adv.domain.body" },\n  { id: "production", titleKey: "adv.production.title", bodyKey: "adv.production.body" }')],
  ["an area without its icon", SOURCE.replace(/\n\s*cloud: <path[^\n]*/, "")],
  ["the home tiles drawing every area", SOURCE.replace("{ADVANCED_AREAS.map(area => (\n            <Link", "{[...ADVANCED_AREAS, ...FEATURES_PAGE_AREAS].map(area => (\n            <Link")],
];
for (const [name, mutant] of structureMutants) ok(`the rules catch the mutant: ${name}`, mutant !== SOURCE && structureProblems(mutant).length > 0);
ok("the rules catch the mutant: a pilot feature in a card", claimProblems(SOURCE, { ...EN, "feature.calendar.body": `${EN["feature.calendar.body"]} Customers book online booking slots.` }).length > 0);

if (failures.length) {
  console.error(`SITE FEATURES PAGE CHECK FAILED (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SITE FEATURES PAGE CHECK OK (${checks} checks, ${translationMutants.length + structureMutants.length + 1} mutants caught)`);
