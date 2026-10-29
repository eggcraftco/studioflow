// Security audit #18 (28 Oct 2026): a report-only CSP with a per-response nonce, preview frames that load only
// Storage or /f/, and one HTML escape for hand-written markup. (The emitted headers on a built app:
// scripts/check-security-headers.js.)
//
// 1. lib/security/contentSecurityPolicy.ts: the directives, the nonce, dev/emulator additions, a hostile
//    authDomain value cannot inject a directive; createCspNonce() is random base64.
// 2. middleware.ts sets the policy on the request (Next's nonce) and the response, keeps the /r/ rewrite;
//    app/layout.tsx puts the nonce on the theme bootstrap; next.config.ts sends no second, static CSP.
// 3. lib/security/framePreview.ts: javascript:/data:/blob:/foreign origins get no frame; both preview frames
//    use it.
// 4. lib/security/escapeHtml.ts; the label print window escapes every value and runs no inline script;
//    OrderDetailContent's PDF exports use the shared escape.
//
//   npx tsx scripts/check-sec-csp.mts [--root <dir>]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
const failures: string[] = [];
let checks = 0;
const ok = (name: string, condition: unknown) => {
  checks += 1;
  if (!condition) failures.push(name);
};
async function load(rel: string) {
  try {
    return await import(pathToFileURL(path.join(root, rel)).href);
  } catch (error) {
    ok(`${rel} loads (${(error as Error).message.split("\n")[0]})`, false);
    return null;
  }
}
const directive = (csp: string, name: string) => (csp.split("; ").find(part => part.startsWith(`${name} `)) || "").slice(name.length + 1).split(" ");

// ---------------------------------------------------------------- 1. the policy
const cspMod = await load("lib/security/contentSecurityPolicy.ts");
if (cspMod) {
  const prod = cspMod.buildContentSecurityPolicy({ nonce: "TESTNONCE123456789==", authDomain: "eggcraft-studio.firebaseapp.com" }) as string;
  ok("header name is Content-Security-Policy-Report-Only", cspMod.CSP_REPORT_ONLY_HEADER === "Content-Security-Policy-Report-Only");
  const script = directive(prod, "script-src");
  ok("script-src: 'self' + the nonce", script.includes("'self'") && script.includes("'nonce-TESTNONCE123456789=='"));
  ok("script-src: gstatic, reCAPTCHA, apis.google", ["https://www.gstatic.com", "https://www.google.com", "https://apis.google.com"].every(h => script.includes(h)));
  ok("script-src: no 'unsafe-inline' / 'unsafe-eval' in production", !script.includes("'unsafe-inline'") && !prod.includes("'unsafe-eval'"));
  const connect = directive(prod, "connect-src");
  for (const host of ["https://firestore.googleapis.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com",
    "https://*.cloudfunctions.net", "https://*.run.app", "https://firebasestorage.googleapis.com", "https://firebaseinstallations.googleapis.com",
    "https://fcmregistrations.googleapis.com", "https://content-firebaseappcheck.googleapis.com"]) {
    ok(`connect-src: ${host}`, connect.includes(host));
  }
  const frame = directive(prod, "frame-src");
  ok("frame-src: 'self' (/f/), reCAPTCHA, Storage, the Auth domain", ["'self'", "https://www.google.com", "https://firebasestorage.googleapis.com", "https://storage.googleapis.com", "https://eggcraft-studio.firebaseapp.com"].every(h => frame.includes(h)));
  ok("frame-ancestors 'none'", directive(prod, "frame-ancestors").join(" ") === "'none'");
  ok("object-src 'none'", directive(prod, "object-src").join(" ") === "'none'");
  ok("base-uri 'self'", directive(prod, "base-uri").join(" ") === "'self'");
  ok("no report-uri / report-to (nothing new is collected)", !/report-uri|report-to/.test(prod));
  ok("no loopback hosts in production", !/127\.0\.0\.1|localhost/.test(prod));
  const dev = cspMod.buildContentSecurityPolicy({ nonce: "n", dev: true }) as string;
  ok("dev: 'unsafe-eval' (React refresh) and loopback websocket", directive(dev, "script-src").includes("'unsafe-eval'") && directive(dev, "connect-src").includes("ws://127.0.0.1:*"));
  const emu = cspMod.buildContentSecurityPolicy({ nonce: "n", emulator: true }) as string;
  ok("emulator build: loopback in connect-src / frame-src, no eval", directive(emu, "connect-src").includes("http://127.0.0.1:*") && !emu.includes("'unsafe-eval'"));
  const hostile = cspMod.buildContentSecurityPolicy({ nonce: "n", authDomain: "x.example; script-src *" }) as string;
  ok("a hostile authDomain value adds nothing", !hostile.includes("x.example") && directive(hostile, "script-src").length === directive(cspMod.buildContentSecurityPolicy({ nonce: "n" }) as string, "script-src").length);
  const n1 = cspMod.createCspNonce() as string;
  const n2 = cspMod.createCspNonce() as string;
  ok("nonce: 16 random bytes in base64, fresh each time", /^[A-Za-z0-9+/]{22}==$/.test(n1) && n1 !== n2);
}

