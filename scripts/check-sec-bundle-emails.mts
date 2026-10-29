// Security audit #45 + #50 (28 Oct 2026): no admin or internal-test e-mail address ships in the web bundle.
//
// #45 1. lib/security/adminGate.ts: the addresses the live base (7b0dec48) listed in AdminInsightsHub are
//        recognised by digest only — trimmed / upper-case variants too; any other address is not.
//     2. None of those addresses is left in any file of the tree (source, translations, public/, docs/,
//        scripts/), and, when a build is present, in .next/static (the shipped chunks).
//     The addresses are read from git (`git show 7b0dec487:components/AdminInsightsHub.tsx`), so this test
//     does not put them back into the tree itself.
// #50 3. Nothing reads NEXT_PUBLIC_NIVADESK_INTERNAL_BILLING_TEST_EMAILS (a NEXT_PUBLIC_ value is inlined into
//        the page); the plan page's test controls hang on the build flag alone, the server's
//        STRIPE_INTERNAL_TEST_EMAILS decides who can pay in test mode.
//
//   npx tsx scripts/check-sec-bundle-emails.mts [--root <dir>] [--require-build]
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : here;
const requireBuild = process.argv.includes("--require-build");
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};

// The old list, from history (never written into the tree by this test).
let oldList: string[] = [];
try {
  const old = execFileSync("git", ["show", "7b0dec487:components/AdminInsightsHub.tsx"], { cwd: here, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const match = old.match(/NIVADESK_ADMIN_EMAILS = new Set\(\[([^\]]*)\]\)/);
  oldList = match ? [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1].trim().toLowerCase()) : [];
} catch {
  oldList = [];
}
ok(`the live base's admin list is readable from git (${oldList.length} addresses)`, oldList.length >= 3);

// ---------------------------------------------------------------- 1. digest gate
let gate: Record<string, any> | null = null;
try {
  gate = await import(pathToFileURL(path.join(root, "lib/security/adminGate.ts")).href);
} catch (error) {
  ok(`lib/security/adminGate.ts loads (${(error as Error).message.split("\n")[0]})`, false);
}
if (gate) {
  for (const [index, email] of oldList.entries()) {
    ok(`admin #${index + 1} is recognised`, await gate.isNivaDeskAdminEmail(email) === true);
    ok(`admin #${index + 1} is recognised with spaces / capitals`, await gate.isNivaDeskAdminEmail(`  ${email.toUpperCase()} `) === true);
  }
  for (const other of ["someone@example.com", "nivadesk@gmail.co", "contact@nivadesk.co.uk", "review@nivadesk.app"]) {
    ok(`not an admin: ${other}`, await gate.isNivaDeskAdminEmail(other) === false);
  }
  ok("no address → not an admin", await gate.isNivaDeskAdminEmail("") === false && await gate.isNivaDeskAdminEmail(null) === false);
  const digests = await Promise.all(oldList.map(email => gate!.adminEmailDigest(email)));
  ok("the digest set is exactly the old list (nothing added, nothing dropped)",
    gate.NIVADESK_ADMIN_EMAIL_DIGESTS.size === oldList.length && digests.every((d: string) => gate!.NIVADESK_ADMIN_EMAIL_DIGESTS.has(d)));
}

// ---------------------------------------------------------------- 2. no address left anywhere
function walk(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".next")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|mts|mjs|cjs|js|json|md|css|html|txt|xml|example|yml|yaml)$/i.test(entry.name) || entry.name.startsWith(".env")) out.push(full);
  }
  return out;
}
const containing = (files: string[]) => {
  const hits: string[] = [];
  for (const file of files) {
    if (path.basename(file).startsWith(".env") && !file.endsWith(".example")) continue; // values are never read
    const text = fs.readFileSync(file, "utf8").toLowerCase();
    oldList.forEach((email, index) => { if (text.includes(email)) hits.push(`${path.relative(root, file)} (admin #${index + 1})`); });
  }
  return hits;
};
const treeHits = containing(walk(root).filter(f => path.resolve(f) !== path.resolve(fileURLToPath(import.meta.url))));
ok(`no admin address in any file of the tree, translations included (found: ${treeHits.join(", ") || "none"})`, oldList.length > 0 && treeHits.length === 0);

const staticDir = path.join(root, ".next", "static");
if (fs.existsSync(staticDir)) {
  const chunkFiles: string[] = [];
  const walkAll = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walkAll(f); else if (f.endsWith(".js")) chunkFiles.push(f); } };
  walkAll(staticDir);
  const chunkHits = containing(chunkFiles);
  ok(`no admin address in the built chunks (${chunkFiles.length} files; found: ${chunkHits.join(", ") || "none"})`, chunkHits.length === 0);
  console.log(`built chunks scanned: ${chunkFiles.length}`);
} else {
  ok("a build is present for the chunk scan (--require-build)", !requireBuild);
  console.log("built chunks: no .next/static here — chunk scan skipped");
}

// ---------------------------------------------------------------- 3. #50
const plan = (() => { try { return fs.readFileSync(path.join(root, "app/plan/page.tsx"), "utf8"); } catch { return ""; } })();
const readers = walk(root).filter(f => /\.(tsx?|mts|mjs|js)$/.test(f) && path.resolve(f) !== path.resolve(fileURLToPath(import.meta.url)))
  .filter(f => fs.readFileSync(f, "utf8").includes("NEXT_PUBLIC_NIVADESK_INTERNAL_BILLING_TEST_EMAILS"))
  .map(f => path.relative(root, f));
ok(`nothing reads NEXT_PUBLIC_NIVADESK_INTERNAL_BILLING_TEST_EMAILS (found: ${readers.join(", ") || "none"})`, readers.length === 0);
ok("the plan page's test controls hang on the build flag and a signed-in user only",
  /function showInternalBillingControls\(signedIn: boolean\)/.test(plan) && /showInternalBillingControls\(Boolean\(user\)\)/.test(plan));

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-bundle-emails ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-bundle-emails ${checks}/${checks} pass; reds: none`);
