/**
 * GN-05 / GN-06 (22 Oct 2026) on the web. Imports the real modules.
 *
 *  GN-05 Home ▸ Getting started: every line goes to the place that does it,
 *        a plan that lacks the feature is told so, and nothing ticks a line
 *        but the server (done comes only from the server's own records).
 *  GN-06 Release notes per platform/version with stable anchors, an honest
 *        web build check that never reloads by itself.
 *
 * Run: npx tsx scripts/check-gn0506.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||= "demo-not-a-real-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= "demo-gn0506";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||= "demo-gn0506.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||= "1:0:web:demo";
process.env.NEXT_PUBLIC_NV_BUILD_ID = "202610220130";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

let passed = 0;
let failed = 0;
async function check(name: string, run: () => void | Promise<void>) {
  try { await run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`); }
}

const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const server = (key: string, done = false, extra: Record<string, unknown> = {}) =>
  ({ key, title: `title ${key}`, detail: `detail ${key}`, action: "x", done, ...extra });
const facts = { setupFinished: false, hasCustomer: false, hasOrder: false, hasStoreOrder: false, hasInventory: false, hasBankTransaction: false };

(async () => {
  const gs = await import("../lib/studioflow/gettingStarted.ts");
  const changelog = await import("../lib/publicSite/changelog.ts");
  const webBuild = await import("../lib/studioflow/webBuild.ts");
  const language = await import("../lib/studioflow/language.ts");
  const one = (step: ReturnType<typeof server>, access?: Parameters<typeof gs.resolveGettingStartedSteps>[2]) =>
    gs.resolveGettingStartedSteps([step as never], facts, access)[0];
  const owner = (plan: string) => gs.gettingStartedAccess({ role: "owner", billingPlan: plan, canOpenSettings: true });

  // ---------------------------------------------------------------- GN-05
  await check("5.1 'Tell us what you'd like help with' opens the setup questions until answered (full page load)", () => {
    const open = one(server("onboarding"), owner("pro_monthly"));
    assert.equal(open.href, "/home?setup=continue");
    assert.equal(open.fullLoad, true);
    assert.equal(open.cta, "Answer the questions");
    assert.ok(open.blurb.startsWith("Four short questions"), open.blurb);
    const answered = one(server("onboarding", true), owner("pro_monthly"));
    assert.equal(answered.href, "");
    assert.equal(answered.done, true);
    const notOwner = one(server("onboarding"), gs.gettingStartedAccess({ role: "member", billingPlan: "team_monthly", canOpenSettings: true }));
    assert.equal(notOwner.href, "", "somebody who cannot set the workspace up gets the words, not a button");
  });
  await check("5.2 'Ask the assistant' opens the in-app help assistant, never /chatgpt", () => {
    const step = one(server("grounded_ai_answer"), owner("lifetime_lite"));
    assert.equal(step.opensHelp, true);
    assert.equal(step.href, "/home?help=open");
    assert.equal(step.label, "Ask the help assistant a question");
    assert.ok(/guide/.test(step.blurb) && !/your own orders/.test(step.blurb), step.blurb);
    for (const key of ["grounded_ai_answer", "ai_business_data_connected"]) {
      assert.ok(!one(server(key)).href.includes("/chatgpt"), `${key} still opens the public ChatGPT page`);
    }
    assert.equal(one(server("ai_business_data_connected")).href, "/settings?section=integrations&category=automation");
  });
  await check("5.3 on Free the assistant line explains instead of opening a refusal", () => {
    const step = one(server("grounded_ai_answer"), owner("demo"));
    assert.equal(step.href, "");
    assert.equal(step.opensHelp, false);
    assert.ok(step.blurb.includes("Starter, Pro and Team"), step.blurb);
  });
  await check("5.4 'Match your first transaction' goes to the transaction to match, or says what comes first", () => {
    assert.equal(one(server("bank_match_completed"), owner("pro_monthly")).href, "/bank?tab=transactions&match=next");
    const named = one(server("bank_match_completed", false, { target: { transactionId: "tx 1" } }), owner("pro_monthly"));
    assert.equal(named.href, "/bank?tab=transactions&tx=tx%201");
    assert.equal(named.cta, "Match a transaction");
    const noBank = one(server("bank_match_completed", false, { need: "bank_connection" }), owner("pro_monthly"));
    assert.equal(noBank.href, "/bank");
    assert.equal(noBank.cta, "Connect bank");
    assert.ok(noBank.blurb.startsWith("Connect your bank first"));
    const empty = one(server("bank_match_completed", false, { need: "bank_transactions" }), owner("team_monthly"));
    assert.ok(empty.blurb.startsWith("Your bank is connected"));
    for (const plan of ["demo", "lifetime_lite"]) {
      const gated = one(server("bank_match_completed"), owner(plan));
      assert.equal(gated.href, "/settings?section=plan-access", plan);
      assert.equal(gated.blurb, "Bank matching is part of NivaDesk Pro and Team.");
    }
  });
  await check("5.5 'Use stock on a job' opens the order holding stock, or the step before it", () => {
    const held = one(server("inventory_consumed_by_order", false, { target: { orderId: "o1" } }), owner("lifetime_lite"));
    assert.equal(held.href, "/orders?orderId=o1&focus=stock");
    assert.equal(held.cta, "Open the job");
    const noItem = one(server("inventory_consumed_by_order", false, { need: "inventory_item" }), owner("pro_monthly"));
    assert.equal(noItem.href, "/inventory?new=1");
    const plain = one(server("inventory_consumed_by_order"), owner("pro_monthly"));
    assert.equal(plain.href, "/orders");
    assert.ok(plain.blurb.includes("Use on the job"), plain.blurb);
    const free = one(server("inventory_consumed_by_order"), owner("demo"));
    assert.equal(free.href, "/settings?section=plan-access");
  });
  await check("5.6 doneness is the server's alone: opening, hints and plans never tick or untick a line", () => {
    for (const key of ["bank_match_completed", "inventory_consumed_by_order", "grounded_ai_answer", "onboarding"]) {
      assert.equal(one(server(key, false, { need: "bank_connection", target: { orderId: "o" } }), owner("team_monthly")).done, false, key);
      assert.equal(one(server(key, true), owner("demo")).done, true, key);
    }
    // A done line keeps its own words — no "connect your bank first" on a ticked step.
    const done = one(server("bank_match_completed", true, { need: "bank_connection" }), owner("pro_monthly"));
    assert.ok(!done.blurb.startsWith("Connect your bank first"));
  });
  await check("5.7 the screens pass the plan to the list and open the assistant in place", () => {
    assert.ok(read("app/home/page.tsx").includes("access={workspace ? gettingStartedAccess({"));
    assert.ok(read("components/home/GettingStartedChecklist.tsx").includes("gettingStartedAccess({ role: workspace.role"));
    const body = read("components/home/HomeCardBodies.tsx");
    assert.ok(body.includes("openHelpAssistant(); }}"), "the Home card does not open the assistant");
    assert.ok(/step\.href && step\.fullLoad \? \(\s*\/\/[^\n]*\n[^\n]*\n\s*<a className="home-next-button"/.test(body), "the setup line is not a full page load");
    const help = read("components/AppHelpAssistant.tsx");
    assert.ok(help.includes("window.addEventListener(OPEN_HELP_ASSISTANT_EVENT, openNow)"));
    assert.ok(help.includes('url.searchParams.get("help") === "open"') && help.includes('url.searchParams.delete("help")'));
  });
  await check("5.8 the bank page opens the transaction's drawer for the owner and says when there is none", () => {
    const bank = read("app/bank/page.tsx");
    assert.ok(bank.includes('params.get("match") === "next"') && bank.includes('params.get("tx")'));
    assert.ok(bank.includes("if (target && isOwner) {") && bank.includes("openDrawer(target);"));
    assert.ok(bank.includes("if (!snap.metadata.fromCache) setTxFeedAnswered(true);"), "a cached empty list could read as 'nothing to match'");
    assert.ok(bank.includes('url.searchParams.delete("match")'));
    assert.ok(read("app/orders/OrderStockBlock.tsx").includes('url.searchParams.get("focus") !== "stock"'));
  });

  // ---------------------------------------------------------------- GN-06
  await check("6.1 every changelog entry has a unique anchor; 2.1 exists for Apple and Android", () => {
    const anchors = changelog.CHANGELOG.map((entry) => changelog.changelogAnchor(entry));
    assert.equal(new Set(anchors).size, anchors.length, anchors.join(" "));
    assert.ok(anchors.includes("apple-2.1") && anchors.includes("android-2.1"), anchors.join(" "));
    assert.equal(changelog.changelogAnchor({ platformKey: "apple", version: "2.2" }), "apple-2.2");
  });
  await check("6.2 each platform's newest entry is its 'Latest', dated, with real changes", () => {
    const latest = changelog.CHANGELOG.filter((entry) => changelog.isLatestForPlatform(entry)).map((entry) => changelog.changelogAnchor(entry));
    assert.deepEqual(latest, ["apple-2.3", "android-2.3", "all-0.1.3"]);
    for (const entry of changelog.CHANGELOG) {
      assert.match(entry.date, /\d{4}/, entry.version);
      assert.ok(entry.changes.length > 0, entry.version);
    }
    assert.equal(changelog.CHANGELOG_LAST_UPDATED, "29 October 2026");
  });
  await check("6.3 2.1 notes claim nothing that is server-gated or web-only", () => {
    const text = changelog.CHANGELOG.filter((entry) => entry.version === "2.1")
      .flatMap((entry) => [entry.highlight ?? "", ...entry.changes.map((change) => change.text)]).join(" ");
    for (const word of ["WhatsApp", "Instagram", "DHL", "payment link", "eBay", "Claude", "ChatGPT", "Sales"]) {
      assert.ok(!text.includes(word), `2.1 notes mention ${word}`);
    }
    const android = changelog.CHANGELOG.find((entry) => changelog.changelogAnchor(entry) === "android-2.1");
    assert.ok(!JSON.stringify(android).includes("Sign in with Apple"), "the Apple-only line is in the Android notes");
  });
  await check("6.4 the changelog page puts the anchor on each entry", () => {
    const page = read("components/PublicMarketing.tsx");
    assert.ok(page.includes("id={changelogAnchor(entry)}"));
    assert.ok(page.includes("isLatestForPlatform(entry) ?"));
  });
  await check("6.5 the web build check says 'current' only when the server answered the same build", async () => {
    assert.equal(webBuild.webBuildVerdict("a", "a"), "current");
    assert.equal(webBuild.webBuildVerdict("a", "b"), "newer");
    assert.equal(webBuild.webBuildVerdict("a", ""), "unknown");
    assert.equal(webBuild.webBuildVerdict("", "a"), "unknown");
    const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    assert.equal((await webBuild.checkWebBuild(answer(200, { build: "202610220130" }))).state, "current");
    assert.equal((await webBuild.checkWebBuild(answer(200, { build: "202610230900" }))).state, "newer");
    assert.equal((await webBuild.checkWebBuild(answer(503, {}))).state, "unknown");
    assert.equal((await webBuild.checkWebBuild((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).state, "unknown");
    assert.equal(webBuild.formatWebBuild("202610220130"), "2026-10-22 01:30 UTC");
  });
  await check("6.6 nothing reloads by itself; About has a real check and no unconditional 'Up to date'", () => {
    const notice = read("components/WebUpdateNotice.tsx");
    const reloads = notice.match(/window\.location\.reload\(\)/g) || [];
    assert.equal(reloads.length, 1);
    assert.ok(notice.includes("onAction: () => window.location.reload()"), "the only reload is the person's own press");
    const settings = read("app/settings/page.tsx");
    assert.ok(!settings.includes('{t("Up to date")}'), "the unconditional pill is back");
    assert.ok(settings.includes("<WebAboutVersion t={t} isLocal={isLocal} />"));
    assert.ok(!settings.includes("CHANGELOG[0]"), "About shows an app release's number as the web's version");
    assert.ok(read("next.config.ts").includes("env: { NEXT_PUBLIC_NV_BUILD_ID: NV_BUILD_ID }"));
    assert.ok(read("app/api/app-build/route.ts").includes('"Cache-Control": "no-store, max-age=0"'));
  });

  // ---------------------------------------------------------------- words
  await check("7.1 every new string is translated into all eleven languages", () => {
    const rows = read("lib/studioflow/language.ts");
    const start = rows.indexOf("// GN-05 / GN-06 (22 Oct 2026)");
    const block = rows.slice(start, rows.indexOf("});", start));
    const keys = [...block.matchAll(/^  "((?:[^"\\]|\\.)+)": \{/gm)].map((m) => m[1].replace(/\\"/g, '"'));
    assert.equal(keys.length, 37, `found ${keys.length}`);
    const missing = keys.flatMap((key) => LANGUAGES.filter((lang) => language.studioT(key, lang) === key).map((lang) => `${key} [${lang}]`));
    assert.deepEqual(missing, []);
    assert.equal(language.studioT("Check for updates", "Türkçe"), "Güncellemeleri kontrol et");
    assert.equal(language.studioT("Check for updates", "العربية (Arabic)"), "التحقق من التحديثات");
  });

  console.log(`\ngn0506: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
