// What each Integrations card says about itself, checked deterministically.
//
// resolveIntegrationState() is a pure function of the workspace's signals, and
// it is the only thing standing between a card and a comfortable lie: a green
// badge over a store whose orders stopped arriving, or a "Set up" button for a
// rail this server does not run. It had no test, so every rule in it was one
// edit away from silently changing.
//
//   npm run test:integrations
//
// It lives in lib/studioflow/integrations.ts, which also holds the loader and
// therefore imports Firestore and the callable client. The function under test
// touches none of that, so the compiled module's I/O imports are pointed at a
// stub — the same trick as reading a pure module, without moving 200 lines of
// working code to make it possible. If the stub ever has to grow a real
// implementation, that is the signal the function stopped being pure.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const webRoot = path.resolve(here, "..");
const source = path.join(webRoot, "lib", "studioflow", "integrations.ts");
const outDir = mkdtempSync(path.join(tmpdir(), "nivadesk-integrations-"));

let failures = 0;
function expect(name, ok) {
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}`); }
}

try {
  // Compiled on its own, so the project's "@/..." alias and the firebase
  // packages do not resolve — TS2307 on exactly those imports is expected and
  // is what the stub below replaces. Any OTHER diagnostic is a real break and
  // fails here; tsc still emits, so the module is usable either way.
  let diagnostics = "";
  try {
    execFileSync(
      path.join(webRoot, "node_modules", ".bin", "tsc"),
      [source, "--outDir", outDir, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    diagnostics = String((error && error.stdout) || "") + String((error && error.stderr) || "");
  }
  const unexpected = diagnostics
    .split("\n")
    .filter((line) => /error TS\d+:/.test(line))
    .filter((line) => !(/error TS2307:/.test(line) && /'(@\/lib\/[^']+|firebase\/[a-z]+)'/.test(line)));
  if (unexpected.length) {
    console.log("FAIL tsc reported something other than the expected unresolved imports:");
    for (const line of unexpected) console.log("   " + line);
    failures += 1;
  }

  writeFileSync(path.join(outDir, "io-stub.js"), [
    "// Stand-ins for the loader's I/O. Nothing under test calls any of them;",
    "// each throws so a future resolver that reaches for the network fails here",
    "// rather than quietly passing against a stub that returned undefined.",
    "const refuse = (name) => () => { throw new Error(`check-integration-states: ${name} must not be called`); };",
    "export const collection = refuse('collection');",
    "export const getDocs = refuse('getDocs');",
    "export const httpsCallable = refuse('httpsCallable');",
    "export const db = null;",
    "export const functions = null;",
    "export const getEtsyConnections = refuse('getEtsyConnections');",
    "export const getWooConnections = refuse('getWooConnections');",
    "export const getSquareConnections = refuse('getSquareConnections');",
    "export const getEbayConnections = refuse('getEbayConnections');",
    "export const getIntegrationWebhookInfo = refuse('getIntegrationWebhookInfo');",
    "",
  ].join("\n"));

  const compiled = path.join(outDir, "integrations.js");
  const rewritten = readFileSync(compiled, "utf8").replace(
    /from ['"](firebase\/[a-z]+|@\/lib\/[^'"]+)['"]/g,
    "from './io-stub.js'",
  );
  writeFileSync(compiled, rewritten);

  const mod = await import(pathToFileURL(compiled).href);
  const { resolveIntegrationState, INTEGRATION_PROVIDERS, EMPTY_INTEGRATION_SIGNALS, integrationStateOffersNoAction } = mod;
  const provider = (id) => {
    const found = INTEGRATION_PROVIDERS.find((row) => row.id === id);
    if (!found) throw new Error(`no provider ${id}`);
    return found;
  };
  const state = (id, signals) => resolveIntegrationState(provider(id), { ...EMPTY_INTEGRATION_SIGNALS, ...signals });

  // --- Stripe: the workspace's own account -------------------------------
  {
    // Nothing read yet is not the same as nothing there, and a read that came
    // back refused is a third thing again. Neither offers a button.
    const checking = state("stripe", { stripePayments: undefined });
    expect("stripe: not read yet is 'checking'", checking.state === "checking");
    expect("stripe: 'checking' offers no action", integrationStateOffersNoAction(checking.state));

    const unverified = state("stripe", { stripePayments: null });
    expect("stripe: a failed read is 'unverified'", unverified.state === "unverified");
    expect("stripe: 'unverified' offers no action", integrationStateOffersNoAction(unverified.state));

    // The rail is off on this server. A Set up button here would throw
    // failed-precondition, so the card says the feature is not here.
    const off = state("stripe", { stripePayments: { configured: false, connection: null } });
    expect("stripe: an unconfigured rail reads as 'planned'", off.state === "planned");
    expect("stripe: 'planned' offers no action", integrationStateOffersNoAction(off.state));
  }

  {
    const ready = (connection) => state("stripe", { stripePayments: { configured: true, connection } });

    expect("stripe: configured and never connected is 'available'",
      ready(null).state === "available");
    expect("stripe: an explicitly disconnected account is 'available'",
      ready({ status: "disconnected", chargesEnabled: false, payoutsEnabled: false }).state === "available");

    const onboarding = ready({ status: "onboarding", chargesEnabled: false, payoutsEnabled: false });
    expect("stripe: half-finished onboarding asks for attention",
      onboarding.state === "attention" && onboarding.detail === "Finish Stripe setup");

    const documents = ready({ status: "restricted", chargesEnabled: false, payoutsEnabled: false, requirementsSummary: { pastDueCount: 2, currentlyDueCount: 0 } });
    expect("stripe: a past-due requirement names the documents",
      documents.state === "attention" && documents.detail === "Stripe needs documents");

    const reviewing = ready({ status: "restricted", chargesEnabled: false, payoutsEnabled: false, requirementsSummary: { pastDueCount: 0, currentlyDueCount: 1 } });
    expect("stripe: a restriction with nothing past due reads as a review",
      reviewing.state === "attention" && reviewing.detail === "Stripe is reviewing");

    const connected = ready({ status: "ready", chargesEnabled: true, payoutsEnabled: true });
    expect("stripe: ready with payouts is plain connected",
      connected.state === "connected" && !connected.detail);

    // Charges work, payouts do not. The customer's payment succeeds and the
    // money is safe in the connected account, so this is NOT a broken card.
    const noPayouts = ready({ status: "ready", chargesEnabled: true, payoutsEnabled: false });
    expect("stripe: ready without payouts stays connected and says what is missing",
      noPayouts.state === "connected" && noPayouts.detail === "Payouts not set up yet");

    expect("stripe: an unreachable provider asks for attention",
      ready({ status: "error", chargesEnabled: false, payoutsEnabled: false }).state === "attention");
  }

  // --- The rules that were already there, now held in place ---------------
  {
    expect("shopify: no store is 'available'",
      state("shopify", { shopifyStores: [] }).state === "available");
    expect("shopify: a live store is connected",
      state("shopify", { shopifyStores: [{ shop: "acme.myshopify.com", status: "active" }] }).state === "connected");
    // One uninstalled store is enough: its orders have stopped.
    expect("shopify: one uninstalled store lowers the card",
      state("shopify", { shopifyStores: [{ shop: "a", status: "active" }, { shop: "b", status: "uninstalled" }] }).state === "attention");
    // Pausing is somebody's own decision, so it only counts when all of them are.
    expect("shopify: one paused store out of two stays connected",
      state("shopify", { shopifyStores: [{ shop: "a", status: "active" }, { shop: "b", status: "paused" }] }).state === "connected");
    expect("shopify: every store paused lowers the card",
      state("shopify", { shopifyStores: [{ shop: "a", status: "paused" }] }).state === "attention");
  }

  {
    // The retired pasted-URL webhook has to be said out loud even over a green
    // card, because the shop may still be posting to the address that answers
    // 410 and writes nothing.
    const green = state("shopify", { shopifyStores: [{ shop: "a", status: "active" }], retiredHolds: ["shopify"] });
    expect("a retired webhook hold is flagged even on a connected card",
      green.state === "connected" && green.legacyAddress === true);
  }

  {
    expect("open banking: no connection is 'available'",
      state("openbanking", { bankConnections: 0 }).state === "available");
    expect("open banking: a connection is connected",
      state("openbanking", { bankConnections: 1 }).state === "connected");
  }

  {
    // Every card must resolve to a real state for empty signals — a provider
    // added without a rule would otherwise fall through to whatever the last
    // branch happens to return.
    const LEGAL = new Set(["connected", "attention", "available", "webhook", "planned", "checking", "unverified"]);
    const bad = INTEGRATION_PROVIDERS.filter((row) => !LEGAL.has(resolveIntegrationState(row, EMPTY_INTEGRATION_SIGNALS).state));
    expect(`every one of the ${INTEGRATION_PROVIDERS.length} cards resolves to a real state`, bad.length === 0);
    if (bad.length) console.log("   offenders:", bad.map((row) => row.id).join(", "));
  }

  {
    // A card with nothing to manage must never be the reason a button appears.
    const offenders = INTEGRATION_PROVIDERS.filter((row) => row.kind === "planned" && row.manage);
    expect("no planned card carries a manage target", offenders.length === 0);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures) { console.log(`\n${failures} integration state check(s) failed.`); process.exit(1); }
console.log("\nAll integration state checks passed.");
