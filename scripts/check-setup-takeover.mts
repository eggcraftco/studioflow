/**
 * Setup wizard over a working workspace after an account switch (owner report, 7 Nov 2026 00:25Z, live web
 * 6d2036272): signing out of an account with 2 orders and into EGGcraft (87 orders) in the same tab opened the
 * full-screen setup wizard; a reload made it go away. Continue would have written the wizard's suggested
 * country, currency, language and time zone over the workspace's own.
 *
 * Cause (reproduced on the emulator, see lib/studioflow/setupTakeover.ts): right after a sign-in the browser's
 * Firestore copy is empty; when the client is offline, getDocs answers from that copy WITHOUT an error, and the
 * shell counted the empty answer as "loaded, 0 orders". A failed load and a member who may not read the orders
 * were counted the same way, and nothing tied the count to the account and workspace on screen.
 *
 * This check imports the real decision module and reads the real shell and loader; it holds no copy of them.
 *   1. the decision: only a counted zero (server, whole workspace, allowed, this account, this workspace) opens
 *      the wizard; the incident's offline answer, a failure, an assigned-only view, another account's or another
 *      workspace's count never do; a positive count from anywhere shows the Continue setup card instead;
 *   2. the loader reports where its answer came from (metadata.fromCache) and whether it covered the workspace;
 *   3. the shell decides through the module, keeps the count stamped with account + workspace, never confirms a
 *      count on a failed load, and drops the previous account's or workspace's cached settings and orders.
 *
 * Run: npm run test:setup-takeover   (npx tsx scripts/check-setup-takeover.mts)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

type Module = typeof import("../lib/studioflow/setupTakeover");
let mod: Module | null = null;
const need = (): Module => {
  if (!mod) throw new Error("lib/studioflow/setupTakeover.ts is missing: the shell has no counted-zero rule");
  return mod;
};

/** A function (from its name to the closing brace of its BODY), so assertions read one block, not the file.
 *  The body starts after the parameter list, which may itself hold `{ … }` types. */
function block(source: string, start: string): string {
  const at = source.indexOf(start);
  if (at < 0) return "";
  let paren = 0;
  let afterParams = at;
  for (let i = source.indexOf("(", at); i < source.length; i += 1) {
    if (source[i] === "(") paren += 1;
    if (source[i] === ")") { paren -= 1; if (paren === 0) { afterParams = i; break; } }
  }
  const open = source.indexOf("{", afterParams);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") { depth -= 1; if (depth === 0) return source.slice(at, i + 1); }
  }
  return source.slice(at);
}

/** A statement from its first words to the first ";" at depth 0. */
function statement(source: string, start: string): string {
  const at = source.indexOf(start);
  if (at < 0) return "";
  let depth = 0;
  for (let i = at; i < source.length; i += 1) {
    const c = source[i];
    if (c === "(" || c === "{" || c === "[") depth += 1;
    if (c === ")" || c === "}" || c === "]") depth -= 1;
    if (c === ";" && depth === 0) return source.slice(at, i + 1);
  }
  return source.slice(at);
}

