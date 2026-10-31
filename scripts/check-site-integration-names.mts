// The public site names its integrations; it shows no provider logo (owner, 31 Oct 2026: "web sitesindeki
// integration'lardaki tüm logoları kaldır, onun yerine altındaki gibi isimler kalsın sadece").
//
// 1. No provider logo file is shipped for the site (public/integration-logos is gone) and no public source
//    points at one, nor at the app's own brand copies under public/brand/integrations.
// 2. /integrations: a card is its category and its name — no logo, no initial tile, no link to the
//    provider's site; the page draws one image, NivaDesk's own logo in the hero.
// 3. The hero diagram writes names, and only names of cards the page lists.
// 4. The page's CSS paints no picture: no url(), and the only img rule is NivaDesk's hub logo.
// The in-app Settings ▸ Integrations tiles are the app, not the site, and keep their files.
//
//   npx tsx scripts/check-site-integration-names.mts [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(path.join(root, dir))) return out;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// ---- the rules ------------------------------------------------------------------------------------
const DIRECTORY = "app/integrations/IntegrationsDirectory.tsx";
const CSS = "app/integrations/integrations.module.css";
const HUB_LOGO = "/brand/nivadesk-logo-dark.png";

function directoryProblems(directory: string): string[] {
  const out: string[] = [];
  const rows = directory.split("\n").filter((line) => /^\s*\{ name: "/.test(line));
  if (rows.length < 10) out.push(`read ${rows.length} card rows — the reader is out of date`);
  for (const row of rows) {
    const name = row.match(/name: "([^"]+)"/)?.[1] ?? "?";
    if (/\blogo:|\bmark:|\bwebsite:/.test(row)) out.push(`${name}: the row still carries a logo, an initial or the provider's site`);
  }
  const images = [...directory.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (images.some((src) => src !== HUB_LOGO)) out.push(`an image other than NivaDesk's own: ${images.filter((src) => src !== HUB_LOGO).join(", ")}`);
  if (/<img\b(?![^>]*src=")/.test(directory)) out.push("an image whose source is not a literal");
  if (/integration-logos|brand\/integrations/.test(directory)) out.push("points at a provider logo path");
  if (/styles\.(brand|brandMark|cardTop)\b|logoVariants/.test(directory)) out.push("the logo tile is still drawn");
  if (!/<p className=\{styles\.category\}>\{item\.category\}<\/p><h3>\{item\.name\}<\/h3>/.test(directory)) out.push("a card does not open with its category and its name");
  if (/href=\{item\.website\}/.test(directory)) out.push("a card links to the provider's site");
  // The diagram: every node is a plain name, and a name of a card on this page.
  const cardNames = new Set(rows.map((row) => row.match(/name: "([^"]+)"/)?.[1]));
  const nodes = [...directory.matchAll(/className=\{`\$\{styles\.(serviceNode|ghostNode)\}[^`]*`\}(?: aria-hidden="true")?>([^<]*)<\/div>/g)];
  if (nodes.length < 6) out.push(`the diagram has ${nodes.length} plain-name nodes — a node is not a plain name, or the reader is out of date`);
  const nodeOpenings = (directory.match(/styles\.(serviceNode|ghostNode)\}/g) || []).length;
  if (nodeOpenings !== nodes.length) out.push(`${nodeOpenings - nodes.length} diagram node(s) hold something other than a name`);
  for (const [, , text] of nodes) if (!cardNames.has(text)) out.push(`the diagram names "${text}", which is not a card on the page`);
  return out;
}

function cssProblems(css: string): string[] {
  const out: string[] = [];
  if (/url\(|image-set\(/.test(css)) out.push("paints an image");
  const imgRules = [...css.matchAll(/([^{}]*\bimg\b[^{}]*)\{/g)].map((m) => m[1].trim()).filter((sel) => sel !== ".hub img");
  if (imgRules.length) out.push(`styles an image other than the hub logo: ${imgRules.join(" | ")}`);
  if (/\.(brand|brandMark|cardTop|wooBrand|paypalBrand|chatgptBrand|whatsAppBrand)\b/.test(css)) out.push("keeps the logo tile classes");
  return out;
}

// ---- 1. files and references -----------------------------------------------------------------------
const logoDir = path.join(root, "public/integration-logos");
ok(`no provider logo folder for the site (public/integration-logos: ${fs.existsSync(logoDir) ? fs.readdirSync(logoDir).join(", ") || "empty" : "absent"})`, !fs.existsSync(logoDir) || fs.readdirSync(logoDir).length === 0);
const sources = [...walk("app"), ...walk("components"), ...walk("lib")];
const refs = sources.filter((f) => /integration-logos/.test(read(f)));
ok(`no source points at public/integration-logos (${refs.join(", ")})`, refs.length === 0);
// Public pages must not borrow the app's brand copies either.
const publicPages = [DIRECTORY, ...walk("app/integrations"), "components/PublicMarketing.tsx", "components/CustomOrderLanding.tsx"];
const borrowed = [...new Set(publicPages)].filter((f) => /brand\/integrations/.test(read(f)));
ok(`no public page uses the app's brand copies (${borrowed.join(", ")})`, borrowed.length === 0);

// ---- 2–4. the page ---------------------------------------------------------------------------------
const directory = read(DIRECTORY);
const css = read(CSS);
const dirProblems = directoryProblems(directory);
ok(`the directory is names only${dirProblems.length ? ` (${dirProblems.join("; ")})` : ""}`, dirProblems.length === 0);
const styleProblems = cssProblems(css);
ok(`the page's CSS paints no logo${styleProblems.length ? ` (${styleProblems.join("; ")})` : ""}`, styleProblems.length === 0);

// ---- the rules catch what they are for -------------------------------------------------------------
const shopifyRow = directory.split("\n").find((line) => /^\s*\{ name: "Shopify",/.test(line)) || "";
const dirMutants: Array<[string, string]> = [
  ["a logo back on a row", directory.replace(shopifyRow, shopifyRow.replace('{ name: "Shopify",', '{ name: "Shopify", logo: "/integration-logos/shopify.svg",'))],
  ["an initial tile back on a row", directory.replace(shopifyRow, shopifyRow.replace('{ name: "Shopify",', '{ name: "Shopify", mark: "S",'))],
  ["the provider's site back on a row", directory.replace(shopifyRow, shopifyRow.replace('{ name: "Shopify",', '{ name: "Shopify", website: "https://www.shopify.com/",'))],
  ["a logo in a diagram node", directory.replace(">Shopify</div>", '><img src="/integration-logos/shopify.svg" alt="Shopify" /></div>')],
  ["a diagram name the page does not list", directory.replace(">Etsy</div>", ">Monzo</div>")],
  ["the card's name dropped", directory.replace("<h3>{item.name}</h3>", "")],
  ["the logo tile drawn again", directory.replace("<p className={styles.category}>", "<a className={styles.brand} href={item.website}>x</a><p className={styles.category}>")],
];
for (const [name, mutant] of dirMutants) ok(`the rules catch the mutant: ${name}`, mutant !== directory && directoryProblems(mutant).length > 0);
const cssMutants: Array<[string, string]> = [
  ["a logo image rule", `${css}\n.serviceNode img{max-width:56px}`],
  ["a background logo", `${css}\n.serviceNode{background:url(/integration-logos/etsy.svg)}`],
  ["the brand tile class", `${css}\n.brandMark{width:48px}`],
];
for (const [name, mutant] of cssMutants) ok(`the rules catch the CSS mutant: ${name}`, cssProblems(mutant).length > 0);

if (failures.length) {
  console.error(`SITE INTEGRATION NAMES CHECK FAILED (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SITE INTEGRATION NAMES CHECK OK (${checks} checks, ${dirMutants.length + cssMutants.length} mutants caught)`);
