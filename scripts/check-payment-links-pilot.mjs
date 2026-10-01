// The Payment Links pilot gate on the web (S2, 1 Oct 2026).
//
// The server decides which workspaces may use Payment Links: outside the pilot
// getStripePaymentConnection answers `configured: false, reason: "not_in_pilot"`
// and the other eight callables refuse. This checks that every web surface
// follows that answer — a workspace outside the pilot gets no tab, no card, no
// button and no error — and that the one read behind it behaves:
//
//   1. paymentLinksAvailable() (lib/studioflow/stripeConnect.ts), compiled on its
//      own with the callable client stubbed: true only on `configured: true`;
//      false on not_in_pilot, on a rail that is off, and on a failed read; one
//      read per workspace, but a failure is not remembered.
//   2. the surfaces, read from source: the order card returns nothing and asks
//      nothing until the answer is true; Banking draws the tab and the panel only
//      then and sends ?tab=payment-links back to the overview otherwise; the
//      Stripe screen says the neutral sentence for not_in_pilot.
//   3. the new sentences have all eleven languages.
//
//   npm run test:payment-links-pilot
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const read = (rel) => readFileSync(path.join(webRoot, rel), "utf8");
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-paylinks-pilot-"));

let failures = 0;
let checks = 0;
function expect(name, ok, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

try {
  // ---- 1. the read -------------------------------------------------------------------------
  const source = path.join(webRoot, "lib", "studioflow", "stripeConnect.ts");
  let diagnostics = "";
  try {
    execFileSync(path.join(webRoot, "node_modules", ".bin", "tsc"),
      [source, "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    diagnostics = String((error && error.stdout) || "") + String((error && error.stderr) || "");
  }
  const unexpected = diagnostics.split("\n").filter((line) => /error TS\d+:/.test(line))
    .filter((line) => !(/error TS2307:/.test(line) && /'(@\/lib\/[^']+|firebase\/[a-z]+)'/.test(line)));
  expect("stripeConnect.ts compiles (only the aliased imports are unresolved)", unexpected.length === 0, unexpected.join(" | "));

  writeFileSync(path.join(outDir, "io-stub.js"), [
    "export const functions = null;",
    "export const calls = [];",
    "export let answer = null;",
    "export function setAnswer(next) { answer = next; }",
    "export function httpsCallable(_functions, name) {",
    "  return async (data) => {",
    "    calls.push({ name, data });",
    "    if (answer instanceof Error) throw answer;",
    "    return { data: answer };",
    "  };",
    "}",
    "",
  ].join("\n"));
  const compiled = path.join(outDir, "stripeConnect.js");
  writeFileSync(compiled, readFileSync(compiled, "utf8")
    .replace(/from\s+["']firebase\/functions["']/g, 'from "./io-stub.js"')
    .replace(/from\s+["']@\/lib\/firebase\/client["']/g, 'from "./io-stub.js"')
    .replace(/import\s+type[^;]+;\n?/g, ""));
  writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "module" }));
  const stub = await import(pathToFileURL(path.join(outDir, "io-stub.js")).href);
  const { paymentLinksAvailable, getStripeConnection } = await import(pathToFileURL(compiled).href);

  stub.setAnswer({ ok: true, configured: false, reason: "not_in_pilot", connection: { status: "disconnected" } });
  expect("outside the pilot: not available", (await paymentLinksAvailable("ws-out")) === false);
  expect("the reason reaches the Stripe screen", (await getStripeConnection("ws-out")).reason === "not_in_pilot");
  const before = stub.calls.length;
  expect("a 'no' is remembered for the page: no second read", (await paymentLinksAvailable("ws-out")) === false && stub.calls.length === before);

  stub.setAnswer({ ok: true, configured: false, reason: "rail_disabled", connection: null });
  expect("rail switched off on the server: not available", (await paymentLinksAvailable("ws-off")) === false);

  stub.setAnswer({ ok: true, configured: true, reason: "", connection: { status: "ready" } });
  expect("inside the pilot: available", (await paymentLinksAvailable("ws-pilot")) === true);
  const pilotCalls = stub.calls.filter((c) => c.data && c.data.companyId === "ws-pilot").length;
  await paymentLinksAvailable("ws-pilot");
  expect("one read per workspace, shared by every surface", stub.calls.filter((c) => c.data && c.data.companyId === "ws-pilot").length === pilotCalls);
  expect("the read names the workspace and the callable", stub.calls.some((c) => c.name === "getStripePaymentConnection" && c.data.companyId === "ws-pilot"));

  stub.setAnswer(Object.assign(new Error("internal"), { code: "functions/internal" }));
  expect("a failed read hides the surfaces (false), never throws", (await paymentLinksAvailable("ws-flaky")) === false);
  stub.setAnswer({ ok: true, configured: true, reason: "", connection: null });
  expect("a failure is not remembered: the next surface asks again", (await paymentLinksAvailable("ws-flaky")) === true);
  const blankCalls = stub.calls.length;
  expect("no workspace: not available, nothing asked", (await paymentLinksAvailable("  ")) === false && stub.calls.length === blankCalls);

  // ---- 2. the surfaces ---------------------------------------------------------------------
  const card = read("components/OrderPaymentLinks.tsx");
  expect("order card asks the gate for its workspace", /const available = usePaymentLinksAvailable\(companyId\);/.test(card));
  expect("order card lists nothing until the answer is true", /if \(!companyId \|\| !orderId \|\| available !== true\) return;/.test(card));
  const gateAt = card.indexOf("if (available !== true) return null;");
  const errorAt = card.indexOf("if (error) {");
  const emptyAt = card.indexOf("if (!state) return null;");
  expect("order card renders nothing (not even an error) until the answer is true", gateAt > 0 && gateAt < errorAt && gateAt < emptyAt);

  const bank = read("app/bank/page.tsx");
  expect("Banking asks the gate", /const paymentLinksAnswer = usePaymentLinksAvailable\(companyId\);/.test(bank));
  expect("Banking draws the Payment Links tab only inside the pilot", /\.filter\(\(\[key\]\) => key !== "payment-links" \|\| paymentLinksOn\)/.test(bank));
  expect("Banking mounts the panel only inside the pilot", /tab === "payment-links" && paymentLinksOn \?/.test(bank));
  expect("a ?tab=payment-links link outside the pilot falls back to the overview",
    /if \(tab === "payment-links" && paymentLinksAnswer === false\) setTab\("overview"\);/.test(bank));

  const screen = read("app/settings/StripeIntegrationSection.tsx");
  expect("the Stripe screen says the neutral sentence outside the pilot",
    /unavailableReason === "not_in_pilot"\s*\?\s*t\("Card payment links are not available for this workspace yet\."\)/.test(screen));
  const integrations = read("lib/studioflow/integrations.ts");
  expect("the Integrations card reads an unconfigured rail as 'planned' (Coming soon, no button)", /if \(!rail\.configured\) return \{ state: "planned" \};/.test(integrations));
  const settings = read("app/settings/page.tsx");
  expect("a planned card renders no button", /live\.state === "planned" \? null : \(/.test(settings));
  expect("Stripe's onboarding return opens the Stripe screen", /if \(params\.get\("stripe"\)\) \{\s*setIntegrationProvider\("stripe"\);/.test(settings));

  // ---- 3. the sentences --------------------------------------------------------------------
  const language = read("lib/studioflow/language.ts");
  const LANGS = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
  for (const sentence of ["Card payment links are not available for this workspace yet.", "Stripe TEST payment - no real money moved", "Stripe TEST refund - no real money moved"]) {
    const at = language.indexOf(`"${sentence}": {`);
    const line = at >= 0 ? language.slice(at, language.indexOf("\n", at)) : "";
    const missing = LANGS.filter((lang) => !line.includes(`"${lang}": "`));
    expect(`"${sentence}" has all eleven languages`, at >= 0 && missing.length === 0, missing.join(", "));
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures) {
  console.log(`\n${failures} of ${checks} payment-link pilot checks FAILED`);
  process.exit(1);
}
console.log(`All ${checks} payment-link pilot checks passed.`);
