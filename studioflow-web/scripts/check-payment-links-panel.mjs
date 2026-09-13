// The two pure decisions inside the Payment Links panel.
//
// tabForStatus() is the one that quietly loses money: a payment request whose
// status has no tab does not appear anywhere, and the status a workspace most
// needs to see — a link that was paid, refunded or disputed — is exactly the
// kind that gets added later without anyone revisiting the tab list. So the
// check drives EVERY status the server-side reducer can produce
// (functions/payments/paymentRequestState.js STATUSES) through it and refuses
// to let one fall off the screen.
//
// formatMinor() is the other: it is a second implementation of what
// functions/payments/money.js does, on the other side of the wire, and a
// zero-decimal currency shown a hundred times too small is the same class of
// bug as charging a hundred times too much.
//
//   npm run test:payment-links
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");
const source = path.join(webRoot, "components", "PaymentLinksPanel.tsx");
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-paylinks-"));

let failures = 0;
function expect(name, ok) {
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}`); }
}

try {
  let diagnostics = "";
  try {
    execFileSync(
      path.join(webRoot, "node_modules", ".bin", "tsc"),
      [source, "--outDir", outDir, "--module", "es2022", "--target", "es2022",
       "--moduleResolution", "bundler", "--jsx", "react-jsx", "--skipLibCheck"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    diagnostics = String((error && error.stdout) || "") + String((error && error.stderr) || "");
  }
  const unexpected = diagnostics
    .split("\n")
    .filter((line) => /error TS\d+:/.test(line))
    .filter((line) => !(/error TS2307:/.test(line) && /'(@\/lib\/[^']+|firebase\/[a-z]+|react\/[a-z-]+|react)'/.test(line)));
  if (unexpected.length) {
    console.log("FAIL tsc reported something other than the expected unresolved imports:");
    for (const line of unexpected) console.log("   " + line);
    failures += 1;
  }

  writeFileSync(path.join(outDir, "io-stub.js"), [
    "const refuse = (name) => () => { throw new Error(`check-payment-links-panel: ${name} must not be called`); };",
    "export const httpsCallable = refuse('httpsCallable');",
    "export const functions = null;",
    "export const useCallback = (fn) => fn;",
    "export const useEffect = () => {};",
    "export const useMemo = (fn) => fn();",
    "export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];",
    "export const useRef = (initial) => ({ current: initial });",
    "export const jsx = () => null;",
    "export const jsxs = () => null;",
    "export const Fragment = null;",
    "",
  ].join("\n"));

  const compiled = path.join(outDir, "PaymentLinksPanel.js");
  writeFileSync(compiled, readFileSync(compiled, "utf8").replace(
    /from ['"](react\/jsx-runtime|react|firebase\/[a-z]+|@\/lib\/[^'"]+)['"]/g,
    "from './io-stub.js'",
  ));

  const { tabForStatus, formatMinor } = await import(pathToFileURL(compiled).href);

  // Every status the server can produce has a tab, and lands in the right one.
  const reducer = readFileSync(path.join(repoRoot, "functions", "payments", "paymentRequestState.js"), "utf8");
  const block = reducer.slice(reducer.indexOf("const STATUSES = Object.freeze(["), reducer.indexOf("]);", reducer.indexOf("const STATUSES")));
  const statuses = (block.match(/"([a-z_]+)"/g) || []).map((token) => token.slice(1, -1));
  expect(`the reducer's status list was read (${statuses.length} statuses)`, statuses.length >= 9);

  const TABS = new Set(["open", "paid", "expired", "cancelled", "problem"]);
  const unmapped = statuses.filter((status) => !TABS.has(tabForStatus(status)));
  expect("every payment request status lands in a real tab", unmapped.length === 0);
  if (unmapped.length) console.log("   unmapped:", unmapped.join(", "));

  const EXPECTED = {
    draft: "open", open: "open", processing: "open",
    paid: "paid", expired: "expired", cancelled: "cancelled",
    refunded: "problem", partially_refunded: "problem", disputed: "problem",
  };
  const wrong = Object.entries(EXPECTED).filter(([status, tab]) => tabForStatus(status) !== tab);
  expect("each status lands in the tab a workspace would look in", wrong.length === 0);
  if (wrong.length) console.log("   wrong:", wrong.map(([s, tab]) => `${s} -> ${tabForStatus(s)} (want ${tab})`).join(", "));

  // A status nobody has tabbed yet is still reachable, not filed away.
  expect("an unknown status is shown rather than hidden", tabForStatus("something_new") === "open");

  // Money. The zero-decimal case is the one that is wrong by a factor of 100.
  expect("GBP 1999 minor units reads as 19.99", /19\.99/.test(formatMinor(1999, "GBP")));
  expect("JPY 500 minor units reads as 500, not 5.00", /500/.test(formatMinor(500, "JPY")) && !/5\.00/.test(formatMinor(500, "JPY")));
  expect("an unknown currency still prints the number", /10\.00/.test(formatMinor(1000, "ZZZ")));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures) { console.log(`\n${failures} payment link panel check(s) failed.`); process.exit(1); }
console.log("\nAll payment link panel checks passed.");
