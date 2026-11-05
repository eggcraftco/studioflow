// Legal register H-01 (owner decision 5 Nov 2026, report §9.17): no advertising / remarketing tag and no
// Ads conversion measurement on the web. The Google Ads tag (gtag.js, AW-18283866098) loaded on the public
// site, the landing page and /signup without consent while the cookie banner said otherwise; it was removed.
// Bringing an ad tag back must be a separate, consent-first project — this check goes red if one returns.
//
//   npx tsx scripts/check-no-ad-tags.mts [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const patterns: Array<[string, RegExp]> = [
  ["gtag.js / Google Tag Manager", /googletagmanager\.com/],
  ["Google Ads conversion host", /googleadservices\.com|doubleclick\.net/],
  ["Google Ads account id", /\bAW-\d{6,}/],
  ["gtag() call", /\bgtag\s*\(/],
  ["Meta pixel", /\bfbq\s*\(|facebook\.net\/[a-z_A-Z]+\/fbevents\.js/],
  ["Google Analytics tag", /google-analytics\.com\/(g\/)?collect|\bG-[A-Z0-9]{8,}\b/]
];
const skip = new Set(["node_modules", ".next", ".git", "docs", "public"]);
const self = path.join("scripts", "check-no-ad-tags.mts");
const cspFile = path.join("lib", "security", "contentSecurityPolicy.ts");
const cspCheck = path.join("scripts", "check-sec-csp.mts");
const hits: string[] = [];
function walk(dir: string) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(rel); continue; }
    if (!/\.(tsx?|mts|jsx?|mjs)$/.test(entry.name) || rel === self || rel === cspCheck) continue;
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const [label, re] of patterns) {
      // The CSP file may NAME the removed hosts in its comment; only its code lines are checked.
      const body = rel === cspFile ? text.split("\n").filter(l => !l.trim().startsWith("//")).join("\n") : text;
      if (re.test(body)) hits.push(`${rel}: ${label}`);
    }
  }
}
for (const dir of ["app", "components", "lib", "middleware.ts"]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  if (fs.statSync(abs).isDirectory()) walk(dir);
  else {
    const text = fs.readFileSync(abs, "utf8");
    for (const [label, re] of patterns) if (re.test(text)) hits.push(`${dir}: ${label}`);
  }
}
ok(`no advertising tag in app/, components/, lib/, middleware.ts${hits.length ? " — found: " + hits.join("; ") : ""}`, hits.length === 0);
ok("components/GoogleAdsTag.tsx is gone", !fs.existsSync(path.join(root, "components", "GoogleAdsTag.tsx")));
ok("lib/googleAds.ts is gone", !fs.existsSync(path.join(root, "lib", "googleAds.ts")));

if (failures.length) {
  console.error(`no-ad-tags: ${checks - failures.length}/${checks} passed\n` + failures.map(f => `  FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log(`no-ad-tags: ${checks}/${checks} passed`);
