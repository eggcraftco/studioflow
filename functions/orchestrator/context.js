"use strict";

/**
 * Who is asking, and what that lets them see.
 *
 * Every gate here is one of the app's own predicates, injected rather than
 * re-implemented (`createOrchestrator(deps)`, the way createInventoryFunctions
 * is wired). The orchestrator must never be a second, looser copy of the
 * permission model: if an owner unticks Banking for somebody, the assistant has
 * to lose it too, and the only way to guarantee that is to call the same
 * function the screen calls.
 *
 * Three rules that are easy to get wrong and are therefore written down:
 *
 * 1. **The company document is read for THIS request.** A gateway that caches
 *    it keeps serving a member whose access was revoked. `loadCompany` is
 *    injected and must return a document read during the current request — a
 *    caller that has already read one FOR THIS REQUEST may return that, and
 *    the MCP adapter does: nvRequireChatGPTWorkspaceAccessWithOAuth read it
 *    moments earlier in the same call, and a second `get` would buy the same
 *    bytes twice. What is forbidden is a document held ACROSS requests, and
 *    the adapter's closure cannot hold one.
 *
 *    This paragraph used to promise a safeguard that does not exist: "a
 *    caller-supplied snapshot is accepted only as `companyDataHint`, for
 *    display, and no gate reads it". `resolveContext` has never taken such a
 *    parameter, and adding one would have made the rule weaker rather than
 *    stronger — it has only two honest shapes, a second read of bytes already
 *    in hand, or a display-only field no gate reads and no caller sets. So
 *    what the code actually guarantees is written down instead: every gate
 *    below reads the document `loadCompany` returned on THIS call, and nothing
 *    a caller passed in alongside it. The WhatsApp gateway copying this
 *    pattern needs no new parameter either — it returns the document it read
 *    for the message it is answering.
 *
 *    The snapshot field of that name is gone too (`loaders.snapshotFor`). It
 *    carried the whole company document — members, memberAccess,
 *    suspendedMembers, billing — into every pure capability, and nothing read
 *    it.
 * 2. **A supplied `companyId` is a lookup key, never a grant.** The MCP path
 *    falls back to the argument when the OAuth token carries no workspace
 *    (`oauth.companyId || companyId`), so the argument does reach here — and
 *    `uidHasCompanyAccess` runs on the resolved document before any read,
 *    honouring `suspendedMembers`.
 * 3. **Scopes are enforced, not just carried — and a grant of nothing grants
 *    nothing.** The rule is one sentence and it is about WHO is asking: a
 *    delegated grant is the whole of what that caller may do, so a token is
 *    checked against the registry entry's `scopes` at call time and an empty
 *    grant permits no capability at all. A member signed into NivaDesk with
 *    their own ID token holds no delegated grant and is not scope-checked —
 *    their role and area switches are the whole gate, as in the app. The check
 *    used to read `granted.size > 0 && ...`, which let a token carrying no
 *    scope string through every gate while this line claimed enforcement.
 *    See `missingScopes` and FIRST_PARTY_AUTH_TYPES.
 * 4. **The role is resolved by the app's resolver, never re-derived here.**
 *    See `resolveRole`.
 */

/** A refusal the adapter maps onto its own error type (HttpsError for MCP). */
class OrchestratorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrchestratorError";
    this.code = code;
  }
}

const CHANNEL_TYPES = Object.freeze(["mcp", "rest", "whatsapp", "app"]);

function normalizeChannel(channel) {
  const input = (channel && typeof channel === "object") ? channel : {};
  const type = CHANNEL_TYPES.includes(String(input.type)) ? String(input.type) : "mcp";
  return {
    type,
    bindingId: input.bindingId ? String(input.bindingId) : null,
    isGroup: input.isGroup === true,
    profile: (input.profile && typeof input.profile === "object") ? input.profile : null
  };
}

function scopeSet(scope) {
  if (Array.isArray(scope)) return new Set(scope.map((value) => String(value).trim()).filter(Boolean));
  return new Set(String(scope || "").split(/[\s,]+/).map((value) => value.trim()).filter(Boolean));
}

/**
 * The auth types that are a member acting for THEMSELVES, rather than a third
 * party holding a grant on their behalf.
 *
 * `firebase_session` is chatgptWorkspaceAction and the non-OAuth branch of
 * nvRequireChatGPTWorkspaceAccessWithOAuth: the person is signed into NivaDesk
 * with their own ID token, there is no consent screen and no delegation, and
 * therefore no scope to check — the workspace role and the area switches are
 * the whole of what limits them, exactly as in the app.
 *
 * The list is a DENY-of-the-gate list on purpose: an auth type nobody has named
 * here is treated as a delegated token and must carry its scopes. A new
 * delegated surface that forgets to declare itself is refused, which is the
 * failure that leaves a mark rather than the one that quietly lets everything
 * through.
 */
