// SEC-NAME C-portal (28 Oct 2026): Copy Link on the order's Customer Portal card comes from the getOrderPortalLink
// callable, not from the order document. The document is open to members whose Customers or Financial Info access is
// off, and the page the link opens greets the customer by name and shows paid / remaining / total.
//
//   1. lib/studioflow/customerPortal.ts, run for real against a stubbed firebase/functions:
//      - asks getOrderPortalLink with { companyId, orderId };
//      - a live link -> "link"; no live link -> "none";
//      - permission-denied with reason customers_off / financial_off -> "denied" with that reason; any other
//        permission-denied or unauthenticated -> "denied" other;
//      - no answer (internal, not-found, unavailable, a thrown TypeError) -> "unavailable"; it never throws.
//   2. lib/studioflow/firestore.ts: the order's portal carries its live link id (tokenId), so the card asks again
//      when a fresh link replaces the old one.
//   3. app/orders/OrderDetailContent.tsx wiring: the link is asked for only while it is on and the card is visible;
//      the order's own copy is used only for "unavailable" (apps and links from before the change), never after a
//      "no"; a link that is on but not shown says why instead of "No portal link yet".
//   4. The six new card messages have a row in every one of the 11 languages.
//
//   node scripts/check-portal-link-copy.mjs        (CHECK_ROOT=<a live web tree> runs it against those files: red)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = process.env.CHECK_ROOT
  ? path.resolve(process.env.CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

// 1. customerPortal.ts, run.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "portal-link-copy-"));
fs.writeFileSync(path.join(tmp, "firebase-functions.mjs"), `
export const calls = [];
export let next = null;
export function setNext(fn) { next = fn; }
export function httpsCallable(_functions, name) {
  return async (payload) => { calls.push({ name, payload }); return next(name, payload); };
}
`);
fs.writeFileSync(path.join(tmp, "firebase-client.mjs"), "export const functions = {};\n");
const moduleSource = ts.transpileModule(read("lib/studioflow/customerPortal.ts"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from "firebase\/functions"/g, 'from "./firebase-functions.mjs"')
  .replace(/from "@\/lib\/firebase\/client"/g, 'from "./firebase-client.mjs"');
fs.writeFileSync(path.join(tmp, "customerPortal.mjs"), moduleSource);
const stub = await import(pathToFileURL(path.join(tmp, "firebase-functions.mjs")).href);
const m = await import(pathToFileURL(path.join(tmp, "customerPortal.mjs")).href);
const workspace = { id: "ws_1" };
const fail = (code, details) => () => { const e = new Error(code); e.code = code; if (details) e.details = details; throw e; };
async function lookup(answer) {
  stub.setNext(typeof answer === "function" ? answer : () => ({ data: answer }));
  try { return await m.getOrderPortalLink(workspace, "ord_7"); } catch (error) { return { threw: String(error) }; }
}
const has = typeof m.getOrderPortalLink === "function";
const link = has ? await lookup({ ok: true, active: true, url: "https://secn.nivadesk.app/track/abc" }) : null;
check("module: getOrderPortalLink is exported", has);
check("module: asks getOrderPortalLink with { companyId, orderId }",
  has && stub.calls.at(-1)?.name === "getOrderPortalLink" && stub.calls.at(-1)?.payload?.companyId === "ws_1" && stub.calls.at(-1)?.payload?.orderId === "ord_7");
check("module: a live link -> link", link?.kind === "link" && link.url === "https://secn.nivadesk.app/track/abc");
check("module: no live link -> none", has && (await lookup({ ok: true, active: false, url: "" }))?.kind === "none");
check("module: active but no url -> none", has && (await lookup({ ok: true, active: true, url: "" }))?.kind === "none");
const cust = has ? await lookup(fail("functions/permission-denied", { reason: "customers_off" })) : null;
const fin = has ? await lookup(fail("functions/permission-denied", { reason: "financial_off" })) : null;
check("module: Customers off -> denied customers_off", cust?.kind === "denied" && cust.reason === "customers_off");
check("module: Financial Info off -> denied financial_off", fin?.kind === "denied" && fin.reason === "financial_off");
check("module: another permission-denied -> denied other", has && (await lookup(fail("functions/permission-denied")))?.reason === "other");
check("module: unauthenticated -> denied other", has && (await lookup(fail("functions/unauthenticated")))?.kind === "denied");
for (const code of ["functions/internal", "functions/not-found", "functions/unavailable", "functions/deadline-exceeded"]) {
  check(`module: ${code} -> unavailable`, has && (await lookup(fail(code)))?.kind === "unavailable");
}
check("module: a thrown TypeError -> unavailable, never a throw", has && (await lookup(() => { throw new TypeError("Failed to fetch"); }))?.kind === "unavailable");

// 2. firestore.ts mapping.
const firestore = read("lib/studioflow/firestore.ts");
check("firestore.ts: CustomerPortalDetail carries tokenId", /export type CustomerPortalDetail = \{[\s\S]{0,400}\btokenId: string;/.test(firestore));
check("firestore.ts: tokenId is the order's portalTokenId", /tokenId: stringValue\(data\.portalTokenId, ""\)/.test(firestore));

// 3. Wiring on the card.
const card = read("app/orders/OrderDetailContent.tsx");
check("card: imports getOrderPortalLink", /import \{[^}]*\bgetOrderPortalLink\b[^}]*\} from "@\/lib\/studioflow\/customerPortal"/.test(card));
check("card: the link is no longer the order document's copy", !/const portalUrl = portalUrlForToken\(portal\.token, workspace\.clientPortalHost\);/.test(card));
check("card: asked only while the link is on and the card is visible, once per live link",
  /const portalLinkKey = portal\.active && canShowOrderCard\("customerPortal"\) \? `\$\{order\.id\}:\$\{portal\.tokenId\}` : "";/.test(card)
  && /getOrderPortalLink\(workspace, order\.id\)/.test(card));
check("card: the order's own copy only for 'unavailable', never after a 'no'",
  /portalLookup\?\.kind === "link"\s*\?\s*portalLookup\.url\s*:\s*portalLookup\?\.kind === "unavailable"\s*\?\s*portalUrlForToken\(portal\.token, workspace\.clientPortalHost\)\s*:\s*""/.test(card)
  && (card.match(/portalUrlForToken\(/g) || []).length === 1);
check("card: a link that is on but not shown says why (not 'No portal link yet')",
  /\) : portal\.active \? \(\s*<p className="portal-empty" data-portal-link-state=\{portalLookup\?\.kind \?\? "loading"\}>\s*\{t\(portalLinkStateText\)\}/.test(card));

// 4. Translations.
const MESSAGES = [
  "Getting the link…",
  "The link is on. Copying it needs Customers access.",
  "The link is on. Copying it needs Financial Info access.",
  "The link is on. Your workspace access does not include copying it.",
  "The link could not be found. Create a fresh link to send one.",
  "The link could not be loaded. Try again shortly."
];
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const gap = read("lib/studioflow/screenGapTranslations.ts");
for (const text of MESSAGES) {
  check(`card uses "${text}"`, card.includes(JSON.stringify(text)));
  const row = gap.split("\n").find((line) => line.startsWith(`  ${JSON.stringify(text)}: {`)) || "";
  check(`translations: "${text}" in all 11 languages`, LANGS.every((lang) => new RegExp(`${JSON.stringify(lang).replace(/[()]/g, "\\$&")}: "[^"]+"`).test(row)));
}
const pkg = JSON.parse(read("package.json"));
check("package.json: npm run test:portal-link-copy", pkg.scripts?.["test:portal-link-copy"] === "node scripts/check-portal-link-copy.mjs");

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`portal-link-copy: ${checks - failures.length}/${checks} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`portal-link-copy: ${checks}/${checks} passed`);
