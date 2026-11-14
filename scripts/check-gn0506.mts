/**
 * GN-05 / GN-06 (22 Oct 2026) on the web. Imports the real modules.
 *
 *  GN-05 Home ▸ Getting started was REMOVED on 7 Nov 2026 (the owner took every
 *        informational step-by-step screen out of the product); 5.0 keeps it out.
 *  GN-06 Release notes per platform/version with stable anchors, an honest
 *        web build check that never reloads by itself.
 *
 * Run: npx tsx scripts/check-gn0506.mts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

(async () => {
  const changelog = await import("../lib/publicSite/changelog.ts");
  const webBuild = await import("../lib/studioflow/webBuild.ts");
  const language = await import("../lib/studioflow/language.ts");

  // ---------------------------------------------------------------- GN-05
  await check("5.0 Getting started and its deep links are gone (removed 7 Nov 2026)", () => {
    for (const path of ["lib/studioflow/gettingStarted.ts", "lib/studioflow/setupChecklist.ts", "components/home/GettingStartedChecklist.tsx"]) {
      assert.equal(existsSync(join(ROOT, path)), false, `${path} is back`);
    }
    assert.ok(!read("components/AppHelpAssistant.tsx").includes('get("help") === "open"'), "?help=open came back");
    assert.ok(!read("app/bank/page.tsx").includes('params.get("match") === "next"'), "?match=next came back");
    assert.ok(!read("app/orders/OrderStockBlock.tsx").includes('"stock"'), "?focus=stock came back");
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
    assert.deepEqual(latest, ["apple-2.5.1", "android-2.5.1", "all-0.1.3"]);
    for (const entry of changelog.CHANGELOG) {
      assert.match(entry.date, /\d{4}/, entry.version);
      if (entry.version === "2.5.1") assert.match(entry.date, /^\d{1,2} [A-Z][a-z]+ \d{4}$/, "2.5.1: the date must be the release day, not a placeholder");
      assert.ok(entry.changes.length > 0, entry.version);
    }
    assert.equal(changelog.CHANGELOG_LAST_UPDATED, "11 November 2026"); // 2.5: the day the last store (iPhone & iPad) released it
  });
  await check("6.2b 2.5.1 reads in all 12 site languages; an entry without its own text reads in English", () => {
    const languages = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
    for (const entry of changelog.CHANGELOG) {
      for (const [language, local] of Object.entries(entry.i18n ?? {})) {
        assert.equal((local as { changes: string[] }).changes.length, entry.changes.length, `${changelog.changelogAnchor(entry)} ${language}`);
        for (const line of (local as { changes: string[] }).changes) assert.ok(line.trim().length > 8, `${changelog.changelogAnchor(entry)} ${language}`);
      }
    }
    for (const anchor of ["apple-2.5.1", "android-2.5.1"]) {
      const entry = changelog.CHANGELOG.find((item) => changelog.changelogAnchor(item) === anchor)!;
      assert.ok(entry, anchor);
      assert.deepEqual(Object.keys(entry.i18n ?? {}).sort(), [...languages].sort(), anchor);
      const english = changelog.localizedChangelogEntry(entry, "English").changes.map((change) => change.text);
      assert.deepEqual(english, entry.changes.map((change) => change.text));
      for (const language of languages) {
        const local = changelog.localizedChangelogEntry(entry, language);
        assert.equal(local.changes.length, entry.changes.length);
        local.changes.forEach((change, index) => {
          assert.equal(change.tag, entry.changes[index].tag);
          assert.notEqual(change.text, entry.changes[index].text, `${anchor} ${language} line ${index + 1} is still English`);
        });
      }
    }
    const apple = changelog.CHANGELOG.find((item) => changelog.changelogAnchor(item) === "apple-2.5.1")!;
    assert.ok(changelog.localizedChangelogEntry(apple, "Türkçe").changes[0].text.includes("KDV"));
    assert.ok(changelog.localizedChangelogEntry(apple, "Deutsch").changes[0].text.includes("Umsatzsteuer"));
    const old = changelog.CHANGELOG.find((item) => changelog.changelogAnchor(item) === "apple-2.5")!;
    assert.deepEqual(changelog.localizedChangelogEntry(old, "Türkçe").changes, old.changes);
    assert.deepEqual(changelog.localizedChangelogEntry(old, "no such language").changes, old.changes);
    const short = { ...apple, i18n: { "Türkçe": { changes: ["tek satır"] } } };
    assert.deepEqual(changelog.localizedChangelogEntry(short, "Türkçe").changes, apple.changes);
    const page = read("components/PublicMarketing.tsx");
    assert.ok(page.includes("localizedChangelogEntry(entry, language)"));
  });
  await check("6.2a Apple 2.4.1 is on iPhone, iPad and Mac (both App Store pages, 5 Nov 2026); 2.4 stays iPhone & iPad", () => {
    const find = (anchor: string) => changelog.CHANGELOG.find((entry) => changelog.changelogAnchor(entry) === anchor);
    const apple241 = find("apple-2.4.1");
    assert.ok(apple241, "no apple-2.4.1 entry");
    assert.equal(apple241.platform, "iPhone, iPad & Mac");
    assert.equal(apple241.date, "5 November 2026");
    const highlight = apple241.highlight ?? "";
    assert.ok(highlight.includes("Released to the App Store for iPhone, iPad and Mac on 5 November 2026."), highlight);
    assert.ok(!highlight.includes("Mac App Store"), "the highlight still says Mac only");
    assert.ok(highlight.includes("first update after 2.3") && highlight.includes("everything listed under 2.4"), "the Mac skipped 2.4: the highlight must say 2.4.1 brings it");
    // The What's New that was entered (identical on the public iPhone and Mac pages, read 6 Nov 2026).
    assert.deepEqual(apple241.changes.map((change) => change.text), [
      "Security update: the app's connection to its database now includes Google's latest Firebase security fix, which removes the certificates of a compromised certificate authority from the list the app trusts. We recommend updating on every iPhone, iPad and Mac you use.",
      "Online booking: requests from your booking page show their status in Calendar, and you can confirm or decline them in the app, with an optional message to the customer.",
      "NivaDesk help: your conversation is kept on this device for 7 days, so you can pick it up again later.",
      "Smaller fixes and translations.",
    ]);
    assert.equal(find("apple-2.4")?.platform, "iPhone & iPad", "macOS 2.4 never shipped (withdrawn 5 Nov); the Mac got it in 2.4.1");
    const source = read("lib/publicSite/changelog.ts");
    assert.ok(!source.includes("Once iOS 2.4.1 is released"), "the 'until iOS ships' note is still in the file");
    assert.ok(!source.includes("once it is released, change `platform`"), "the 2.4 entry still waits for a Mac 2.4 release");
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
    assert.ok(/env: \{ NEXT_PUBLIC_NV_BUILD_ID: NV_BUILD_ID[,\s}]/.test(read("next.config.ts")), "the build id is no longer handed to the bundle");
    assert.ok(read("app/api/app-build/route.ts").includes('"Cache-Control": "no-store, max-age=0"'));
  });

  // ---------------------------------------------------------------- words
  await check("7.1 every new string is translated into all eleven languages", () => {
    const rows = read("lib/studioflow/language.ts");
    const start = rows.indexOf("// GN-05 / GN-06 (22 Oct 2026)");
    const block = rows.slice(start, rows.indexOf("});", start));
    const keys = [...block.matchAll(/^  "((?:[^"\\]|\\.)+)": \{/gm)].map((m) => m[1].replace(/\\"/g, '"'));
    assert.equal(keys.length, 17, `found ${keys.length}`); // 37 until GN-05 left (7 Nov 2026)
    const missing = keys.flatMap((key) => LANGUAGES.filter((lang) => language.studioT(key, lang) === key).map((lang) => `${key} [${lang}]`));
    assert.deepEqual(missing, []);
    assert.equal(language.studioT("Check for updates", "Türkçe"), "Güncellemeleri kontrol et");
    assert.equal(language.studioT("Check for updates", "العربية (Arabic)"), "التحقق من التحديثات");
  });

  console.log(`\ngn0506: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