const FIRST_PARTY_AUTH_TYPES = Object.freeze(["firebase_session", "app"]);

function scopeGateApplies(authType) {
  return !FIRST_PARTY_AUTH_TYPES.includes(String(authType || "").trim());
}

/**
 * ONE RULE, in one function, for every tool on every surface: a delegated
 * grant is the whole of what that caller may do.
 *
 * What it replaces: `if (granted.size > 0 && required.some(...))`. That reads
 * as "deny if the token names scopes and one of them is missing" — so a token
 * carrying NO scope string passed every gate, and the header three lines above
 * it claimed "Scopes are enforced, not just carried". A token with an empty
 * grant is not a token with every grant; it is a token that was granted
 * nothing, and it is refused.
 *
 * The caller that legitimately has no scopes is not a token at all — it is a
 * member signed into NivaDesk — and that case is answered by WHO is asking
 * (FIRST_PARTY_AUTH_TYPES) rather than by whether a string happens to be empty.
 *
 * @returns {string[]} the scopes this caller lacks, empty when the call is allowed.
 */
function missingScopes({ authType = "", scope = "" } = {}, required = []) {
  if (!scopeGateApplies(authType)) return [];
  const granted = scopeSet(scope);
  return (Array.isArray(required) ? required : []).filter((needed) => !granted.has(needed));
}

/**
 * Every workspace area a registry row is allowed to name, and therefore every
 * key `ctx.areas` carries.
 *
 * `assertCapability` reads `ctx.areas[permission.area]`, so an area the context
 * does not build is `undefined` and refuses UNCONDITIONALLY — including to the
 * owner. Ten rows named one: seven notes tools carry `area: "notes"` and
 * `get_order_financials`, `get_extra_spending_overview` and
 * `get_financial_overview` carry `area: "financialInfo"`, while this object held
 * four keys and neither of those was among them.
 *
 * It failed closed, and it was harmless only by accident: none of the ten has a
 * HANDLERS entry, so `assertCapability` is never reached for them today. The
 * table exists precisely so a second channel can route the SAME rows through the
 * same gate (registry.publishedForChannel, orchestrator/index.js), and the first
 * time the WhatsApp gateway does, every notes tool would have been denied to
 * everyone with "Your workspace access does not include notes."
 *
 * Both names are real `WORKSPACE_MEMBER_ACCESS_KEYS` in index.js, so
 * `uidCanAccessWorkspaceArea` answers them properly; they were simply not asked.
 * The list is enumerated here rather than derived from the registry because
 * context.js must not import the registry — but `orchestrator-contract.test.js`
 * pins `permission.area ∈ AREA_KEYS` over every row, so a row naming a new area
 * fails the suite instead of failing its callers.
 */
const AREA_KEYS = Object.freeze(["orders", "dashboard", "customers", "bankFeed", "notes", "financialInfo"]);

/** The refusal text for a missing grant, so both surfaces say the same thing. */
function scopeRefusal(missing = [], granted = []) {
  if (granted.length === 0) {
    return "This connection was not granted any scope, so it cannot read anything. Reconnect NivaDesk in ChatGPT to grant access.";
  }
  return `This connection was not granted the ${missing.join(", ")} scope. Reconnect NivaDesk in ChatGPT and approve it.`;
}

/**
 * The workspace role, from the app's own resolver and from nothing else.
 *
 * `workspaceMemberRole` is the function the screens and the callables use
 * (`nvWorkflowOnlyContext` is one line of it). It reads `memberCustomRoles`,
 * resolves that custom role's `baseRole` through `customRoles`, and copes with
 * a member entry stored as a bare string. Reading `members[uid].role ||
 * memberRoles[uid]` inline reproduces none of that: a workflow-only member on a
 * custom role comes back as a plain `member`, the assigned-orders filter in
 * loaders.js never runs, and `sectionAccess` opens payments, banking and
 * payouts to somebody the app restricts to their own work.
 *
 * So the resolver is injected, and its absence is a wiring error rather than a
 * quiet fallback to the loosest answer a workspace can have.
 */
