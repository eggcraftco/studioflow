/**
 * Home ▸ Getting started, 16 Oct 2026 (owner report). Imports the real modules —
 * no copies of the tables under test.
 *
 *  1. "Import your first order" opened Settings ▸ Integrations with no word of
 *     why. It is "Bring in your first order" now and opens the "Bring in your
 *     orders" sheet; it is done once the workspace has ANY order.
 *  2. "View checklist" opened /settings, which lands on Profile & Security. It
 *     opens Settings ▸ Getting started, the full checklist, now.
 *  3. "Skip for now" waved off one step, and the server keeps skips only for the
 *     six fallback ids — a skip of any step the server names was dropped on save
 *     and came back. It hides the card (the synced Home layout) with Undo now.
 *
 * Run: npm run test:getting-started   (npx tsx scripts/check-getting-started.mts)
 * Optional: NIVADESK_FUNCTIONS_INDEX=<path to functions/index.js> also runs the
 * server's own cleanSetupSkipped / cleanHomeLayout against what the card sends.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "demo-not-a-real-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-getting-started";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= "demo-getting-started.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||= "1:0:web:demo";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => (existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : "");

let passed = 0;
let failed = 0;
async function check(name: string, run: () => void | Promise<void>) {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`);
  }
}

// Every step the server can send (functions/lifecycle/checklist.js: the
// "onboarding" line, PRELUDE_COPY and STEP_COPY).
const SERVER_KEYS = [
  "onboarding", "integration_connected", "bank_connected", "ai_business_data_connected",
  "external_order_imported", "order_created", "customer_created", "bank_match_completed",
  "inventory_item_created", "inventory_consumed_by_order", "grounded_ai_answer", "accounting_connected",
];
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const NEW_STRINGS = [
  "Bring in your first order", "Connect your shop, or add an order by hand.", "Bring in your orders",
  "Orders reach NivaDesk in two ways: a connected shop sends them in on its own, or you add one yourself.",
  "Connect a shop", "Add one by hand", "For a commission, a repair or a sale that did not come through a shop.",
  "This step is done once your workspace has its first order, imported or added by hand.",
  "Getting started is hidden from Home.", "Open it again any time from Settings → Getting started.",
  "Show on Home", "Hide from Home", "Your setup checklist, step by step.", "Choose how",
];

const server = (key: string, done = false, action = "x", target?: { orderId?: string }) =>
  ({ key, title: `server title ${key}`, detail: `server detail ${key}`, action, done, target });
const facts = (hasOrder: boolean) => ({
  setupFinished: false, hasCustomer: false, hasOrder, hasStoreOrder: false, hasInventory: false, hasBankTransaction: false,
});

(async () => {
  const gs = await import("../lib/studioflow/gettingStarted.ts").catch(() => null);
  const homeCards = await import("../lib/studioflow/homeCards.ts");
  const setupChecklist = await import("../lib/studioflow/setupChecklist.ts");
  const language = await import("../lib/studioflow/language.ts");
  const need = () => { assert.ok(gs, "lib/studioflow/gettingStarted.ts is missing"); return gs!; };

  // ------------------------------------------------ 1. Bring in your first order
  await check("1a 'Import your first order' opens the Bring in your orders sheet, not Integrations", () => {
    const [step] = need().resolveGettingStartedSteps([server("external_order_imported", false, "integrations")], facts(false));
    assert.equal(step.label, "Bring in your first order");
    assert.equal(step.opensBringIn, true);
    assert.equal(step.href, "/settings?section=getting-started&sheet=orders");
    assert.ok(!step.href.includes("section=integrations"), step.href);
  });
  await check("1b the first-order step is done by ANY order (imported or added by hand)", () => {
    const [noOrder] = need().resolveGettingStartedSteps([server("external_order_imported", false)], facts(false));
    const [handOrder] = need().resolveGettingStartedSteps([server("external_order_imported", false)], facts(true));
    const [imported] = need().resolveGettingStartedSteps([server("external_order_imported", true)], facts(false));
    assert.deepEqual([noOrder.done, handOrder.done, imported.done], [false, true, true]);
  });
  await check("1c the Dashboard card's link for that step is the sheet too", () => {
    assert.equal(setupChecklist.setupStepHref("integrations", undefined, "external_order_imported"), "/settings?section=getting-started&sheet=orders");
    assert.ok(read("app/dashboard/page.tsx").includes("setupStepHref(step.action, step.target, step.key)"), "dashboard passes the step key");
  });
  await check("1d every server step has a destination (only the 'onboarding' statement has none)", () => {
    const steps = need().resolveGettingStartedSteps(SERVER_KEYS.map((key) => server(key)), facts(false));
    const without = steps.filter((step) => !step.href).map((step) => step.id);
    assert.deepEqual(without, ["onboarding"]);
    assert.deepEqual([...need().SERVER_STEP_KEYS].sort(), [...SERVER_KEYS].sort(), "the client knows exactly the server's keys");
  });
  await check("1e each step opens the screen that completes it", () => {
    const href = (key: string, action = "x") => need().serverStepHref(key, action);
    assert.equal(href("integration_connected"), "/settings?section=integrations&category=commerce&intent=connect-shop");
    assert.equal(href("order_created"), "/orders?new=1");
    assert.equal(href("customer_created"), "/customers?new=1");
    assert.equal(href("inventory_item_created"), "/inventory?new=1");
    assert.equal(href("bank_connected"), "/bank");
    assert.equal(href("grounded_ai_answer"), "/chatgpt");
    assert.equal(href("accounting_connected"), "/settings?section=integrations&category=banking");
    assert.equal(need().serverStepHref("order_created", "open_order", { orderId: "o 1" }), "/orders?orderId=o%201");
  });
  await check("1f the sheet offers only shops this workspace can connect (no Coming soon)", () => {
    assert.deepEqual([...need().BRING_IN_STORE_IDS], ["shopify", "etsy", "woocommerce", "amazon", "ebay"]);
    for (const state of ["available", "connected", "attention"]) assert.equal(need().bringInOffers(state), true, state);
    for (const state of ["planned", "checking", "unverified", "webhook"]) assert.equal(need().bringInOffers(state), false, state);
    const sheet = read("components/home/GettingStartedChecklist.tsx");
    assert.ok(sheet.includes("resolveIntegrationState(provider, signals)"), "the sheet asks the Integrations hub's own state");
    assert.ok(sheet.includes('href="/orders?new=1"'), "the sheet's 'Add one by hand' opens the order form");
  });

  // ------------------------------------------------ 2. View checklist
  await check("2a 'View checklist' opens Settings ▸ Getting started, not Settings (Profile)", () => {
    const card = homeCards.HOME_CARDS.find((definition) => definition.id === "gettingStarted");
    assert.equal(card?.href, "/settings?section=getting-started");
    assert.equal(card?.linkLabel, "View checklist");
  });
  await check("2b Settings has a Getting started section, the owner's only, drawing the full checklist", () => {
    const settings = read("app/settings/page.tsx");
    assert.match(settings, /\{ id: "getting-started", title: "Getting started"/);
    assert.match(settings, /if \(sectionId === "getting-started"\) return false;/);
    assert.match(settings, /case "getting-started":\s*\n\s*return <GettingStartedChecklist /);
    const list = read("components/home/GettingStartedChecklist.tsx");
    assert.ok(list.includes("steps.map((step)") && list.includes('data-done={step.done ? "true" : "false"}'), "every step, done or not");
  });

  // ------------------------------------------------ 3. Skip for now
  await check("3a 'Skip for now' hides the card (layout), and Undo restores the exact layout", () => {
    const before = homeCards.defaultHomeLayout();
    const after = need().skipGettingStarted(before);
    assert.ok(after.hidden.includes("gettingStarted"));
    assert.ok(!homeCards.visibleHomeCards(after, { role: "owner", memberAccess: {} } as never).some((card) => card.placement.id === "gettingStarted"));
    assert.equal(need().gettingStartedHidden(after), true);
    assert.equal(need().gettingStartedHidden(before), false);
    // Synced: the same JSON every client parses keeps it hidden.
    assert.equal(need().gettingStartedHidden(homeCards.normaliseHomeLayout(JSON.parse(JSON.stringify(after)))), true);
    const shown = need().showGettingStarted(after);
    assert.equal(need().gettingStartedHidden(shown), false);
  });
  await check("3b Home wires Skip to the card, not to one step, with Undo", () => {
    const page = read("app/home/page.tsx");
    const body = read("components/home/HomeCardBodies.tsx");
    assert.ok(page.includes("skipGettingStarted(before)") && page.includes('actionLabel: t("Undo")'), "skip + undo on Home");
    assert.ok(!page.includes("saveSetupSkipped"), "Home no longer writes setupSkipped");
    assert.ok(!/onSkip\(next\.id\)/.test(body), "the card no longer skips one step");
    assert.ok(body.includes("onSkipCard()"), "the card's Skip hides the card");
  });
  const functionsIndex = process.env.NIVADESK_FUNCTIONS_INDEX || "";
  if (functionsIndex && existsSync(functionsIndex)) {
    const source = readFileSync(functionsIndex, "utf8");
    const grab = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)) + end.length);
    const sandbox: Record<string, unknown> = {};
    vm.runInNewContext([
      grab("const HOME_CARD_SIZES_BY_ID = {", "};"),
      grab("const HOME_CARD_TONES = ", ";"),
      grab("const HOME_CARD_PERIODS = ", ";"),
      grab("const SETUP_STEP_IDS = ", ";"),
      grab("function cleanSetupSkipped(raw) {", "\n}"),
      grab("function cleanHomeLayout(raw) {", "\n}"),
      "this.cleanSetupSkipped = cleanSetupSkipped; this.cleanHomeLayout = cleanHomeLayout;",
    ].join("\n"), sandbox);
    const cleanSetupSkipped = sandbox.cleanSetupSkipped as (raw: unknown) => string[];
    const cleanHomeLayout = sandbox.cleanHomeLayout as (raw: unknown) => string;
    await check("3c (server) why the old Skip came back: a server step id is dropped by cleanSetupSkipped", () => {
      // JSON, because the array comes from another realm (node:vm).
      assert.equal(JSON.stringify(cleanSetupSkipped(["external_order_imported", "integration_connected"])), "[]");
      assert.equal(JSON.stringify(cleanSetupSkipped(["shop"])), '["shop"]', "only the six fallback ids survive");
    });
    await check("3d (server) the hidden card survives the server's cleanHomeLayout", () => {
      const skipped = need().skipGettingStarted(homeCards.defaultHomeLayout());
      const stored = JSON.parse(cleanHomeLayout(JSON.stringify(skipped)));
      assert.ok(stored.hidden.includes("gettingStarted"), JSON.stringify(stored.hidden));
      assert.ok(!stored.cards.some((card: { id: string }) => card.id === "gettingStarted"));
    });
  } else {
    console.log("skip 3c/3d (server): set NIVADESK_FUNCTIONS_INDEX to functions/index.js to run them");
  }

  // ------------------------------------------------ 4. Words, in all 12 languages
  await check("4a every new string has all 11 translations", () => {
    const missing = NEW_STRINGS.flatMap((text) => LANGUAGES
      .filter((lang) => !language.studioTranslationRow(text)?.[lang as never])
      .map((lang) => `${text} [${lang}]`));
    assert.deepEqual(missing, []);
  });
  await check("4b every label, blurb and button the checklist can show is translated", () => {
    const steps = [
      ...need().resolveGettingStartedSteps(SERVER_KEYS.map((key) => ({ ...server(key), title: "Tell us what you'd like help with", detail: "" })), facts(false)),
      ...need().resolveGettingStartedSteps(null, facts(false)),
    ];
    const texts = new Set<string>();
    for (const step of steps) {
      if (!step.label.startsWith("Tell us")) texts.add(step.label);
      if (step.blurb && !step.blurb.startsWith("server detail")) texts.add(step.blurb);
      if (step.cta) texts.add(step.cta);
    }
    for (const text of ["Skip for now", "View checklist", "Getting started", "Undo", "Open", "Done", "Connect", "Connected", "Needs attention", "Create order", "Close", "Checking…", "Home"]) texts.add(text);
    const missing = [...texts].filter((text) => !text.startsWith("server ")).flatMap((text) => LANGUAGES
      // Italian keeps the English word for Home; that is a translation, not a gap.
      .filter((lang) => language.studioT(text, lang) === text && !(text === "Home" && lang === "Italiano"))
      .map((lang) => `${text} [${lang}]`));
    assert.deepEqual(missing, []);
  });

  console.log(`\ngetting-started: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
