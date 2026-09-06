"use strict";

/**
 * The Niva Orchestrator: one set of capabilities, any number of channels.
 *
 * ChatGPT reaches it through thin MCP adapters in index.js; the WhatsApp
 * gateway (a later function in this same codebase) builds an instance with the
 * same deps and calls `run()` with `channel.type: "whatsapp"`. Nothing about a
 * capability knows which asked — that is the whole point, and it is why the
 * business rules cannot drift between the two surfaces.
 *
 * `run()` order matters and is fixed:
 *   1. resolve the capability (unknown name, or a name whose flag is off → refuse)
 *   2. assert permission BEFORE any read (§38)
 *   3. record the PII access, when the capability declares one
 *   4. load ONLY the domains the capability declares
 *   4b. record any marketplace PII the outbound policy refused to release
 *   5. run the pure handler
 *   6. build the envelope (freshness, warnings, partial) and the §13 summary
 */

const registry = require("./registry");
const contextModule = require("./context");
const envelope = require("./envelope");
const render = require("./render");
const loadersModule = require("./loaders");

const commerce = require("./commerce");
const inventory = require("./inventory");
const payouts = require("./payouts");
const integrationHealth = require("./integrationHealth");
const accountingStatus = require("./accountingStatus");
const attention = require("./attention");

/** capability name → the pure function behind it. */
const HANDLERS = Object.freeze({
  get_business_attention_summary: attention.businessAttentionSummary,
  get_commerce_overview: commerce.commerceOverview,
  search_commerce_orders: commerce.searchCommerceOrders,
  get_channel_performance: commerce.channelPerformance,
  get_inventory_overview: inventory.inventoryOverview,
  search_inventory_items: inventory.searchInventoryItems,
  get_payout_reconciliation_overview: payouts.payoutReconciliation,
  get_integration_health: integrationHealth.integrationHealth,
  get_accounting_sync_status: accountingStatus.accountingSyncStatus,
  get_banking_attention_summary: attention.bankingAttentionSummary
});

const CAPABILITY_NAMES = Object.freeze(Object.keys(HANDLERS));

/**
 * Who the access log says made this read.
 *
 * `actorRole` is free text in `privacy/accessLog.js` (`text(input.actorRole,
 * 60)`), with no closed list to fall back on, and both rows below hardcoded
 * "chatgpt_connection" in a function whose whole purpose is to be
 * channel-agnostic — so the first WhatsApp read of customer data would have
 * filed a row saying a ChatGPT connection made it, on top of `source` landing
 * as "unknown". One value per channel type, derived, so a new channel cannot
 * inherit another one's name by accident.
 */
const ACTOR_ROLES = Object.freeze({
  mcp: "chatgpt_connection",
  rest: "chatgpt_connection",
  whatsapp: "whatsapp_binding",
  app: "workspace_member"
});

const actorRoleFor = (ctx) => ACTOR_ROLES[(ctx && ctx.channel && ctx.channel.type) || "mcp"] || "assistant_channel";