function resolveRole(companyData, uid, { isOwner, deps }) {
  if (typeof deps.workspaceMemberRole !== "function") {
    throw new OrchestratorError(
      "failed-precondition",
      "This deployment was built without the workspace role resolver, so the caller's role cannot be established."
    );
  }
  const normalize = typeof deps.normalizeWorkspaceRole === "function"
    ? (value) => String(deps.normalizeWorkspaceRole(value, "member"))
    : (value) => String(value || "member");
  // "unknown" is what the resolver returns when the uid holds no member entry
  // at all — the owner's usual case, since an owner need not be in `members`.
  // Every other answer, including a stricter one on an owner's own entry, is
  // taken as it stands: this must not be able to widen a role.
  const resolved = String(deps.workspaceMemberRole(companyData, uid, "member") || "");
  if (resolved && resolved !== "unknown") return normalize(resolved);
  return isOwner ? "owner" : "member";
}

/**
 * Build the context every capability is handed.
 *
 * `deps` supplies the predicates; nothing in this file knows how a role is
 * stored.
 */
async function resolveContext({ uid, companyId, authType = "chatgpt_oauth", scope = "", channel = null, email = "" } = {}, deps = {}) {
  const cleanUid = String(uid || "").trim();
  const cleanCompanyId = String(companyId || "").trim();
  if (!cleanUid) throw new OrchestratorError("unauthenticated", "Sign-in is required.");
  if (!cleanCompanyId) throw new OrchestratorError("invalid-argument", "companyId is required.");

  const loaded = await deps.loadCompany(cleanCompanyId);
  if (!loaded) throw new OrchestratorError("not-found", "Workspace not found.");
  const companyData = loaded.companyData || loaded;

  // The lookup key becomes an answer only after membership says so.
  if (!deps.uidHasCompanyAccess(companyData, cleanUid)) {
    throw new OrchestratorError("permission-denied", "You do not have access to this workspace.");
  }

  const isOwner = deps.uidIsCompanyOwner(companyData, cleanUid) === true;
  const role = resolveRole(companyData, cleanUid, { isOwner, deps });

  const area = (name) => isOwner || deps.uidCanAccessWorkspaceArea(companyData, cleanUid, name) === true;
  const entitlements = deps.billingEntitlementsForCompany ? deps.billingEntitlementsForCompany(companyData) : {};

  return {
    uid: cleanUid,
    email: String(email || ""),
    companyId: cleanCompanyId,
    companyData,
    authType: String(authType || ""),
    role,
    isOwner,
    areas: Object.fromEntries(AREA_KEYS.map((name) => [name, area(name)])),
    financialInfo: deps.roleCanAccessFinancialInfo(companyData, cleanUid) === true,
    accountingReader: deps.accountingReaderCanRead ? deps.accountingReaderCanRead(companyData, cleanUid) === true : isOwner,
    inventoryAccess: deps.inventoryAccessAllowed ? deps.inventoryAccessAllowed(companyData, cleanUid) === true : isOwner,
    entitlements,
    workflowOnly: role === "workflowOnly",
    assignedOnly: role === "workflowOnly",
    scope: [...scopeSet(scope)],
    settings: (loaded.settings && typeof loaded.settings === "object") ? loaded.settings : {},
    channel: normalizeChannel(channel)
  };
}

/**
 * The gate, before any read (§38: the permission check happens BEFORE the tool
 * call, not inside it).
 *
 * A refusal here names the area, never its contents — "Banking is not included
 * for your role" tells the model nothing about what is in Banking.
 */
function assertCapability(ctx, entry) {
  if (!ctx || !entry) throw new OrchestratorError("invalid-argument", "Unknown capability.");
  const permission = entry.permission || {};

  // The plan entitlement that exists and was never read. Refusing on it here
  // means a future plan change is honoured without a second code change.
  if (["mcp", "rest"].includes(ctx.channel.type) && ctx.entitlements && ctx.entitlements.chatgptAppEnabled === false) {
    throw new OrchestratorError("failed-precondition", "The ChatGPT connection is not included in this workspace's plan.");
  }

  // The grant this caller holds, if the caller is holding one at all.
  const missing = missingScopes({ authType: ctx.authType, scope: ctx.scope }, entry.scopes);
  if (missing.length > 0) {
    throw new OrchestratorError("permission-denied", scopeRefusal(missing, [...(ctx.scope || [])]));
  }

  if (permission.ownerOnly && !ctx.isOwner) {
    throw new OrchestratorError("permission-denied", "Only the workspace owner can do this.");
  }
  if (permission.area && !ctx.areas[permission.area]) {
    throw new OrchestratorError("permission-denied", `Your workspace access does not include ${permission.area}.`);
  }
  if (permission.financial && !ctx.financialInfo) {
    throw new OrchestratorError("permission-denied", "You do not have access to financial information in this workspace.");
  }
  if (permission.bankFeed && !ctx.areas.bankFeed) {
    throw new OrchestratorError("permission-denied", "Bank Spending is not enabled for your role. Ask the workspace owner to grant it in Team Access.");
  }
  if (permission.accountingReader && !ctx.accountingReader) {
    throw new OrchestratorError("permission-denied", "Accounting is not enabled for your role. Ask the workspace owner to grant it in Team Access.");
  }
  if (permission.inventory && !ctx.inventoryAccess) {
    throw new OrchestratorError("permission-denied", "Inventory is not enabled for your role. Ask the workspace owner to grant it in Team Access.");
  }
  return true;
}

