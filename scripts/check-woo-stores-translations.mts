// Multistore (23 Oct 2026): every literal the WooCommerce settings section sends
// through t() must resolve in every supported language (probed through studioT).
// It also checks the section still names the workspace a store joins, lists the
// stores and offers "Add another store". Control: an unknown key stays English.
import { readFileSync } from "fs";
import { studioT, studioTranslationRow, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const page = readFileSync(new URL("../app/settings/WooCommerceIntegrationSection.tsx", import.meta.url), "utf8");
const KEYS: string[] = [];
for (const match of page.matchAll(/\bt\("([^"]+)"\)/g)) if (!KEYS.includes(match[1])) KEYS.push(match[1]);

const problems: string[] = [];
if (!page.includes('data-testid="woo-target-workspace"')) problems.push("the connect card does not name the target workspace");
if (!/connections\.map\(/.test(page)) problems.push("the section does not list every store");
if (!page.includes('t("Add another store")')) problems.push("no Add another store action");
if (/connections\.find\(\(row\) => row\.status === "connected"\) \|\| connections\.find/.test(page) && !page.includes("selectedId")) problems.push("actions still bound to the first store only");
for (const line of problems) console.log(`PROBLEM ${line}`);

const others = SUPPORTED_STUDIO_LANGUAGES.filter((lang) => lang !== "English");
const missing: string[] = [];
for (const key of KEYS) for (const lang of others) if (studioT(key, lang) === key && !studioTranslationRow(key)?.[lang]) missing.push(`${key} [${lang}]`);
const control = "Woo multistore control key that no table has";
const controlSeen = others.every((lang) => studioT(control, lang) === control);
console.log(`keys ${KEYS.length} × languages ${others.length}; missing ${missing.length}; control ${controlSeen ? "ok" : "BROKEN"}`);
for (const line of missing) console.log(`MISSING ${line}`);
if (problems.length || !controlSeen || missing.length) process.exit(1);
console.log("✅ WOO STORES TRANSLATIONS OK");