// ---------------------------------------------------------------- 2. wiring
const middleware = read("middleware.ts");
ok("middleware builds the policy with a fresh nonce", /createCspNonce\(\)/.test(middleware) && /buildContentSecurityPolicy\(/.test(middleware));
ok("middleware puts the policy on the request (Next's nonce) and x-nonce", /requestHeaders\.set\("x-nonce", nonce\)/.test(middleware) && /requestHeaders\.set\(CSP_REPORT_ONLY_HEADER\.toLowerCase\(\), policy\)/.test(middleware));
ok("middleware puts the policy on the response", /response\.headers\.set\(CSP_REPORT_ONLY_HEADER, policy\)/.test(middleware));
ok("middleware keeps the /r/ rewrite", /url\.pathname = `\/track\/\$\{match\[1\]\}`/.test(middleware) && /"\/r\/:path\*"/.test(middleware));
ok("middleware matcher is a literal that skips static chunks and prefetches", /source: "\/\(\(\?!_next\/static/.test(middleware) && /next-router-prefetch/.test(middleware));
const layout = read("app/layout.tsx");
ok("layout reads x-nonce and puts it on the theme bootstrap", /\(await headers\(\)\)\.get\("x-nonce"\)/.test(layout) && /<script nonce=\{nonce\} suppressHydrationWarning/.test(layout) && /<ThemeBootstrapScript nonce=\{nonce\} \/>/.test(layout));
const nextConfig = read("next.config.ts");
ok("next.config.ts sends no static Content-Security-Policy header (it would carry no nonce)", !/key: "Content-Security-Policy/.test(nextConfig));

// ---------------------------------------------------------------- 3. preview frames
const frameMod = await load("lib/security/framePreview.ts");
if (frameMod) {
  const site = "https://nivadesk.app";
  const storage = "https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/companies%2Fc%2Ffile.pdf?alt=media&token=t";
  const allowed: Array<[string, string]> = [
    [storage, site],
    ["https://storage.googleapis.com/x.appspot.com/companies/c/file.pdf", site],
    ["/f/abc123/file.pdf", site],
    ["https://nivadesk.app/f/abc123", site],
    ["http://127.0.0.1:9199/v0/b/demo/o/file.pdf?alt=media", "http://localhost:3091"],
  ];
  const refused: Array<[string, string]> = [
    ["javascript:alert(document.domain)", site],
    [" javascript:alert(1)", site],
    ["java\tscript:alert(1)", site],
    ["data:text/html,<script>alert(1)</script>", site],
    ["blob:https://nivadesk.app/1234", site],
    ["https://evil.example/file.pdf", site],
    ["https://firebasestorage.googleapis.com.evil.example/file.pdf", site],
    ["http://firebasestorage.googleapis.com/v0/b/x/o/file.pdf", site],
    ["https://user:pw@firebasestorage.googleapis.com/v0/b/x/o/file.pdf", site],
    ["/orders?x=1", site],
    ["//evil.example/f/abc", site],
    ["http://127.0.0.1:9199/v0/b/demo/o/file.pdf", site],
    ["", site],
  ];
  for (const [url, page] of allowed) ok(`frame allowed: ${url}`, frameMod.safePreviewFrameUrl(url, page) !== "");
  for (const [url, page] of refused) ok(`frame refused: ${JSON.stringify(url)}`, frameMod.safePreviewFrameUrl(url, page) === "");
}
for (const rel of ["app/files/page.tsx", "app/orders/OrderDetailContent.tsx"]) {
  const text = read(rel);
  ok(`${rel}: the preview frame loads safePreviewFrameUrl(...) only`, /safePreviewFrameUrl\((activeFile\.downloadURL|activeUrl),/.test(text) && /<iframe src=\{previewFrameUrl\}/.test(text) && !/<iframe src=\{activeFile\.downloadURL\}/.test(text));
}

// ---------------------------------------------------------------- 4. escaping
const esc = await load("lib/security/escapeHtml.ts");
if (esc) {
  ok("escapeHtml escapes & < > \" '", esc.escapeHtml(`<img src=x onerror="a('b')">&`) === "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  ok("escapeHtml of null/number", esc.escapeHtml(null) === "" && esc.escapeHtml(42) === "42");
}
const label = read("app/inventory/ItemLabelModal.tsx");
const printBody = label.slice(label.indexOf("function print()"), label.indexOf("win.document.close();") + 200);
ok("label print: item number escaped (title and body)", /<title>\$\{escapeHtml\(item\.number\)\}<\/title>/.test(printBody) && /class="num">\$\{escapeHtml\(item\.number\)\}/.test(printBody));
ok("label print: name, location, workspace escaped", /escapeHtml\(item\.name\)/.test(printBody) && /escapeHtml\(item\.location\)/.test(printBody) && /escapeHtml\(workspaceName\)/.test(printBody));
ok("label print: no raw ${item.number} left", !/\$\{item\.number\}/.test(printBody));
ok("label print: no inline <script> in the window (CSP)", !/<script/i.test(printBody) && /win\.print\(\)/.test(printBody));
const order = read("app/orders/OrderDetailContent.tsx");
ok("OrderDetailContent uses the shared escapeHtml", /import \{ escapeHtml \} from "@\/lib\/security\/escapeHtml"/.test(order) && !/function escapeHtml\(/.test(order));

if (failures.length) {
  console.error(failures.map(f => `FAIL ${f}`).join("\n"));
  console.error(`sec-csp ${checks - failures.length}/${checks} pass; reds: ${failures.length}`);
  process.exit(1);
}
console.log(`sec-csp ${checks}/${checks} pass; reds: none`);
