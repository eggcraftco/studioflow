// Security audit #47 (28 Oct 2026): a `?next=` link may only send someone to a path on this site.
//
// 1. lib/security/safeNext.ts: same-origin paths pass (normalised); a backslash, a control character,
//    an absolute / protocol-relative / javascript: URL fall back. Every attack vector is also run
//    through the OLD test (`startsWith("/") && !startsWith("//")`) to show which ones it let through.
// 2. Every reader of ?next= in app/, components/ and lib/ goes through the helper; no copy of the old
//    test is left.
//
//   npx tsx scripts/check-sec-next-guard.mts [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

const ORIGIN = "https://nivadesk.app";
const FALLBACK = "/home";
const oldTest = (next: string) => next.startsWith("/") && !next.startsWith("//");

let safeNextPath: ((next: string | null | undefined, origin: string, fallback: string) => string) | null = null;
try {
  ({ safeNextPath } = await import(pathToFileURL(path.join(root, "lib/security/safeNext.ts")).href));
} catch (error) {
  failures.push(`lib/security/safeNext.ts loads (${(error as Error).message.split("\n")[0]})`);
}

const ATTACKS: string[] = [
  "/\\evil.example",
  "/\\/evil.example",
  "\\\\evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r//evil.example",
  "/\u0000/evil.example",
  "//evil.example",
  "https://evil.example/home",
  "javascript:alert(1)",
  " /orders",
  "",
];
const LEGIT: Array<[string, string]> = [
  ["/orders", "/orders"],
  ["/orders?orderId=abc#stock", "/orders?orderId=abc#stock"],
  ["/connect/shopify?shop=a.myshopify.com&host=x", "/connect/shopify?shop=a.myshopify.com&host=x"],
  ["/inbox?conversation=c1", "/inbox?conversation=c1"],
  ["/a/../settings", "/settings"],
  // An encoded backslash is a literal path segment on this origin, not a host.
  ["/%5Cevil.example", "/%5Cevil.example"],
];

if (safeNextPath) {
  for (const attack of ATTACKS) {
    ok(`refused: ${JSON.stringify(attack)}`, safeNextPath(attack, ORIGIN, FALLBACK) === FALLBACK);
  }
  ok("refused: null", safeNextPath(null, ORIGIN, FALLBACK) === FALLBACK);
  ok("refused: undefined", safeNextPath(undefined, ORIGIN, FALLBACK) === FALLBACK);
  ok("refused: over 2048 characters", safeNextPath(`/${"a".repeat(2050)}`, ORIGIN, FALLBACK) === FALLBACK);
  for (const [next, want] of LEGIT) {
    ok(`kept: ${JSON.stringify(next)} -> ${want}`, safeNextPath(next, ORIGIN, FALLBACK) === want);
  }
  ok("a local origin works the same", safeNextPath("/orders", "http://localhost:3091", FALLBACK) === "/orders");
  ok("a local origin refuses a backslash", safeNextPath("/\\evil.example", "http://localhost:3091", FALLBACK) === FALLBACK);
}

// What the old test let through (documentation of the hole, not a pass/fail on the new code).
const leakedByOld = ATTACKS.filter(oldTest).filter(a => {
  try { return new URL(a, ORIGIN).origin !== ORIGIN; } catch { return false; }
});
ok("the old test is shown to leak at least one vector (control)", leakedByOld.length > 0);

// ---------------------------------------------------------------- 2. readers
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const login = read("app/login/page.tsx");
const signup = read("components/PublicMarketing.tsx");
ok("app/login/page.tsx resolves ?next= with safeNextFromLocation", /safeNextFromLocation\(fallback\)/.test(login));
ok("components/PublicMarketing.tsx resolves ?next= with safeNextFromLocation", /safeNextFromLocation\("\/orders"\)/.test(signup));

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|mts)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const readers: string[] = [];
const oldCopies: string[] = [];
for (const dir of ["app", "components", "lib"]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    if (rel === path.join("lib", "security", "safeNext.ts")) continue;
    if (/\.get\(\s*["']next["']\s*\)/.test(text)) readers.push(rel);
    if (/[nN]ext\w*\.startsWith\("\/"\)\s*&&\s*!\s*\w*[nN]ext\w*\.startsWith\("\/\/"\)/.test(text)) oldCopies.push(rel);
  }
}
ok(`no ?next= reader outside lib/security/safeNext.ts (found: ${readers.join(", ") || "none"})`, readers.length === 0);
ok(`no copy of the old startsWith test (found: ${oldCopies.join(", ") || "none"})`, oldCopies.length === 0);

console.log(`old test leaked: ${leakedByOld.map(a => JSON.stringify(a)).join(" ")}`);
if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-next-guard ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-next-guard ${checks}/${checks} pass; reds: none`);
