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
// 5. Abroad (14 Nov 2026): nothing on the web decides that an address is outside the UK and stops
//    there — the server reads the country and says what the form must ask; every problem the
//    server can name for a customs declaration has a sentence; the form's lines reach the server
//    as typed, with nothing guessed.
// 6. The tracking number comes back by itself: the panel asks Royal Mail on its own (when it opens,
//    when the tab is looked at again, every half minute for ten minutes), never more often than
//    once in twenty seconds, and a number that has just arrived starts live tracking once.
// The rules run first against known-bad mutants, so a check that cannot fail is itself a failure.
//
//   npx tsx scripts/check-royal-mail-web.mts
import { readFileSync } from "node:fs";
import { studioT } from "../lib/studioflow/language";
import {
  ROYAL_MAIL_AUTO_CHECK, ROYAL_MAIL_CUSTOMS_CATEGORIES, customsItemsFromDrafts, customsLineField, customsTotals, emptyCustomsLine,
  royalMailArrivedNumbers, royalMailAutoCheckDue, royalMailAwaitingNumber, royalMailSaleCategory, royalMailShipmentWaiting,
  royalMailShipmentsChanged, senderContactFrom
} from "../lib/studioflow/royalMailRules";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const FILES = ["app/settings/RoyalMailIntegrationSection.tsx", "app/orders/RoyalMailShipmentPanel.tsx", "lib/studioflow/royalMail.ts", "lib/studioflow/royalMailRules.ts"];
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
// Words that are rightly the same as English in some languages.
const SAME_ALLOWED = new Set(["Royal Mail", "Royal Mail Click & Drop", "In Click & Drop", "Pay as you go", "Service", "VAT", "Key", "Account", "Description", "Documents"]);
// The server's refusal reasons (functions/shipping/royalmail/service.js and callables.js, 31 Oct 2026).
const SERVER_REASONS = [
  "royal_mail_not_enabled", "not_connected", "owner_only", "key_invalid", "key_rejected", "royal_mail_unreachable", "credentials_unreadable",
  "no_token_key", "not_allowed", "not_assigned", "order_not_found", "shipment_not_found", "choice_invalid", "customs_incomplete", "recipient_incomplete",
  "royal_mail_rejected", "label_exists", "cancel_failed", "label_in_click_and_drop", "label_unavailable", "internal"
];

let checks = 0;
const failures: string[] = [];
const expect = (name: string, ok: boolean) => { checks += 1; if (!ok) failures.push(name); };

