// Amazon's Website Guidelines for solution providers (30 Oct 2026), the parts this repository can break.
//
// Amazon reviews nivadesk.app (and its copy on docs.nivadesk.app) before it publishes the Appstore listing.
// Its guidelines forbid using Amazon's logos or trademarks without written approval, implying Amazon's
// endorsement, unverified superlatives, and placeholder or "under construction" text on the reviewed pages.
//
// 1. No Amazon logo file is shipped, and no page source points at one.
// 2. The integrations directory shows Amazon as an initial (like Meta, DHL and Stripe), not a logo.
// 3. No public page says Amazon approved, certified, endorsed or partnered with NivaDesk.
// 4. The public Amazon page and the directory carry no superlative claims.
//
//   npx tsx scripts/check-amazon-site-rules.mts [--root <dir>]
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
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// 1. logo files and references
const logoFiles = fs.readdirSync(path.join(root, "public/integration-logos")).filter((f) => /amazon/i.test(f));
ok(`no Amazon logo file in public/integration-logos (found: ${logoFiles.join(", ")})`, logoFiles.length === 0);
const sources = [...walk("app"), ...walk("components"), ...walk("lib")];
const logoRefs = sources.filter((f) => /integration-logos\/amazon|amazon[-_]?logo\.(png|svg|jpe?g|webp)/i.test(read(f)));
ok(`no source points at an Amazon logo (${logoRefs.join(", ")})`, logoRefs.length === 0);

// 2. the directory tile
const directory = read("app/integrations/IntegrationsDirectory.tsx");
const amazonRow = directory.split("\n").find((line) => /^\s*\{ name: "Amazon",/.test(line)) || "";
ok("directory: the Amazon row exists", amazonRow.length > 0);
ok("directory: the Amazon tile is an initial, not a logo", /mark: "A"/.test(amazonRow) && !/logo:/.test(amazonRow));
ok("directory: no Amazon brand variant styling a logo", !/Amazon: styles\.amazonBrand/.test(directory));

// 3. endorsement wording on public pages
const publicSources = [
  "app/integrations/IntegrationsDirectory.tsx",
  "app/integrations/amazon/AmazonSellerPage.tsx",
  "lib/publicSite/amazonSellerCopy.ts",
  "lib/publicSite/amazonSellerPageCopy.ts",
  "components/PublicMarketing.tsx"
].map((f) => [f, read(f)] as const);
const ENDORSEMENT = /Amazon (has )?(approved|certified|endorsed|recommends|partnered)|(official|certified|approved) Amazon (partner|app)|Amazon partner\b|in partnership with Amazon/i;
for (const [file, text] of publicSources) {
  const hit = text.match(ENDORSEMENT);
  ok(`${file}: no wording that reads as Amazon's endorsement (${hit ? hit[0] : ""})`, !hit);
}

// 4. superlatives on the reviewed Amazon pages
const SUPERLATIVE = /\b(the best|best-in-class|#1 |number one|world-class|industry-leading|the only (app|tool|solution))\b/i;
for (const file of ["app/integrations/amazon/AmazonSellerPage.tsx", "lib/publicSite/amazonSellerCopy.ts", "app/integrations/IntegrationsDirectory.tsx"]) {
  const hit = read(file).match(SUPERLATIVE);
  ok(`${file}: no superlative claim (${hit ? hit[0] : ""})`, !hit);
}

if (failures.length) {
  console.error(`AMAZON SITE RULES CHECK FAILED (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`AMAZON SITE RULES CHECK OK (${checks} checks)`);
