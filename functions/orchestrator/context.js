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
    areas: {
      orders: area("orders"),
      dashboard: area("dashboard"),
      customers: area("customers"),
      bankFeed: area("bankFeed")
    },
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
 * Every line is the SAME predicate as the capability that owns that data.
 * `inventory` used to read `ctx.areas.orders`, which is looser than the gate on
 * get_inventory_overview and search_inventory_items (`permission.inventory` →
 * nvRequireInventoryAccess: owner, OR the orders area AND an order role that
 * can fully edit). A member who fell between those two predicates was refused
 * both inventory tools and then handed item names and on-hand levels by the
 * attention summary's `stock_low` item — the assistant as the looser door into
 * the same data, which is the thing accounting/core/access.js was written in
 * this branch to prevent. Two predicates over one body of data is the defect.
 */
function sectionAccess(ctx) {
  return {
    orders: ctx.areas.orders === true,
    shipping: ctx.areas.orders === true,
    payments: ctx.financialInfo === true && !ctx.workflowOnly,
    inventory: ctx.inventoryAccess === true,
    banking: ctx.areas.bankFeed === true && !ctx.workflowOnly,
    payouts: ctx.areas.bankFeed === true && !ctx.workflowOnly,
    accounting: ctx.accountingReader === true && !ctx.workflowOnly,
    integrations: ctx.areas.orders === true
  };
}

module.exports = {
  OrchestratorError, CHANNEL_TYPES, FIRST_PARTY_AUTH_TYPES,
  resolveContext, assertCapability, sectionAccess, scopeSet,
  scopeGateApplies, missingScopes, scopeRefusal
};
