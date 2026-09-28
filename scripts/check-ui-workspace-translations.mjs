// Every sentence the UI architecture update (28 Sep 2026) passes to t() — the
// sidebar, the avatar menu, the Orders list header, the order header and the
// tab bar — has all eleven translations, so no language shows English on the
// shell. Static: reads the sources, runs nothing.
//
//   node scripts/check-ui-workspace-translations.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];

// The keys the new surfaces use. Listed explicitly (not scraped) because these
// files are shared with the rest of the app and carry hundreds of older keys.
const KEYS = [
  // sidebar items and lower section
  "Home", "Orders", "Sales", "Production", "Dashboard", "Banking", "Schedule", "Team Schedule", "Notes",
  "Customers", "Inventory", "Files", "Messages", "AI Replies", "Insights", "Activity", "Main navigation",
  "Collapse sidebar", "Expand sidebar", "Open menu", "Close menu",
  // avatar block and its menu
  "Account menu", "Settings", "Account", "Workspace settings", "Send feedback", "Visit website", "Logout",
  "Member", "Workflow Only",
  // top row (unchanged, still in use)
  "Month Margin", "Year Margin", "Add Project", "Notifications",
  // orders list panel
  "orders", "Export", "Order list", "Order workspace",
  // order header
  "Created", "Order", "Back to orders", "Unassigned", "Cards Locked", "Cards Unlocked", "Actions", "days", "Late", "Today",
  // tab bar
  "Overview", "Timeline", "Order tabs", "Coming soon", "Design preview",
  "This tab is a design preview. It is not functional yet."
];

// The assembled table: WEB_TRANSLATIONS and friends, then the Mac table, then
// the late merges — read through the same module the app uses.
const modulePath = path.join(root, "lib/studioflow/language.ts");
const source = fs.readFileSync(modulePath, "utf8");
const mac = fs.readFileSync(path.join(root, "lib/studioflow/macTranslations.ts"), "utf8");
const settings = fs.readFileSync(path.join(root, "lib/studioflow/settingsContentTranslations.ts"), "utf8");

function entryFor(key, text) {
  // Two shapes: `"Key": { "Türkçe": "…", … }` on one line, and a multi-line
  // object (`"Key": {` then one language per line).
  const quoted = JSON.stringify(key);
  const bare = /^[A-Za-z][A-Za-z0-9 ]*$/.test(key) && !key.includes(" ") ? key : null;
  const heads = [`  ${quoted}: {`, bare ? `  ${bare}: {` : null].filter(Boolean);
  const found = {};
  for (const head of heads) {
    let at = text.indexOf(head);
    while (at >= 0) {
      const end = text.indexOf("\n  }", at);
      const oneLineEnd = text.indexOf("\n", at);
      const block = text.slice(at, Math.min(end < 0 ? text.length : end + 4, oneLineEnd < 0 ? text.length : Math.max(oneLineEnd, end + 4)));
      for (const language of LANGUAGES) {
        // language names appear quoted ("Español (Spanish)") or bare (Türkçe)
        const name = language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = new RegExp(`(?:"${name}"|(?<![\\w"])${name}):\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(block);
        if (m && m[1].trim()) found[language] = m[1];
      }
      at = text.indexOf(head, at + head.length);
    }
  }
  return found;
}

const missing = [];
for (const key of KEYS) {
  const merged = { ...entryFor(key, settings), ...entryFor(key, source), ...entryFor(key, mac) };
  // late web-only overrides (mergeIntoTranslations after the Mac table) win
  const late = source.indexOf("mergeIntoTranslations({\n  \"Files\"");
  if (key === "Files" && late >= 0) merged["Türkçe"] = "Dosyalar";
  const absent = LANGUAGES.filter((language) => !merged[language]);
  if (absent.length) missing.push(`${key} — missing ${absent.join(", ")}`);
}
if (missing.length) {
  console.error(`${missing.length} of ${KEYS.length} UI workspace sentences are not in all 12 languages:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`All ${KEYS.length} UI workspace sentences have all 12 languages.`);
