// Every sentence the customer inbox screens pass to t() has all eleven
// translations in lib/studioflow/language.ts — so no language shows English
// halfway through a screen. Static: reads the sources, runs nothing.
//
//   node scripts/check-inbox-translations.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCREENS = [
  "app/inbox/InboxContent.tsx",
  "app/inbox/InboxAttachment.tsx",
  "app/settings/CustomerChannelPanel.tsx",
  "app/inbox/EmojiPicker.tsx",
  // The empty list's sentences, returned as keys the screen passes to t().
  "lib/studioflow/inboxEmptyState.ts"
];
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português",
  "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const dictionary = fs.readFileSync(path.join(root, "lib/studioflow/language.ts"), "utf8");

// Keys: t("…") literals, plus the sentences the screens map to keys first
// (deliveryLabel, failureReason, STATE_LABEL, …): any "…" returned from a
// function or stored in a table that t() is later applied to. Collected as
// every double-quoted literal that is passed to t() or returned in a switch.
const keys = new Set();
for (const file of SCREENS) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const m of source.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) keys.add(m[1]);
  for (const m of source.matchAll(/return "((?:[^"\\]|\\.)+)";/g)) if (/[a-z] [a-z]/i.test(m[1]) || /^[A-Z][a-z]+$/.test(m[1])) keys.add(m[1]);
}

const unescape = (s) => s.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
const missing = [];
for (const raw of keys) {
  const key = unescape(raw);
  const at = dictionary.indexOf(`${JSON.stringify(key)}: {`);
  if (at < 0) { missing.push(`${key.slice(0, 70)} — no entry`); continue; }
  const line = dictionary.slice(at, dictionary.indexOf("\n", at));
  const absent = LANGUAGES.filter((language) => !line.includes(`${JSON.stringify(language)}:`));
  if (absent.length) missing.push(`${key.slice(0, 70)} — missing ${absent.join(", ")}`);
}
if (missing.length) {
  console.error(`${missing.length} of ${keys.size} inbox sentences are not in all 12 languages:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`All ${keys.size} inbox sentences have all 12 languages.`);
