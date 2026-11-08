/**
 * F2 (2.5 r8 test, 8 Nov 2026): no Home quick action leads to a screen this person's menu does not have.
 *
 * "Generate AI reply" opened /messages for everybody; on Free that page says Messages is not included, while AI
 * Replies — the screen that writes the reply — is in the menu. Same rule on Android and iPhone/iPad/Mac: the action
 * opens team messages where the menu has them, AI Replies where only that is, and is not shown otherwise; every
 * other action shows only when its page is in the menu (plan and member access, the sidebar's own conditions).
 *
 * Also the empty Orders panel (owner, 7–8 Nov): "Getting started · Your workspace is ready" read like the removed
 * post-setup screen; it is now "No orders yet", and the signed-in sign-up page no longer says the same phrase.
 *
 * Run: npx tsx scripts/check-quick-action-targets.mts [web tree root]
 * The root argument is honoured by every read and by the module import, so the old tree can be checked for the
 * negative proof (it must fail there).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), ".."));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
async function check(name: string, run: () => void | Promise<void>) {
  try { await run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n     ${(error as Error).message.split("\n")[0]}`); }
}

type Menu = {
  memberAccess: Record<string, boolean> | null;
  features?: { bank_feed?: boolean; messages?: boolean } | null;
  quickReplyMenuEnabled?: boolean;
  canUploadFiles?: boolean;
};
type Targets = Record<string, string | null>;
let quickActionTargets: ((menu: Menu) => Targets) | null = null;
const modulePath = join(ROOT, "lib/studioflow/quickActionTargets.ts");
if (existsSync(modulePath)) {
  quickActionTargets = (await import(pathToFileURL(modulePath).href)).quickActionTargets;
}
function targets(menu: Menu): Targets {
  assert.ok(quickActionTargets, "lib/studioflow/quickActionTargets.ts is missing (no per-person quick action targets)");
  return quickActionTargets(menu);
}

// As app/home/page.tsx builds it: Free and Starter have no client_files, so the Files page offers no upload.
const FREE: Menu = { memberAccess: {}, features: { bank_feed: false, messages: false }, canUploadFiles: false };
const PRO: Menu = { memberAccess: {}, features: { bank_feed: true, messages: true }, canUploadFiles: true };

await check("Free: Generate AI reply opens AI Replies, not the Messages page Free does not include", () => {
  assert.equal(targets(FREE).aiReply, "/quick-reply");
});

await check("Free: Review spending and Scan receipt are not shown (the bank feed is not in a Free menu)", () => {
  const t = targets(FREE);
  assert.equal(t.reviewSpending, null);
  assert.equal(t.receipt, null);
});

await check("Free: customer, note and inventory still open their own pages", () => {
  const t = targets(FREE);
  assert.deepEqual([t.customer, t.note, t.inventory], ["/customers?new=1", "/notes?new=1", "/inventory?new=1"]);
});

await check("Free / Starter: Upload file is not shown (Files lists, but uploading is locked on these plans)", () => {
  assert.equal(targets(FREE).file, null);
  assert.equal(targets(PRO).file, "/files?upload=1");
});

await check("the Files card's own Upload file button follows the same target", () => {
  assert.ok(read("app/home/page.tsx").includes('placement.id === "files" && quickTargets?.file !== null ? ('));
});

await check("Home gives the Files page's own upload gate (plan client_files + managing role)", () => {
  const home = read("app/home/page.tsx");
  assert.ok(/canUploadFiles:\s*workspace\.entitlements\.features\.client_files === true && canManageClientFilesForRole\(workspace\.role\)/.test(home));
  assert.ok(read("app/files/page.tsx").includes("const canUploadClientFiles = canManageClientFiles;"), "the Files page gate changed; follow it");
});

await check("Pro owner: AI reply opens team messages and both bank actions show", () => {
  const t = targets(PRO);
  assert.equal(t.aiReply, "/messages");
  assert.equal(t.reviewSpending, "/bank");
  assert.equal(t.receipt, "/bank?receipt=1");
});

await check("Pro member without team messages: AI reply falls back to AI Replies", () => {
  assert.equal(targets({ ...PRO, memberAccess: { teamChat: false } }).aiReply, "/quick-reply");
});

await check("no team messages and no AI Replies (role, or the workspace hid AI Replies): AI reply is not shown", () => {
  assert.equal(targets({ ...PRO, memberAccess: { teamChat: false, quickReply: false } }).aiReply, null);
  assert.equal(targets({ ...FREE, quickReplyMenuEnabled: false }).aiReply, null);
});

await check("restricted role: each closed page hides its action (customers, notes, files, bank)", () => {
  const t = targets({ ...PRO, memberAccess: { customers: false, notes: false, clientFiles: false, bankFeed: false } });
  assert.deepEqual([t.customer, t.note, t.file, t.reviewSpending, t.receipt], [null, null, null, null, null]);
});

await check("inventory needs Orders as well, as in the sidebar", () => {
  assert.equal(targets({ ...PRO, memberAccess: { orders: false } }).inventory, null);
  assert.equal(targets({ ...PRO, memberAccess: { inventory: false } }).inventory, null);
});

await check("the Home card draws only actions that have a page for this person", () => {
  const bodies = read("components/home/HomeCardBodies.tsx");
  assert.ok(/quickActionTargets\[action\.id\] != null/.test(bodies), "QuickActionsCardBody does not filter by target");
  assert.ok(bodies.includes("{quickActions.slice(0, 6).map((action) => ("), "2x1 no longer draws the filtered list");
});

await check("Home opens the person's target and no longer sends AI reply to /messages for everyone", () => {
  const home = read("app/home/page.tsx");
  assert.ok(!/aiReply:\s*"\/messages"/.test(home), "aiReply is still hard-wired to /messages");
  assert.ok(/quickTargets\?\.\[action\]/.test(home), "handleQuickAction does not use the person's targets");
  assert.ok(/quickActionTargets:\s*quickTargets/.test(home), "the card is not given the targets");
});

await check("empty Orders panel says \"No orders yet\" (no Getting started eyebrow, no \"Your workspace is ready\")", () => {
  const orders = read("app/orders/page.tsx");
  assert.ok(orders.includes('title={t("No orders yet")}'), "title is not No orders yet");
  assert.ok(!orders.includes('t("Your workspace is ready")') && !orders.includes('eyebrow={t("Getting started")}'));
});

await check("\"No orders yet\" is translated into the 11 other languages", () => {
  const line = read("lib/studioflow/language.ts").split("\n").find((l) => l.startsWith('  "No orders yet": {'));
  assert.ok(line, "no \"No orders yet\" row");
  assert.equal((line.match(/": "/g) ?? []).length, 11);
});

await check("\"Your workspace is ready\" is gone from the app's tables and the signed-in sign-up page", () => {
  assert.ok(!read("lib/studioflow/language.ts").includes('"Your workspace is ready"'));
  assert.ok(!read("lib/studioflow/macTranslations.ts").includes('"Your workspace is ready"'));
  assert.ok(!read("lib/publicSite/translations.ts").includes('"signup.signedIn.title": "Your workspace is ready."'));
});

console.log(`\nquick-action-targets: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
