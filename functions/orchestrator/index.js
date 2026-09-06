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

function createOrchestrator(deps = {}) {
  const loaders = deps.loaders || loadersModule.createLoaders({ db: deps.db, now: deps.now });
  const flags = registry.normalizeFlags(deps.flags || {});

  const contextDeps = {
    loadCompany: deps.loadCompany || loaders.loadCompany,
    uidHasCompanyAccess: deps.uidHasCompanyAccess,
    uidIsCompanyOwner: deps.uidIsCompanyOwner,
    uidCanAccessWorkspaceArea: deps.uidCanAccessWorkspaceArea,
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
    if (Array.isArray(entry.pii) && entry.pii.length > 0 && typeof deps.recordPiiAccess === "function") {
      deps.recordPiiAccess({
        companyId: ctx.companyId,
        actorUid: ctx.uid,
        actorEmail: ctx.email || "",
        actorRole: "chatgpt_connection",
        action: "assistant",
        source: ctx.channel.type,
        subject: { kind: "order", id: String(args.orderId || "") },
        categories: [...entry.pii],
        note: `capability=${name}`
      }).catch(() => undefined);
    }

    const nowMs = typeof deps.now === "function" ? deps.now() : Date.now();
    const snapshot = await loaders.snapshotFor(entry.domainNeeds || [], ctx, { settings: ctx.settings, companyData: ctx.companyData });
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

module.exports = { createOrchestrator, HANDLERS, CAPABILITY_NAMES };