function createOrchestrator(deps = {}) {
  const loaders = deps.loaders || loadersModule.createLoaders({ db: deps.db, now: deps.now });
  const flags = registry.normalizeFlags(deps.flags || {});

  const contextDeps = {
    loadCompany: deps.loadCompany || loaders.loadCompany,
    uidHasCompanyAccess: deps.uidHasCompanyAccess,
    uidIsCompanyOwner: deps.uidIsCompanyOwner,
    uidCanAccessWorkspaceArea: deps.uidCanAccessWorkspaceArea,
    // The role RESOLVER, not just the normaliser: custom roles live in
    // `memberCustomRoles`/`customRoles` and only this function reads them.
    workspaceMemberRole: deps.workspaceMemberRole,
    normalizeWorkspaceRole: deps.normalizeWorkspaceRole,
    billingEntitlementsForCompany: deps.billingEntitlementsForCompany,
    roleCanAccessFinancialInfo: deps.roleCanAccessFinancialInfo,
    accountingReaderCanRead: deps.accountingReaderCanRead,
    inventoryAccessAllowed: deps.inventoryAccessAllowed
  };

  /**
   * The capabilities this deployment publishes, under the flags it was built
   * with — and, when a channel binding's profile is given, under that binding's
   * own policy as well (WA §11 allowedCapabilities, §14, §15).
   *
   * MCP calls it with no argument and gets the flag projection, which is what
   * `tools/list` serves. The WhatsApp gateway passes its binding profile and
   * gets the subset that binding may call, out of the same table: there is no
   * second tool set to drift out of step with the first (WA §81).
   */
  function listCapabilities({ channelProfile = null } = {}) {
    return registry.publishedForChannel({ flags, channelProfile })
      .map((entry) => entry.name)
      .filter((name) => CAPABILITY_NAMES.includes(name));
  }

  /**
   * `overrides` exists for one case: a caller that has ALREADY read the company
   * document during this same request (the MCP dispatcher does, in
   * nvRequireChatGPTWorkspaceAccessWithOAuth) passes its own `loadCompany` so
   * the document is not read twice. The rule it must keep is the rule the
   * design states: the snapshot has to come from this request, never from a
   * cache that survives it, or a revoked member keeps their access.
   */
  async function resolveContext(input, overrides = {}) {
    return contextModule.resolveContext(input, { ...contextDeps, ...overrides });
  }

  async function run({ capability, args = {}, ctx, request = {} } = {}) {
    const name = String(capability || "");
    const entry = registry.entryFor(name);
    const handler = HANDLERS[name];
    if (!entry || !handler) throw new contextModule.OrchestratorError("invalid-argument", `Unknown capability "${name}".`);
    if (entry.flag && flags[entry.flag] !== true) {
      throw new contextModule.OrchestratorError("failed-precondition", `The ${name} capability is not switched on in this deployment.`);
    }

    // Permission first, before a single document is read.
    contextModule.assertCapability(ctx, entry);

    // The one PII-logging mechanism. A capability that hands over a person says
    // so in the registry, and the row is written whether or not the read then
    // succeeds.
    //
    // The predicate is `piiAccessLogged`, the field the MCP dispatcher keys on
    // (`nvMcpPiiLoggedActions`). It used to be `entry.pii.length > 0` — a
    // second predicate over one registry, while the contract document claimed
    // in so many words that "the registry is the only list, so a channel cannot
    // describe a read differently from the way the MCP dispatcher describes
    // it". The two agree on today's ten orchestrator entries and disagree on
    // `get_bank_spending_summary` and `search_bank_transactions`, so the first
    // orchestrator capability to copy that shape would have logged on WhatsApp
    // and not on MCP.
    if (entry.piiAccessLogged === true && typeof deps.recordPiiAccess === "function") {
      const subjectId = String(args.orderId || "");
      deps.recordPiiAccess({
        companyId: ctx.companyId,
        actorUid: ctx.uid,
        actorEmail: ctx.email || "",
        actorRole: actorRoleFor(ctx),
        action: "assistant",
        source: ctx.channel.type,
        // The subject the capability is about, from the registry — the same
        // field the MCP dispatcher builds its row from, so the two surfaces
        // cannot describe one read differently.
        subject: { kind: entry.piiSubject || "order", id: subjectId },
        categories: [...entry.pii],
        // Two of the dispatcher's own conventions, for its own reasons. An
        // empty subject id with nothing said reads as a row whose subject went
        // missing rather than as a read of a SET. And `source` is normalised
        // against `accessLog.ACCESS_SOURCES` at write time, which has no
        // `whatsapp` in it — so without naming the channel here, the door a
        // WhatsApp read came through is not recoverable from the row at all.
        note: `capability=${name} channel=${ctx.channel.type}${subjectId ? "" : " subject=set"}`
      }).catch(() => undefined);
    }

    const nowMs = typeof deps.now === "function" ? deps.now() : Date.now();
    const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], ctx, { settings: ctx.settings });

    // The other half of privacy/outbound.js's third rule: "THE DECISION IS
    // RECORDED ... a block nobody can see is indistinguishable from a feature
    // that quietly does not work." The loader applies redactForChannel and,
    // being pure, cannot write the audit row; nothing else on this path did,
    // so a marketplace block made by one of these ten reads left no trace at
    // all, while the same block made by search_orders left one.
    //
    // One row per provider and reason, carrying `recordCount`, rather than one
    // per order: the loader projects up to a thousand orders for one question.
    if (typeof deps.recordPiiBlock === "function") {
      for (const block of (snapshot.piiBlocks || [])) {
        Promise.resolve(deps.recordPiiBlock({
          companyId: ctx.companyId,
          actorUid: ctx.uid,
          actorEmail: ctx.email || "",
          actorRole: actorRoleFor(ctx),
          action: "assistant",
          source: ctx.channel.type,
          // A set, not a record: the id is empty on purpose, and the provider
          // is what makes "show me every Amazon decision" answerable.
          subject: { kind: "order", id: "", provider: block.provider, externalId: "" },
          // What the policy WITHHELD, declared the way nvSafeOrderForChatGPT
          // declares it so both surfaces file one shape.
          categories: ["name", "email", "phone", "address"],
          recordCount: block.orders,
          note: `${block.minimal ? "minimal" : "blocked"}:${block.reason} capability=${name} channel=${ctx.channel.type} subject=set orders=${block.orders} fields=${block.fieldsRemoved}`
        })).catch(() => undefined);
      }
    }
    const result = handler(snapshot, args, ctx, { nowMs }) || {};

    const built = envelope.finish({
      capability: name,
      state: result.state || "completed",
      data: result.data || {},
      sources: result.sources || [],
      warnings: result.warnings || [],
      partial: result.partial === true,
      entityRefs: result.entityRefs || [],
      suggestedActions: result.suggestedActions || [],
      nowMs,
      channelProfile: ctx.channel && ctx.channel.profile
    });
    built.summary.lines = render.summaryFor(built, { style: ctx.channel.type === "whatsapp" ? "compact" : "chat" });
    if (typeof deps.audit === "function") {
      Promise.resolve(deps.audit({
        requestId: String(request.requestId || ""),
        channelType: ctx.channel.type,
        companyId: ctx.companyId,
        userId: ctx.uid,
        capability: name,
        resultState: built.state,
        recordsRead: {
          orders: (snapshot.orders || []).length,
          bankTransactions: (snapshot.bankRows || []).length,
          inventoryItems: (snapshot.inventoryItems || []).length
        }
      })).catch(() => undefined);
    }
    return built;
  }

  return { resolveContext, listCapabilities, run, loaders, flags };
}

module.exports = { createOrchestrator, HANDLERS, CAPABILITY_NAMES, ACTOR_ROLES, actorRoleFor };
