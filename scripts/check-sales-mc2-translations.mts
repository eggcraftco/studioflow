// MC-2 Sales strings: every source text the Sales page sends through t() must
// resolve in every supported language (probe through studioT, not the file —
// a deeper table or the Mac table can hide a row). Control: a key that is not
// in any table must come back untranslated, or the probe cannot see a gap.
import { studioT, studioTranslationRow, SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const KEYS = [
  "Store", "Every store", "Brand", "Every brand", "No brand", "Two brands — choose one", "From the store",
  "Never synced", "Connected", "Needs attention", "Disconnected", "Stores",
  "Each connected shop account on its own, so two stores on the same platform are never mixed.",
  "No stores connected yet.", "Last sync", "Error code", "Store name", "Save", "Cancel", "Rename", "Brands",
  "Brands are optional. Link a brand to the stores it sells through; an order from a store with two brands waits for you to choose.",
  "No brands yet.", "Edit", "Delete", "Delete this brand? Orders keep their store; nothing else changes.",
  "Not linked to a store yet", "Brand name", "Linked stores", "New brand",
  "Only the owner or an admin can change brands and store names.", "Could not save.",
  "Added by hand", "Website", "Channel"
];

// Plus every literal the page itself sends through t(), and every label-map value.
import { readFileSync } from "fs";
const page = readFileSync(new URL("../app/sales/page.tsx", import.meta.url), "utf8");
for (const match of page.matchAll(/\bt\("([^"]+)"\)/g)) if (!KEYS.includes(match[1])) KEYS.push(match[1]);
for (const map of page.matchAll(/_LABELS: Record<string, string> = \{([^}]+)\}/g)) {
  for (const value of map[1].matchAll(/:\s*"([^"]+)"/g)) if (!KEYS.includes(value[1])) KEYS.push(value[1]);
}

const others = SUPPORTED_STUDIO_LANGUAGES.filter((lang) => lang !== "English");
const missing: string[] = [];
for (const key of KEYS) for (const lang of others) if (studioT(key, lang) === key && !studioTranslationRow(key)?.[lang]) missing.push(`${key} [${lang}]`);
const control = "MC2 control key that no table has";
const controlSeen = others.every((lang) => studioT(control, lang) === control);
console.log(`keys ${KEYS.length} × languages ${others.length}; missing ${missing.length}; control ${controlSeen ? "ok" : "BROKEN"}`);
for (const line of missing) console.log(`MISSING ${line}`);
if (!controlSeen || missing.length) process.exit(1);
console.log("✅ SALES MC-2 TRANSLATIONS OK");
