// The Sales capability decision: eligibility, menu preference and permission are
// three separate answers, and hiding a menu is never authorisation.
const assert = require("assert");
const { salesCapability, salesSuggested, normalizeVisibility } = require("../../sales/capability");
const { salesWorkspaceEnabled, EMPTY_SALES_FLAGS } = require("../../sales/flags");

let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).replace(/\s+/g, " ").slice(0, 300)); } }
const owner = { canOpenOrders: true, canSeeFinance: true, role: "owner" };

check("the flag is closed by default: no document, no workspace, nobody", () => {
  assert.strictEqual(salesWorkspaceEnabled(EMPTY_SALES_FLAGS, "c1"), false);
  assert.strictEqual(salesWorkspaceEnabled({ enabled: true, workspaces: {} }, "c1"), false);
  assert.strictEqual(salesWorkspaceEnabled({ enabled: false, workspaces: { c1: true } }, "c1"), false);
});

check("an exact workspace entry beats the wildcard in both directions", () => {
  assert.strictEqual(salesWorkspaceEnabled({ enabled: true, workspaces: { "*": true } }, "c1"), true);
  assert.strictEqual(salesWorkspaceEnabled({ enabled: true, workspaces: { "*": true, c1: false } }, "c1"), false);
  assert.strictEqual(salesWorkspaceEnabled({ enabled: true, workspaces: { "*": false, c1: true } }, "c1"), true);
});

check("flag off: nothing opens, whatever the workspace prefers", () => {
  const out = salesCapability({ pilotEnabled: false, visibility: "on", ...owner });
  assert.deepStrictEqual(
    { canOpenSales: out.canOpenSales, showInMenu: out.showInMenu, canSeeMoney: out.canSeeMoney, reason: out.reason, suggested: out.suggested },
    { canOpenSales: false, showInMenu: false, canSeeMoney: false, reason: "flag_off", suggested: false }
  );
});

check("preference is a menu choice, not a permission: the area stays open to the owner", () => {
  const unset = salesCapability({ pilotEnabled: true, visibility: "unset", ...owner });
  assert.strictEqual(unset.showInMenu, false);
  assert.strictEqual(unset.canOpenSales, true);
  assert.strictEqual(unset.reason, "workspace_off");
  const on = salesCapability({ pilotEnabled: true, visibility: "on", ...owner });
  assert.strictEqual(on.showInMenu, true);
  assert.strictEqual(on.reason, "ok");
});

check("a member without orders access is refused, and a workflow-only member too", () => {
  const noOrders = salesCapability({ pilotEnabled: true, visibility: "on", canOpenOrders: false, role: "member" });
  assert.deepStrictEqual({ open: noOrders.canOpenSales, reason: noOrders.reason }, { open: false, reason: "no_access" });
  const workflow = salesCapability({ pilotEnabled: true, visibility: "on", canOpenOrders: true, role: "workflowOnly" });
  assert.deepStrictEqual({ open: workflow.canOpenSales, reason: workflow.reason }, { open: false, reason: "no_access" });
});

check("assigned-only members are refused for now, with their own reason", () => {
  const out = salesCapability({ pilotEnabled: true, visibility: "on", canOpenOrders: true, role: "member", assignedOnly: true });
  assert.deepStrictEqual({ open: out.canOpenSales, reason: out.reason }, { open: false, reason: "assigned_scope_unsupported" });
});

check("money follows the existing finance flag, never the Sales flag", () => {
  const member = salesCapability({ pilotEnabled: true, visibility: "on", canOpenOrders: true, canSeeFinance: false, role: "member" });
  assert.strictEqual(member.canOpenSales, true);
  assert.strictEqual(member.canSeeMoney, false);
});

check("only owner and admin may change the workspace preference", () => {
  assert.strictEqual(salesCapability({ pilotEnabled: true, ...owner }).canManageVisibility, true);
  assert.strictEqual(salesCapability({ pilotEnabled: true, visibility: "on", canOpenOrders: true, role: "admin" }).canManageVisibility, true);
  assert.strictEqual(salesCapability({ pilotEnabled: true, visibility: "on", canOpenOrders: true, role: "member" }).canManageVisibility, false);
});

check("the suggestion reads the answers onboarding already has, and never scans orders", () => {
  assert.strictEqual(salesSuggested({ workKinds: ["custom_work"], mainGoal: "organise_jobs" }), false);
  assert.strictEqual(salesSuggested({ workKinds: ["product_sales"] }), true);
  assert.strictEqual(salesSuggested({ mainGoal: "connect_store" }), true);
  assert.strictEqual(salesSuggested({ startChoice: "shopify" }), true);
  assert.strictEqual(salesCapability({ pilotEnabled: false, onboarding: { startChoice: "shopify" } }).suggested, false);
});

check("visibility values are normalised, and anything unknown means not chosen", () => {
  assert.strictEqual(normalizeVisibility("on"), "on");
  assert.strictEqual(normalizeVisibility(true), "on");
  assert.strictEqual(normalizeVisibility("off"), "off");
  assert.strictEqual(normalizeVisibility(""), "unset");
  assert.strictEqual(normalizeVisibility("maybe"), "unset");
});

console.log(failures === 0 ? "\n✅ SALES CAPABILITY GEÇTİ" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
