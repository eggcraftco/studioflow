// Royal Mail Click & Drop, web half (app/settings/RoyalMailIntegrationSection.tsx,
// app/orders/RoyalMailShipmentPanel.tsx, lib/studioflow/royalMail.ts):
//
// 1. Every word on those screens reads in all eleven other languages (royalMailTranslations.ts or
//    the app's dictionary); the few that are the same in a language (brand names) are named here.
// 2. The client never touches Firestore for Royal Mail: the connection, its key and every shipment
//    are server-only (royalMail/{companyId}, firestore.rules' catch-all).
// 3. Closed means invisible: the order panel renders nothing and the Settings tile is not drawn
//    unless the server says Royal Mail is open for the workspace.
// 4. Every refusal reason the server gives (functions/shipping/royalmail) has a sentence here.
// The rules run first against known-bad mutants, so a check that cannot fail is itself a failure.
//
//   npx tsx scripts/check-royal-mail-web.mts
import { readFileSync } from "node:fs";
import { studioT } from "../lib/studioflow/language";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const FILES = ["app/settings/RoyalMailIntegrationSection.tsx", "app/orders/RoyalMailShipmentPanel.tsx", "lib/studioflow/royalMail.ts"];
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
// Words that are rightly the same as English in some languages.
const SAME_ALLOWED = new Set(["Royal Mail", "Royal Mail Click & Drop", "In Click & Drop", "Pay as you go", "Service", "VAT", "Key", "Account"]);
// The server's refusal reasons (functions/shipping/royalmail/service.js and callables.js, 31 Oct 2026).
const SERVER_REASONS = [
  "royal_mail_not_enabled", "not_connected", "owner_only", "key_invalid", "key_rejected", "royal_mail_unreachable", "credentials_unreadable",
  "no_token_key", "not_allowed", "not_assigned", "order_not_found", "shipment_not_found", "choice_invalid", "recipient_incomplete",
  "royal_mail_rejected", "label_exists", "cancel_failed", "label_in_click_and_drop", "label_unavailable", "internal"
];

let checks = 0;
const failures: string[] = [];
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };

function screenWords(sources: string[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    for (const m of s.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)) out.add(m[1]);
    for (const block of ["REASON_MESSAGES", "PROBLEM_MESSAGES"]) {
      const at = s.indexOf(`const ${block}`);
      if (at < 0) continue;
      const body = s.slice(at, s.indexOf("};", at));
      for (const m of body.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]);
    }
    const formats = s.indexOf("ROYAL_MAIL_PACKAGE_FORMATS");
    if (formats >= 0) for (const m of s.slice(formats, s.indexOf("];", formats)).matchAll(/(?:label|hint): "([^"]+)"/g)) out.add(m[1]);
    const chip = s.indexOf("function stateChip");
    if (chip >= 0) for (const m of s.slice(chip, s.indexOf("\n}\n", chip)).matchAll(/label: "([^"]+)"/g)) out.add(m[1]);
  }
  return [...out];
}
const untranslated = (words: string[], dict: (w: string, l: string) => string) =>
  words.filter((w) => !SAME_ALLOWED.has(w) && LANGS.some((l) => dict(w, l) === w));

const sources = FILES.map(read);
const words = screenWords(sources);
expect(`read the screens' words (${words.length})`, words.length > 80);
const missing = untranslated(words, studioT);
expect(`every word reads in eleven languages${missing.length ? ` — missing: ${missing.slice(0, 5).join(" | ")}` : ""}`, missing.length === 0);

const client = read("lib/studioflow/royalMail.ts");
const firestoreFree = (src: string) => !/from "firebase\/firestore"|getFirestore|collection\(|doc\(db/.test(src);
expect("lib/studioflow/royalMail.ts never touches Firestore", FILES.every((f, i) => firestoreFree(sources[i])));

const panel = sources[1];
const panelClosed = (src: string) => /if \(!connection \|\| !connection\.enabled\) return null;/.test(src);
expect("the order panel renders nothing until the server opens Royal Mail", panelClosed(panel));

const settings = read("app/settings/page.tsx");
const tileClosed = (src: string) => /shippingTileShown\(royalMail\.enabled, royalMail\.connected/.test(src)
  && /showRoyalMailTile && royalMail \?/.test(src)
  && /managing === "royalmail" \? <RoyalMailIntegrationSection/.test(src);
expect("the Settings tile is drawn only where the server opened Royal Mail, and opens its screen", tileClosed(settings));

const reasons = (src: string) => {
  const at = src.indexOf("const REASON_MESSAGES");
  return new Set([...src.slice(at, src.indexOf("};", at)).matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]));
};
const known = reasons(client);
const unexplained = SERVER_REASONS.filter((r) => !known.has(r));
expect(`every server refusal has a sentence${unexplained.length ? ` — none for ${unexplained.join(", ")}` : ""}`, unexplained.length === 0);

// ---- the rules catch what they are for ----------------------------------------------------------
expect("mutant: a word with no translation is caught", untranslated(["Send the parcel by owl"], studioT).length === 1);
expect("mutant: a Firestore import is caught", !firestoreFree(`${client}\nimport { getFirestore } from "firebase/firestore";`));
expect("mutant: the panel without its closed guard is caught", !panelClosed(panel.replace("if (!connection || !connection.enabled) return null;", "if (!connection) return null;")));
expect("mutant: a tile drawn without the server's word is caught", !tileClosed(settings.replace("shippingTileShown(royalMail.enabled, royalMail.connected", "shippingTileShown(true, royalMail.connected")));
expect("mutant: a missing refusal sentence is caught", !reasons(client.replace(/\n\s*label_exists:[^\n]*/, "")).has("label_exists"));

if (failures.length) {
  console.error(`ROYAL MAIL WEB CHECK FAILED (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`ROYAL MAIL WEB CHECK OK (${checks} checks, 5 mutants caught)`);
