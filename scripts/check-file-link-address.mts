// File link address (6 Nov 2026): shared files get their own address — files.yourdomain.com — instead of the
// tracking one (track.yourdomain.com/f/…). Owner's question, 6 Nov: "track … dosyalarda başka bir isim kullanılsın".
//
//   1. the host rule (lib/studioflow/fileLinkHost.ts): the file address only once the server says it is live,
//      a junk or nivadesk.app value never wins, everything else falls back to the client domain exactly as before
//   2. the wiring, read from source: every place that builds a FILE link reads workspace.fileLinkHost; the
//      order-tracking link still reads clientPortalHost; Settings shows the block, and the block talks only to
//      its own callable (never the client-domain or payment ones)
//   3. the words: every sentence the block and the server can show is in all eleven languages; the guide chapter
//      carries the new lines in English, Turkish and the ten GUIDE_T languages, with a paragraph for the
//      website assistant
//
//   npm run test:file-link-address
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileLinkHostFor } from "../lib/studioflow/fileLinkHost.ts";

const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

let checks = 0;
let failures = 0;
function expect(name: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

// 1. the host rule
const portal = "track.eggcraft.co.uk";
const cases: [string, Parameters<typeof fileLinkHostFor>[0], string, string][] = [
  ["no file address: the client domain, as before", {}, portal, portal],
  ["no file address and no client domain: empty (= nivadesk.app)", {}, "", ""],
  ["chosen but not live yet: still the client domain", { fileLinkHost: "files.eggcraft.co.uk", fileLinkHostLive: false }, portal, portal],
  ["live: the file address", { fileLinkHost: "files.eggcraft.co.uk", fileLinkHostLive: true }, portal, "files.eggcraft.co.uk"],
  ["live, typed with a scheme, a path and capitals: cleaned", { fileLinkHost: " HTTPS://Files.Eggcraft.co.uk/x ", fileLinkHostLive: true }, portal, "files.eggcraft.co.uk"],
  ["live only means true, not \"true\"", { fileLinkHost: "files.eggcraft.co.uk", fileLinkHostLive: "true" }, portal, portal],
  ["a nivadesk.app name never wins", { fileLinkHost: "files.nivadesk.app", fileLinkHostLive: true }, portal, portal],
  ["a bare word never wins", { fileLinkHost: "localhost", fileLinkHostLive: true }, portal, portal],
  ["a non-string never wins", { fileLinkHost: 42, fileLinkHostLive: true }, portal, portal],
  ["no workspace document: the client domain", null, portal, portal],
  ["a slug workspace with a live file address", { fileLinkHost: "files.studio.com", fileLinkHostLive: true }, "studio.nivadesk.app", "files.studio.com"]
];
for (const [name, data, portalHost, expected] of cases) {
  const got = fileLinkHostFor(data, portalHost);
  expect(`host rule: ${name}`, got === expected, `got ${JSON.stringify(got)}`);
}

// 2. the wiring
const firestore = read("lib/studioflow/firestore.ts");
expect("workspace: fileLinkHost is derived by fileLinkHostFor from the same client host", /fileLinkHost: fileLinkHostFor\(companyData, clientPortalHost\)/.test(firestore));
expect("workspace: the client host is still custom > slug > empty", /const clientPortalHost = \(\(\) => \{[\s\S]{0,200}clientPortalCustomHost[\s\S]{0,200}clientPortalSlug[\s\S]{0,120}\.nivadesk\.app/.test(firestore));

const library = read("app/files/FilesLibraryView.tsx");
const filesPage = read("app/files/page.tsx");
const order = read("app/orders/OrderDetailContent.tsx");
expect("Files library: Open uses the file host", /openSharedFile\(url, workspace\.fileLinkHost\)/.test(library));
expect("Files page: both file links and the viewer use the file host",
  /maskFileUrl\(file\.downloadURL, workspace\?\.fileLinkHost\)/.test(filesPage)
  && /openStoredFile\(file, workspace\?\.fileLinkHost\)/.test(filesPage)
  && /brandedHost=\{workspace\?\.fileLinkHost\}/.test(filesPage));
expect("Order: the client file card and the preview use the file host", (order.match(/brandedHost=\{workspace\.fileLinkHost\}/g) || []).length === 2);
const fileCallsOnPortalHost = [library, filesPage, order].flatMap(src => src.match(/(maskFileUrl|openSharedFile|openStoredFile|downloadStoredFile|createSharedFileLink)\([^)]*clientPortalHost/g) || []);
const fileCardsOnPortalHost = [filesPage, order].flatMap(src => src.match(/brandedHost=\{workspace\??\.clientPortalHost\}/g) || []);
expect("no file link is built on the tracking host any more", fileCallsOnPortalHost.length === 0 && fileCardsOnPortalHost.length === 0, [...fileCallsOnPortalHost, ...fileCardsOnPortalHost].join(" | "));
expect("Order: the tracking link still uses the client host", /portalUrlForToken\(portal\.token, workspace\.clientPortalHost\)/.test(order));

const section = read("app/settings/ClientDomainSection.tsx");
const block = read("app/settings/FileLinkDomainBlock.tsx");
const clientDomain = read("lib/studioflow/clientDomain.ts");
expect("Settings: the Portal address screen shows the File link address block", /<FileLinkDomainBlock workspace=\{workspace\} t=\{t\} \/>/.test(section));
expect("block: its own callable only", /manageFileLinkDomain/.test(block) && !/requestClientDomain|verifyClientDomain|removeClientDomain|managePaymentLinkDomain/.test(block));
expect("client: manageFileLinkDomain calls the server function of that name with the workspace id",
  /"manageFileLinkDomain",\s*\{ companyId: workspace\.id, action/.test(clientDomain));
expect("block: Live is the server's live flag, not just DNS", /const live = view\?\.live === true;/.test(block) && /\{live\s*\?\s*t\("Live — new file links use this address/.test(block));
expect("block: removing asks first and says what stops working", /window\.confirm\(t\("Remove \{host\}\? File links already sent on that address stop working/.test(block));

// The DNS row's Copy chips (this block, Portal address, Payment link address) set their own text colour: they are
// white chips, and an inherited colour is white in the dark theme — blank boxes, found on screen 7 Nov 2026.
const css = read("app/globals.css");
const copyRule = (css.match(/\n\.client-domain-copy \{[^}]*\}/) || [""])[0];
expect("DNS Copy chip: white chip with its own dark text colour", /background: #fff;/.test(copyRule) && /\n  color: #[0-9a-f]{3,6};/i.test(copyRule), copyRule.replace(/\s+/g, " ").slice(0, 120));

// 3. the words
const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const language = read("lib/studioflow/language.ts");
function translatedEverywhere(key: string) {
  const marker = `${JSON.stringify(key)}: {`;
  const at = language.indexOf(marker);
  if (at < 0) return "missing";
  const line = language.slice(at, language.indexOf("\n", at));
  const missing = LANGS.filter(l => !line.includes(`${JSON.stringify(l)}: "`));
  return missing.length ? `missing ${missing.join(", ")}` : "";
}
const blockStrings = [...block.matchAll(/(?<![\w.])t\("((?:[^"\\]|\\.)*)"\)/g)].map(m => JSON.parse(`"${m[1]}"`));
const runStrings = [...block.matchAll(/\}, "((?:[^"\\]|\\.)*)"\)\}/g)].map(m => JSON.parse(`"${m[1]}"`));
const fallbackStrings = [...block.matchAll(/: "((?:The file address|Something went wrong)[^"]*)"\)/g)].map(m => m[1]);
const serverStrings = [
  "A file address is part of the Pro and Team plans.",
  "Add the file address first, then verify it.",
  "That address is your payment link address — choose another, such as files.yourdomain.com.",
  "The file address could not be updated.",
  "That hostname is already connected to another workspace.",
  "Enter a full hostname like track.yourdomain.com — a subdomain of a domain you own.",
  "DNS cannot route paths like yourdomain.com/track — use a subdomain such as track.yourdomain.com instead."
];
const all = [...new Set([...blockStrings, ...runStrings, ...fallbackStrings, ...serverStrings])];
expect("block: found its sentences", blockStrings.length >= 20, String(blockStrings.length));
for (const key of all) {
  const problem = translatedEverywhere(key);
  expect(`eleven languages: ${key.slice(0, 70)}`, problem === "", problem);
}

// The guide, read the way functions/assistant/buildGuideCorpus.js reads it (the literals only).
function readLiteral(text: string, marker: string, open: string, close: string) {
  const start = text.indexOf(marker);
  const literalStart = text.indexOf(open, text.indexOf("=", start));
  let depth = 0;
  for (let i = literalStart; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close && --depth === 0) return new Function(`return ${text.slice(literalStart, i + 1)};`)();
  }
  throw new Error(`no end for ${marker}`);
}
type Node = { id?: string; blocks?: { kind: string; text?: string; items?: string[] }[]; children?: Node[] };
const guideSource = read("lib/publicSite/guide.ts");
const treeEn: Node[] = readLiteral(guideSource, "const TREE_EN: GuideNode[] = [", "[", "]");
const treeTr: Node[] = readLiteral(guideSource, "const TREE_TR: GuideNode[] = [", "[", "]");
const guideT: Record<string, Record<string, string>> = readLiteral(read("lib/publicSite/guideTranslations.ts"), "export const GUIDE_T", "{", "}");
function find(nodes: Node[], id: string): Node | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = node.children ? find(node.children, id) : undefined;
    if (inner) return inner;
  }
  return undefined;
}
const en = find(treeEn, "set-client-domain");
const tr = find(treeTr, "set-client-domain");
const enBlocks = en?.blocks ?? [];
const subAt = enBlocks.findIndex(b => b.kind === "sub" && b.text === "A separate address for file links, instead of track. (Pro and Team)");
expect("guide EN: the chapter has the new sub-heading", subAt > 0);
const newLines = subAt > 0
  ? enBlocks.slice(subAt, subAt + 4).flatMap(b => (b.text ? [b.text] : b.items ?? []))
  : [];
expect("guide EN: sub-heading, paragraph, four steps, three bullets", newLines.length === 9, String(newLines.length));
expect("guide EN: the paragraph names track. and files. (the website assistant reads paragraphs only)",
  enBlocks[subAt + 1]?.kind === "para" && /track\.yourdomain\.com\/f\//.test(enBlocks[subAt + 1]?.text ?? "") && /files\.yourdomain\.com/.test(enBlocks[subAt + 1]?.text ?? ""));
expect("guide TR: the chapter has the Turkish lines", (tr?.blocks ?? []).some(b => b.kind === "sub" && b.text === "Dosya bağlantıları için track yerine ayrı adres (Pro ve Team)")
  && (tr?.blocks ?? []).some(b => b.kind === "para" && /files\.sizinsite\.com/.test(b.text ?? "")));
for (const lang of LANGS.slice(1)) {
  const dict = guideT[lang] ?? {};
  const missing = newLines.filter(line => !dict[line] || dict[line] === line);
  expect(`guide ${lang}: all nine new lines translated`, missing.length === 0, missing.map(m => m.slice(0, 40)).join(" | "));
}
expect("guide: the old line still describes the default (track.yourdomain.com/f/…)",
  enBlocks.some(b => (b.items ?? []).some(item => item.startsWith("File links follow your name too:"))));

console.log(`\n${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