function screenWords(sources: string[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    for (const m of s.matchAll(/\bt\("((?:[^"\\]|\\.)*)"\)/g)) out.add(m[1]);
    for (const block of ["REASON_MESSAGES", "PROBLEM_MESSAGES", "LINE_PROBLEM_MESSAGES"]) {
      const at = s.indexOf(`const ${block}`);
      if (at < 0) continue;
      const body = s.slice(at, s.indexOf("};", at));
      for (const m of body.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]);
    }
    const formats = s.indexOf("ROYAL_MAIL_PACKAGE_FORMATS");
    if (formats >= 0) for (const m of s.slice(formats, s.indexOf("];", formats)).matchAll(/(?:label|hint): "([^"]+)"/g)) out.add(m[1]);
    const categories = s.indexOf("ROYAL_MAIL_CUSTOMS_CATEGORIES:");
    if (categories >= 0) for (const m of s.slice(categories, s.indexOf("];", categories)).matchAll(/label: "([^"]+)"/g)) out.add(m[1]);
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

// ---- 5. abroad ------------------------------------------------------------------------------------
const orderScreen = read("app/orders/OrderDetailContent.tsx");
const noUkGate = (panelSrc: string, screenSrc: string, clientSrc: string) =>
  !/\babroad\??\s*[:=]|\babroad \?/.test(panelSrc) && !/royalMailUkAddress/.test(screenSrc) && !/export function royalMailUkAddress/.test(clientSrc)
  && !/t\("Royal Mail from NivaDesk sends within the UK for now/.test(panelSrc);
expect("no screen stops an order for being outside the UK: the server reads the country", noUkGate(panel, orderScreen, client));
const asksServer = (src: string) => /setDestination\(next\)/.test(src) && /result\.destination \?\? null/.test(src) && /destination\?\.needsCustoms \? \{ customs:/.test(src)
  && /destination\?\.needsSenderContact \? \{ senderContact:/.test(src) && /data-testid="royal-mail-customs"/.test(src);
expect("the customs form shows where the server says it is needed, and goes with the order", asksServer(panel));

// The problems functions/shipping/royalmail/contract.js can name (recipientProblems, cleanChoice, customsFor).
const SERVER_PROBLEMS = [
  "required:recipient.name", "required:recipient.addressLine1", "required:recipient.city", "country_unknown:recipient.country",
  "postcode_invalid:recipient.postcode", "ni_business:recipient.company", "required:customs.category", "customs_required:customs.items",
  "customs_weight_over:customs.items", "ioss_invalid:customs.iossNumber", "required:senderContact", "weight_invalid:weightGrams"
];
const SERVER_LINE_PROBLEMS = [
  "required:description", "quantity_invalid:quantity", "value_invalid:unitValue", "weight_invalid:unitWeightGrams", "required:hsCode",
  "hs_invalid:hsCode", "required:manufacturerCountry", "country_unknown:manufacturerCountry", "required:merchantProductId"
];
const mapKeys = (src: string, name: string) => {
  const at = src.indexOf(`const ${name}`);
  return new Set([...src.slice(at, src.indexOf("};", at)).matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
};
const unnamed = (src: string) => [...SERVER_PROBLEMS.filter((k) => !mapKeys(src, "PROBLEM_MESSAGES").has(k)), ...SERVER_LINE_PROBLEMS.filter((k) => !mapKeys(src, "LINE_PROBLEM_MESSAGES").has(k))];
expect(`every problem the server names has a sentence${unnamed(client).length ? ` — none for ${unnamed(client).join(", ")}` : ""}`, unnamed(client).length === 0);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
expect("a customs line starts with nothing guessed: no value, no weight, no code, no country", same(emptyCustomsLine("Watch dial"), { description: "Watch dial", quantity: "1", unitValue: "", unitWeightGrams: "", hsCode: "", manufacturerCountry: "", merchantProductId: "" }));
const typed = [
  { description: " Hand-painted dial ", quantity: "2", unitValue: "45,50", unitWeightGrams: "120", hsCode: "9114.30 ", manufacturerCountry: "GB", merchantProductId: " DIAL-1 " },
  { description: "Strap", quantity: "", unitValue: "", unitWeightGrams: "", hsCode: "", manufacturerCountry: "", merchantProductId: "" }
];
expect("the form's lines reach the server as typed: trimmed, a comma read as a decimal point, an empty number left empty", same(customsItemsFromDrafts(typed), [
  { description: "Hand-painted dial", quantity: 2, unitValue: 45.5, unitWeightGrams: 120, hsCode: "911430", manufacturerCountry: "GB", merchantProductId: "DIAL-1" },
  { description: "Strap", quantity: null, unitValue: null, unitWeightGrams: null, hsCode: "", manufacturerCountry: "", merchantProductId: "" }
]));
expect("the totals under the lines: value and weight of one item times how many", same(customsTotals(typed), { value: 91, grams: 240 }));
expect("a line problem is said with its line number", same(customsLineField("customs.items[2].hsCode"), { line: 3, field: "hsCode" }) && customsLineField("customs.category") === null);
expect("Royal Mail's seven customs categories, goods sold online first", same(ROYAL_MAIL_CUSTOMS_CATEGORIES.map((c) => c.id), ["eCommerceSaleOfGoods", "commercialSaleOfGoods", "gift", "commercialSample", "returnedGoods", "documents", "other"])
  && royalMailSaleCategory("eCommerceSaleOfGoods") && royalMailSaleCategory("commercialSaleOfGoods") && !royalMailSaleCategory("gift"));
expect("the USA field is read as a phone or an e-mail", same(senderContactFrom(" 020 7946 0000 "), { phone: "020 7946 0000", email: "" }) && same(senderContactFrom("post@example.invalid"), { phone: "", email: "post@example.invalid" }));

// ---- 6. the tracking number's own way back ----------------------------------------------------------
const row = (id: string, state: string, trackingNumber = "", more: Record<string, unknown> = {}) => ({ id, state, trackingNumber, printedOn: "", shippedOn: "", hasLabel: false, ...more });
expect("waiting: sent, unknown, sending and a printed label; not dispatched, cancelled or refused",
  ["sending", "sent", "unknown", "label"].every((st) => royalMailShipmentWaiting(row("a", st))) && ["dispatched", "cancelled", "rejected", "not_sent"].every((st) => !royalMailShipmentWaiting(row("a", st))));
expect("awaiting a number: waiting and none yet", royalMailAwaitingNumber(row("a", "sent")) && royalMailAwaitingNumber(row("a", "label")) && !royalMailAwaitingNumber(row("a", "label", "TT1GB")) && !royalMailAwaitingNumber(row("a", "dispatched")));
const due = royalMailAutoCheckDue;
expect("the quiet check: only with something waiting, only while the tab is looked at, never twice in twenty seconds",
  due(100_000, 0, true, true) && !due(100_000, 0, false, true) && !due(100_000, 0, true, false) && !due(100_000, 85_000, true, true) && due(100_000, 80_000, true, true));
expect("the quiet check's pace: 20 s apart at least, every 30 s, for 10 minutes", same(ROYAL_MAIL_AUTO_CHECK, { minGapMs: 20_000, pollEveryMs: 30_000, pollForMs: 600_000 }));
expect("a number that has just arrived is told once; one already there is not", same(royalMailArrivedNumbers([row("a", "sent"), row("b", "label", "TT2GB")], [row("a", "label", "TT1GB"), row("b", "label", "TT2GB")]), ["TT1GB"])
  && same(royalMailArrivedNumbers([], [row("a", "label", "TT1GB")]), ["TT1GB"]) && same(royalMailArrivedNumbers([row("a", "label", "TT1GB")], [row("a", "dispatched", "TT1GB")]), []));
expect("the order is reloaded only when something a person sees changed", !royalMailShipmentsChanged([row("a", "sent")] as never, [row("a", "sent")] as never)
  && royalMailShipmentsChanged([row("a", "sent")] as never, [row("a", "label", "TT1GB")] as never) && royalMailShipmentsChanged([row("a", "label", "TT1GB")] as never, [row("a", "dispatched", "TT1GB", { shippedOn: "2026-11-16" })] as never));
const asksOnItsOwn = (src: string) => /window\.addEventListener\("focus", onLook\)/.test(src) && /document\.addEventListener\("visibilitychange", onLook\)/.test(src)
  && /window\.setInterval\(/.test(src) && /ROYAL_MAIL_AUTO_CHECK\.pollEveryMs/.test(src) && /royalMailAutoCheckDue\(/.test(src)
  && /window\.removeEventListener\("focus", onLook\)/.test(src) && /window\.clearInterval\(timer\)/.test(src) && /onClick=\{keepChecking\}/.test(src);
expect("the panel asks Royal Mail on its own: on opening, on coming back to the tab, on a timer it clears", asksOnItsOwn(panel));
const handsOn = (panelSrc: string, screenSrc: string) => /trackingNumberRef\.current\?\.\(number\)/.test(panelSrc) && /onTrackingNumber=\{number => startRoyalMailLiveTracking\(number\)\}/.test(screenSrc)
  && /function startRoyalMailLiveTracking[\s\S]{0,900}cleanTrackingNumber\(order\.trackingNumber\) !== arrived\) return;[\s\S]{0,400}isRegistered\([\s\S]{0,400}royalMailTrackingAsked\.current\.has\(key\)\) return;[\s\S]{0,200}requestLiveTracking\(arrived,/.test(screenSrc);
expect("a number that has just arrived starts live tracking once, and only when it is the order's own number", handsOn(panel, orderScreen));

// ---- the rules catch what they are for ----------------------------------------------------------
expect("mutant: a word with no translation is caught", untranslated(["Send the parcel by owl"], studioT).length === 1);
expect("mutant: a Firestore import is caught", !firestoreFree(`${client}\nimport { getFirestore } from "firebase/firestore";`));
expect("mutant: the panel without its closed guard is caught", !panelClosed(panel.replace("if (!connection || !connection.enabled) return null;", "if (!connection) return null;")));
expect("mutant: a tile drawn without the server's word is caught", !tileClosed(settings.replace("shippingTileShown(royalMail.enabled, royalMail.connected", "shippingTileShown(true, royalMail.connected")));
expect("mutant: a missing refusal sentence is caught", !reasons(client.replace(/\n\s*label_exists:[^\n]*/, "")).has("label_exists"));

expect("mutant: a panel that stops abroad again is caught", !noUkGate(`${panel}\n{abroad ? null : form}`, orderScreen, client));
expect("mutant: an order screen that asks royalMailUkAddress is caught", !noUkGate(panel, `${orderScreen}\nabroad={!royalMailUkAddress(order.shippingCountry)}`, client));
expect("mutant: a customs form that never reaches the server is caught", !asksServer(panel.replace("destination?.needsCustoms ? { customs:", "false ? { customs:")));
expect("mutant: a server problem with no sentence is caught", unnamed(client.replace(/\n\s*"required:hsCode":[^\n]*/, "")).includes("required:hsCode") && unnamed(client.replace(/\n\s*"customs_weight_over:customs.items":[^\n]*/, "")).length === 1);
expect("mutant: a panel that only checks when asked is caught", !asksOnItsOwn(panel.replace('window.addEventListener("focus", onLook);', "")) && !asksOnItsOwn(panel.replace(/window\.setInterval\(/, "window.setTimeout(")));
expect("mutant: a timer that is never cleared is caught", !asksOnItsOwn(panel.replace("window.clearInterval(timer);", "")));
expect("mutant: an arrived number that starts nothing is caught", !handsOn(panel.replace("trackingNumberRef.current?.(number)", "void number"), orderScreen) && !handsOn(panel, orderScreen.replace("onTrackingNumber={number => startRoyalMailLiveTracking(number)}", "")));
expect("mutant: live tracking for a number that is not the order's is caught", !handsOn(panel, orderScreen.replace("cleanTrackingNumber(order.trackingNumber) !== arrived) return;", "false) return;")));

if (failures.length) {
  console.error(`ROYAL MAIL WEB CHECK FAILED (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`ROYAL MAIL WEB CHECK OK (${checks} checks, 14 mutants caught)`);