(async () => {
  try {
    mod = await import("../lib/studioflow/setupTakeover.ts");
  } catch {
    mod = null;
  }

  const EGG = { uid: "egg-owner", companyId: "egg-ws" };
  const TEST = { uid: "test887", companyId: "test89-ws" };
  const count = (over: Partial<Parameters<Module["workspaceOrderCount"]>[0]> = {}) =>
    need().workspaceOrderCount({ ...EGG, count: 0, fromServer: true, wholeWorkspace: true, allowed: true, ...over });
  const takeover = (orderCount: ReturnType<Module["workspaceOrderCount"]>, scope = EGG, extra: { setupIncomplete?: boolean; passthrough?: boolean } = {}) =>
    need().setupTakesOverAutomatically({ setupIncomplete: true, passthrough: false, ...extra, uid: scope.uid, companyId: scope.companyId, orderCount });
  const card = (orderCount: ReturnType<Module["workspaceOrderCount"]>, scope = EGG) =>
    need().continueSetupCardShows({ setupIncomplete: true, passthrough: false, wizardOnScreen: false, uid: scope.uid, companyId: scope.companyId, orderCount });

  // ---------------------------------------------------------------- 1. the decision
  await check("1a the 7 Nov incident: EGGcraft's orders answered from the wiped local copy (offline, 0) do NOT open the wizard", () => {
    assert.equal(takeover(count({ count: 0, fromServer: false })), false);
  });
  await check("1b ... and do not show the Continue setup card either: an unconfirmed zero says nothing", () => {
    assert.equal(card(count({ count: 0, fromServer: false })), false);
  });
  await check("1c the same workspace counted by the server (87) shows the card, never the wizard", () => {
    assert.equal(takeover(count({ count: 87 })), false);
    assert.equal(card(count({ count: 87 })), true);
  });
  await check("1d a positive count from the local copy is still proof of work: card, no wizard", () => {
    assert.equal(takeover(count({ count: 12, fromServer: false })), false);
    assert.equal(card(count({ count: 12, fromServer: false })), true);
  });
  await check("1e a brand-new workspace counted empty by the server still gets the wizard (§110 start)", () => {
    assert.equal(takeover(count({ count: 0 })), true);
    assert.equal(need().workspaceCountedEmpty(count({ count: 0 }), EGG.uid, EGG.companyId), true);
  });
  await check("1f no count yet (null) is not a zero: no wizard, no card", () => {
    assert.equal(takeover(null), false);
    assert.equal(card(null), false);
  });
  await check("1g a member who may not read the orders: an empty answer is not a count", () => {
    assert.equal(takeover(count({ count: 0, allowed: false })), false);
  });
  await check("1h an assigned-only view counts this member's orders, not the workspace's: no wizard on its zero", () => {
    assert.equal(takeover(count({ count: 0, wholeWorkspace: false })), false);
  });
  await check("1i a zero counted for the PREVIOUS account (test89) never opens the wizard over EGGcraft", () => {
    const previous = need().workspaceOrderCount({ ...TEST, count: 0, fromServer: true, wholeWorkspace: true, allowed: true });
    assert.equal(takeover(previous, EGG), false);
    assert.equal(takeover(previous, { uid: EGG.uid, companyId: TEST.companyId }), false, "same workspace, other account");
    assert.equal(takeover(previous, { uid: TEST.uid, companyId: EGG.companyId }), false, "same account, other workspace");
    assert.equal(takeover(previous, TEST), true, "it still holds for the account and workspace it was made for");
  });
  await check("1j a missing account or workspace on screen never matches a count", () => {
    assert.equal(need().setupTakesOverAutomatically({ setupIncomplete: true, passthrough: false, uid: "", companyId: EGG.companyId, orderCount: count() }), false);
    assert.equal(need().setupTakesOverAutomatically({ setupIncomplete: true, passthrough: false, uid: EGG.uid, companyId: null, orderCount: count() }), false);
    assert.equal(need().workspaceOrderCount({ uid: "", companyId: "x", count: 0, fromServer: true, wholeWorkspace: true, allowed: true }), null);
  });
  await check("1k setup finished, or a Connect/provider tab: never, whatever the count", () => {
    assert.equal(takeover(count({ count: 0 }), EGG, { setupIncomplete: false }), false);
    assert.equal(takeover(count({ count: 0 }), EGG, { passthrough: true }), false);
  });
  await check("1l a count that is not a whole non-negative number is no count", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      assert.equal(need().workspaceOrderCount({ ...EGG, count: bad, fromServer: true, wholeWorkspace: true, allowed: true }), null, String(bad));
    }
  });

  // ---------------------------------------------------------------- 2. the loader
  const firestore = read("lib/studioflow/firestore.ts");
  const loader = block(firestore, "export async function loadDashboardFinanceOrdersWithSource(");
  await check("2a the finance loader reports whether its answer came from the server (metadata.fromCache)", () => {
    assert.ok(loader, "loadDashboardFinanceOrdersWithSource exists");
    assert.ok(/metadata\.fromCache === false/.test(loader), "fromServer is read from the snapshot's metadata");
    assert.ok(/wholeWorkspace: !assignedScope/.test(loader), "an assigned-only read is not a whole-workspace count");
    assert.ok(/documentCount: snapshot\.docs\.length/.test(loader), "the count includes orders in Trash");
  });
  await check("2b the old loader still returns the same list (Home and Dashboard callers unchanged)", () => {
    const old = block(firestore, "export async function loadDashboardFinanceOrders(");
    assert.ok(/loadDashboardFinanceOrdersWithSource\(companyId, workspace, uid\)\)\.orders/.test(old));
  });

  // ---------------------------------------------------------------- 3. the shell
  const shell = read("components/AppShell.tsx");
  await check("3a the automatic takeover is decided by setupTakesOverAutomatically, with the account and workspace on screen", () => {
    const decision = statement(shell, "const setupTakeoverIsAutomatic =");
    assert.ok(decision, "setupTakeoverIsAutomatic exists");
    assert.ok(decision.includes("setupTakesOverAutomatically("), `decided by the module, found: ${decision.replace(/\s+/g, " ").slice(0, 160)}`);
    assert.ok(/uid: user\?\.uid/.test(decision) && /companyId: workspace\?\.id/.test(decision), "scoped to the account and workspace on screen");
    assert.ok(!/financeOrders\.length === 0/.test(decision), "not the raw length of whatever list is in state");
  });
  await check("3b the Continue setup card and the first-project guide use the same counted evidence", () => {
    assert.ok(statement(shell, "const showContinueSetupCard =").includes("continueSetupCardShows("));
    assert.ok(statement(shell, "const showAddProjectGuide =").includes("workspaceCountedEmpty(orderCount, user?.uid, workspace?.id)"));
  });
  await check("3c no 'loaded' flag survives that a failed or uncounted load could set", () => {
    assert.ok(!/financeOrdersLoaded|setFinanceOrdersLoaded|financeOrdersTrusted/.test(shell), "financeOrdersLoaded / financeOrdersTrusted are gone");
  });
  const load = block(shell, "async function run() {");
  await check("3d the shell loads the orders with their source and stamps the count with account + workspace", () => {
    assert.ok(load.includes("loadDashboardFinanceOrdersWithSource("), "the source-reporting loader");
    assert.ok(/workspaceOrderCount\(\{[\s\S]*uid: currentUser\.uid,[\s\S]*companyId: loadedWorkspace\.id,[\s\S]*fromServer: financeResult\.fromServer/.test(load), "stamped and sourced");
    assert.ok(/canLoadFinance\s*\?\s*loadDashboardFinanceOrdersWithSource[\s\S]*?:\s*Promise\.resolve\(null\)/.test(load), "no finance read = no count (null), not an empty list");
  });
  await check("3e a failed load never confirms a count, and keeps one only for this account and workspace", () => {
    const failure = load.slice(load.indexOf("} catch (error) {"));
    assert.ok(failure.includes("orderCountFor(cachedOrderCount, currentUser.uid, cachedWorkspace.id)"), "scoped to account + workspace");
    assert.ok(/setOrderCount\(cachedCount \? \{ \.\.\.cachedCount, confirmed: false \} : null\)/.test(failure), "never confirmed after a failure");
    assert.ok(!/confirmed: true/.test(failure), "nothing in the error path confirms");
  });
  await check("3f the module cache drops the previous account's / workspace's settings and orders when a new one is stamped", () => {
    const remember = block(shell, "function rememberAppShellSnapshot(");
    assert.ok(/cachedAppShellUserId !== userId \|\| \(cachedWorkspace\?\.id \?\? ""\) !== nextWorkspaceId/.test(remember), "account or workspace change detected");
    assert.ok(/cachedSettings = null;\s*cachedFinanceOrders = \[\];\s*cachedOrderCount = null;/.test(remember), "settings, orders and count dropped");
    assert.ok(/cachedOrderCount = null;/.test(block(shell, "function clearAppShellSnapshot(")), "sign-out clears the count");
  });

  console.log(`\nsetup-takeover: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