/**
 * Which sections of a multi-section answer this context may see. A section the
 * role cannot see is NAMED and left empty — "Banking items are not included for
 * your role" — rather than silently missing, which reads as "nothing to report".
 *
 * Every line is the SAME predicate as the capability that owns that data, and
 * `SECTION_OWNERS` below names which capability that is, one per line, so the
 * claim is checkable instead of asserted. `orchestrator-context.test.js` drives
 * both sides over a cross-product of grants and fails on the first divergence.
 *
 * `inventory` used to read `ctx.areas.orders`, which is looser than the gate on
 * get_inventory_overview and search_inventory (`permission.inventory` →
 * nvRequireInventoryAccess: owner, OR the orders area AND an order role that
 * can fully edit). A member who fell between those two predicates was refused
 * both inventory tools and then handed item names and on-hand levels by the
 * attention summary's `stock_low` item — the assistant as the looser door into
 * the same data, which is the thing accounting/core/access.js was written in
 * this branch to prevent. Two predicates over one body of data is the defect.
 *
 * `banking`, `payouts` and `accounting` carried `&& !ctx.workflowOnly`, which
 * made this comment false for three of its eight lines in the STRICT direction:
 * get_banking_attention_summary and get_payout_reconciliation_overview carry
 * `permission.bankFeed` only, get_accounting_sync_status carries
 * `permission.accountingReader` only, and `assertCapability` has no workflowOnly
 * term at all — nor does the app's own `nvRequireBankFeedAccess`, which is
 * owner OR the bankFeed area and nothing else. A workflow-only member granted
 * Bank Spending (reachable: `workspaceMemberAccess` forces dashboard,
 * financialInfo, customers and cardFinancial false for that role and leaves
 * bankFeed alone) was told "banking items are not included for your role" by the
 * summary and then answered in full by the banking tool, in one session.
 *
 * Strict is not safe when it is only strict HERE: the extra term did not keep
 * anything from that member, it just made the assistant contradict itself. So
 * the three lines drop it and match their capability. Adding the term to
 * `assertCapability` instead would have been a THIRD predicate, one the product
 * does not have — the web client shows Banking to exactly the same member.
 *
 * `payments` is `ctx.financialInfo` alone for the same reason: the app's
 * `nvRoleCanAccessFinancialInfo` already returns false for a workflow-only
 * role, so `&& !ctx.workflowOnly` was a second copy of a rule that lives in one
 * place. A redundant term is a divergence waiting for the day the rule it
 * duplicates changes.
 */
const SECTION_OWNERS = Object.freeze({
  orders: "search_commerce_orders",
  shipping: "search_commerce_orders",
  payments: "get_commerce_overview",
  inventory: "get_inventory_overview",
  banking: "get_banking_attention_summary",
  payouts: "get_payout_reconciliation_overview",
  accounting: "get_accounting_sync_status",
  integrations: "get_integration_health"
});

function sectionAccess(ctx) {
  return {
    orders: ctx.areas.orders === true,
    shipping: ctx.areas.orders === true,
    payments: ctx.financialInfo === true,
    inventory: ctx.inventoryAccess === true,
    banking: ctx.areas.bankFeed === true,
    payouts: ctx.areas.bankFeed === true,
    accounting: ctx.accountingReader === true,
    integrations: ctx.areas.orders === true
  };
}

module.exports = {
  OrchestratorError, CHANNEL_TYPES, FIRST_PARTY_AUTH_TYPES,
  resolveContext, assertCapability, sectionAccess, SECTION_OWNERS, AREA_KEYS, scopeSet,
  scopeGateApplies, missingScopes, scopeRefusal
};
