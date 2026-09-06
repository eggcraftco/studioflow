# NivaDesk ChatGPT MCP — orchestration design (v2 read layer)

Status: design, 6 Sep 2026. Branch `mcp-orchestration`, worktree `/Users/gocmen/Developer/studioflow-mcp`.
Spec: `NivaDesk_ChatGPT_MCP_Agentic_Orchestration_Expanded_2026-09-05-2.md` (§1–§93) and
`NivaDesk_WhatsApp_AI_Channel_Implementation_Spec_2026-09-05.md` (cited as WA §n). Both read-only.

Source of truth for "what the server does today" is `functions/index.js` (`exports.chatgptMcp`,
line refs below are from HEAD `015d5792`), not the spec's memory of it (§15: "runtime behaviour is the
source of truth"). Everything in this document was checked against the code; where the spec and the
runtime disagree the runtime wins and the disagreement is called out.

## 0. Scope, constraints, decisions

What this document covers (spec §56 Phase 0 + Phase 1, WA §75 CH-1):

1. The annotation table and per-tool justification for every tool the runtime registers, and the code
   change that makes the four hints explicit, single-sourced and CI-validated (§16–§21).
2. The channel-agnostic orchestrator (`functions/orchestrator/*.js`): the §11–§12 read capabilities as
   pure functions over existing helpers, the result envelope (§13–§14), and the MCP tools as thin
   adapters behind a flag that is off by default.
3. Permission and PII rules per capability (§22–§23, memory rules).
4. The reuse contract the WhatsApp gateway will consume (§62–§92, WA §7–§47).
5. The test plan. 6. Guide entries. 7. What changes for OpenAI submission 1.2.0 and what does not.

Non-negotiables carried through every section:

- **tools/list stays byte-identical in production** until the operator decides the next OpenAI
  submission. Every new tool lives behind an env flag that is off by default and is appended after the
  frozen 19 (the pattern `mcp-inventory.test.js` already pins). The flag for this work is
  `NIVADESK_MCP_ORCHESTRATOR=1` (`NV_MCP_ORCHESTRATOR`, read at module load like the other two).
- **No new business logic in the channel.** Orchestration and policy are server modules that take an
  already-resolved workspace context; `chatgptMcp` and `chatgptWorkspaceAction` become adapters, and the
  WhatsApp gateway calls the same modules (WA §2 "WhatsApp is a channel, not a second NivaDesk").
- **Existing 19 tools are not rewritten** (§2). The only runtime change proposed for an existing tool is
  making `update_order_status` / `update_note` a true no-op when the requested end state equals the
  current one (§1.3 below); it needs a parity test written first.
- **No tool sprawl** (§10, §48): one source-filtered tool per job; no per-provider or per-agent tools.
- **Never deploy from this worktree; never touch the live listing, the review connection or the flags in
  production.** Nothing here writes to production.

Naming decision (§11 "final only after repository conflict check"): the ten §11–§12 names were grepped
across `functions/` (excluding `node_modules`) and none exists as a tool, callable or export. Nine are
adopted as-is. `search_inventory_items` is **not** added: the repository already has a hidden
`search_inventory` (`NV_MCP_INVENTORY`), and shipping both is the sprawl §10 forbids. `search_inventory`
keeps its name and gains the §11 filters (status, lowStock, reserved, location, mappingIssue) in the
same flag branch. Result with every flag on: 19 + 2 (inventory) + 9 (orchestrator) = 30 published tools.

## 1. Annotations

### 1.1 The rule the reviewer applies

OpenAI rejected 1.1.1 with: "annotations do not appear to match the tool's behavior … explicitly set to
true or false (not null) for every tool … include a clear justification … based on the tool's actual
behavior." Two demands (§1): all four hints are literal booleans on every published tool, and each value
is defensible from runtime behaviour. Definitions used below, fixed so the "verify" cells of §17 can be
decided by tests instead of opinion:

- `readOnlyHint: true` — the handler performs no Firestore/Storage write and no external call with a
  side effect. Audit logging of the read itself (`recordPiiAccess`) does not count as a write of
  workspace state.
- `destructiveHint: true` — a call can overwrite, replace, move or delete something the workspace already
  had (a status value, a note body, a receipt on a transaction). Purely additive writes (a new document,
  an appended line) and reversible boolean flags are `false`.
- `idempotentHint: true` — a second identical call produces no new document, no new sub-record (history
  entry, note line, stored file) and no change to any user-visible field. Server bookkeeping timestamps
  (`updatedAt`) are excluded from the comparison. This is the criterion the behaviour tests in §5.4
  assert; a value is not set to `true` without that test (§33.10).
- `openWorldHint: true` — the handler itself reaches outside the NivaDesk closed domain: fetches a URL,
  calls a third-party API (Vision OCR), or mutates a provider. Writing a NivaDesk record that later feeds
  an internal proposal is **not** open-world (§16's "internal proposal ≠ external provider mutation").

### 1.2 Runtime tool table

Order = `nvMcpAvailableActions()` (index.js:24413) = tools/list order. RO/D/I/OW = readOnly /
destructive / idempotent / openWorld. "Live" = value served by `GET https://mcp.nivadesk.app/chatgptMcp`
on 6 Sep (19 tools, serverInfo 0.1.0). Scope = `nvMcpOAuthScopesForTool` today → proposed. Risk class
per §43; assurance per WA §15 (channel policy only; not on the wire).

| # | Tool | Flag | RO | D | I | OW | Live matches | Scope today → proposed | Risk / assurance |
|---|------|------|----|---|---|----|--------------|------------------------|------------------|
| 1 | create_order | — | false | false | false | false | yes | orders.write | C / L2 |
| 2 | search_orders | — | true | false | true | false | yes | orders.read | A / L1 |
| 3 | get_order_detail | — | true | false | true | false | yes | orders.read | A / L1 |
| 4 | add_order_note | — | false | false | false | false | yes | orders.write, notes.write | B / L1 |
| 5 | update_order_status | — | false | true | true | false | yes (see 1.3) | orders.write | C / L2 |
| 6 | create_note | — | false | false | false | false | yes | notes.write | B / L1 |
| 7 | search_notes | — | true | false | true | false | yes | notes.read | A / L1 |
| 8 | get_note_detail | — | true | false | true | false | yes | notes.read | A / L1 |
| 9 | append_note | — | false | false | false | false | yes | notes.write | B / L1 |
| 10 | update_note | — | false | true | true | false | yes (see 1.3) | notes.write | B / L1 |
| 11 | pin_note | — | false | false | true | false | yes | notes.write | B / L1 |
| 12 | archive_note | — | false | false | true | false | yes | notes.write | B / L1 |
| 13 | get_order_financials | — | true | false | true | false | yes | finance.read | A / L1 |
| 14 | get_dashboard_summary | — | true | false | true | false | yes | orders.read, finance.read | A / L1 |
| 15 | get_extra_spending_overview | — | true | false | true | false | yes | finance.read | A / L1 |
| 16 | get_financial_overview | — | true | false | true | false | yes | finance.read | A / L1 |
| 17 | get_bank_spending_summary | — | true | false | true | false | yes | finance.read | A / L1 |
| 18 | search_bank_transactions | — | true | false | true | false | yes | finance.read | A / L1 |
| 19 | attach_bank_receipt | — | false | true | false | true | yes | finance.read, orders.write | C / L2 |
| 20 | search_inventory | NV_MCP_INVENTORY | true | false | true | false | hidden | (default orders.read) → orders.read | A / L1 |
| 21 | create_inventory_item | NV_MCP_INVENTORY | false | false | false | true | hidden | (default orders.read, wrong) → orders.write | C / L2 |
| 22 | get_business_attention_summary | NV_MCP_ORCHESTRATOR | true | false | true | false | new | orders.read, finance.read | A / L1 |
| 23 | get_commerce_overview | NV_MCP_ORCHESTRATOR | true | false | true | false | new | finance.read | A / L1 |
| 24 | search_commerce_orders | NV_MCP_ORCHESTRATOR | true | false | true | false | new | orders.read | A / L1 |
| 25 | get_channel_performance | NV_MCP_ORCHESTRATOR | true | false | true | false | new | finance.read | A / L1 |
| 26 | get_inventory_overview | NV_MCP_ORCHESTRATOR | true | false | true | false | new | orders.read | A / L1 |
| 27 | get_payout_reconciliation_overview | NV_MCP_ORCHESTRATOR | true | false | true | false | new | finance.read | A / L1 |
| 28 | get_integration_health | NV_MCP_ORCHESTRATOR | true | false | true | false | new | orders.read | A / L1 |
| 29 | get_accounting_sync_status | NV_MCP_ORCHESTRATOR | true | false | true | false | new | finance.read | A / L1 |
| 30 | get_banking_attention_summary | NV_MCP_ORCHESTRATOR | true | false | true | false | new | finance.read | A / L1 |

Resolution of §17's "verify" cells from runtime (not from names):

- `get_bank_spending_summary`, `search_bank_transactions` → openWorld **false**: `nvLoadBankTransactions`
  reads `companies/{cid}/bankTransactions` and `bankReceiptInbox` only (index.js ~24681); no provider
  call, no TrueLayer/PayPal request.
- `update_order_status`, `update_note` → destructive **true** (overwrite of an existing value via
  set(merge)), idempotent **true** once §1.3 lands (today the status handler appends a history entry on
  every call, which violates the definition in §1.1).
- `pin_note`, `archive_note` → destructive **false** (reversible boolean), idempotent **true** (set(merge)
  of the same boolean; second call changes nothing but `updatedAt`).
- `attach_bank_receipt` → idempotent **false**: the §6.2 duplicate-retry test shows that a second call
  with the same `inboxPath` fails because `assignInboxReceipt` (bankFeed.js:1843) moved the inbox file,
  and a second call with the same file uploads and scores a second copy.
- Two §17 rows disagree with runtime and the runtime values are kept: `attach_bank_receipt` is
  destructive **true** (assigning replaces and deletes a previous `receiptPath` on the transaction) and
  openWorld **true** (fetches from ChatGPT's file host / an https `receiptUrl` after the SSRF check and
  calls Google Vision OCR).

### 1.3 Per-tool justification (registry text, one paragraph each)

The registry (§1.4) stores four `Because …` lines per tool; the paragraph below is the same content in
prose and is what goes into the 1.2.0 release notes.

**create_order** — readOnlyHint false because the call writes a new document in `siparisler` through
`nvOrderDefaults` with `createdFrom:"chatgpt"`. destructiveHint false because it only adds a record; no
existing order is changed or removed. idempotentHint false because there is no request-level
deduplication: the same arguments twice create two orders with fresh ids. openWorldHint false because
the write is confined to the authenticated NivaDesk workspace; no provider or external system is
touched.

**search_orders** — readOnlyHint true because it queries `siparisler` by `companyId` and filters in
memory; nothing is written except the PII access audit row. destructiveHint false because no record is
altered. idempotentHint true because repeating the query returns the same rows and creates nothing.
openWorldHint false because it reads NivaDesk data only and never contacts a sales channel.

**get_order_detail** — same behaviour class as search_orders on a single document (cross-workspace and
workflow-only assignment checks are reads).

**add_order_note** — readOnlyHint false because it appends to the order's `notes` string and adds a
`historyLog` entry. destructiveHint false because existing text is kept; the call only concatenates.
idempotentHint false because each repeat appends the same line again. openWorldHint false: workspace
document only.

**update_order_status** — readOnlyHint false because it sets `status` / `designStatus`. destructiveHint
true because the previous value is overwritten (the old status is not recoverable from the field).
idempotentHint true because the call sets an explicit end state; with §1.3's no-op guard a repeat with the
same values changes nothing (no second history entry). openWorldHint false because the tool writes the
NivaDesk order only; it does not push status to Shopify/Etsy/Amazon or any provider. (Verification item
for the behaviour suite: confirm no Firestore trigger sends a customer SMS/e-mail on a status change made
through this path; `index.js` has no `onDocumentWritten` on `siparisler` and no status-driven Twilio
send, so the claim holds today and the test keeps it true.)

**create_note** — false/false/false/false: creates a new note document under the connected user's
`personal_notes`; additive; no dedupe; workspace only.

**search_notes**, **get_note_detail** — true/false/true/false: read the user's own notes only.

**append_note** — false/false/false/false: appends to `text`; existing text kept; each repeat appends again.

**update_note** — readOnlyHint false because it sets title/text/labels/links/colour. destructiveHint true
because the supplied fields replace the previous values. idempotentHint true because it sets an explicit
end state (with the §1.3 no-op guard a repeat is a pure no-op). openWorldHint false.

**pin_note** / **archive_note** — readOnlyHint false because they set `isPinned` / `isArchived`.
destructiveHint false because the flag is reversible and no content is lost. idempotentHint true because
a repeat sets the same boolean and leaves the note unchanged. openWorldHint false. (Behaviour note kept in
the justification: omitting the boolean defaults it to `true`.)

**get_order_financials**, **get_dashboard_summary**, **get_extra_spending_overview**,
**get_financial_overview** — true/false/true/false: compute over orders/spending documents in the
workspace; plan and role decide the shape (basic vs advanced, finance fields stripped without the
Financial permission); nothing written but the PII audit row; nothing external.

**get_bank_spending_summary**, **search_bank_transactions** — true/false/true/false: read the workspace's
already-imported bank rows and the receipt inbox; classification is in-process
(`bank/classification.js`); no bank, PayPal or provider API is called; repeat calls change nothing.

**attach_bank_receipt** — readOnlyHint false because it stores the file under
`companies/{cid}/bank_receipts/_inbox/…`, and then either assigns it to a transaction, returns candidates,
or queues it as waiting. destructiveHint true because assigning to a transaction that already has a
receipt replaces that receipt (the previous `receiptPath` is deleted). idempotentHint false because a
repeat with the same file stores and scores a second copy, and a repeat with the same `inboxPath` fails
because the inbox file was moved on the first assignment. openWorldHint true because the handler fetches
the file from ChatGPT's file host (or a public https `receiptUrl` when the e-mail flag is on) and calls
Google Vision for OCR — it interacts with systems outside NivaDesk even though it mutates no sales
provider. Owner-only; the §6.1 match flow is regression-critical and unchanged.

**search_inventory** (flag) — true/false/true/false: reads `inventoryItems`; workspace only.

**create_inventory_item** (flag) — readOnlyHint false because it writes an item through
`inventoryInternal.saveItemForWorkspace` and stores the photo. destructiveHint false because it only adds.
idempotentHint false because a repeat creates a second item (it refuses without `confirmed:true`, which
is a guard, not deduplication). openWorldHint true because it downloads the photo from ChatGPT's file
host.

**get_business_attention_summary, get_commerce_overview, search_commerce_orders,
get_channel_performance, get_inventory_overview, get_payout_reconciliation_overview,
get_integration_health, get_accounting_sync_status, get_banking_attention_summary** (flag) —
readOnlyHint true because each runs `orchestrator.run()` over a snapshot read from Firestore and returns
an envelope; the only write is the PII audit row for `search_commerce_orders`. destructiveHint false: no
record altered. idempotentHint true: same input, same snapshot → same answer; nothing created.
openWorldHint false because they read NivaDesk's canonical records (orders, payouts, bank rows,
connection status docs) and never call Shopify, Etsy, Amazon, eBay, Square, PayPal, a bank or an
accounting provider; provider status is whatever the last sync recorded, and the envelope says how old
that is. The `suggestedActions` they return are references to other NivaDesk tools, not executed actions
(§16 internal-proposal rule).

### 1.4 Code change: explicit booleans from one registry, validated at load

Today the four hints are literal booleans inside `nvMcpOrderToolSchemas()` (index.js:26099) and are
re-coerced with `=== true` by `nvMcpNormalizedAnnotations` (26049). Coercion is the problem the reviewer
is pointing at: a `null` in source would silently ship as `false`. The change:

1. **New module `functions/orchestrator/registry.js`** — the single capability table (also the table
   WhatsApp reads). One entry per tool:

   ```js
   {
     name: "update_order_status",
     domain: "orders",                // orders | notes | finance | banking | inventory | commerce | integrations | accounting | attention
     flag: null,                      // null | "inventory" | "orchestrator"
     scopes: ["orders.write"],        // OAuth scopes advertised in securitySchemes
     permission: { area: "orders", write: true, financial: false, bankFeed: false, ownerOnly: false },
     riskClass: "C",                  // §43 A–E
     minAssurance: 2,                 // WA §15 L1–L3 (channel policy; not on the wire)
     pii: [],                         // categories emitted → recordPiiAccess
     annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
     justification: {
       readOnlyHint: "Because the call sets status/designStatus on the order document.",
       destructiveHint: "Because the previous status value is overwritten.",
       idempotentHint: "Because it sets an explicit end state; a repeat with the same values is a no-op.",
       openWorldHint: "Because it writes the NivaDesk order only and never pushes status to a provider."
     }
   }
   ```

   `assertRegistry()` runs at module load and throws (so the function fails to start, not silently)
   when any published entry has a hint that is not `typeof "boolean"`, a missing/empty justification
   line, an empty scope list, or a scope outside `scopes_supported`. `publishedNames(flags)` returns the
   frozen 19 in order, then `inventory` entries, then `orchestrator` entries, only for flags that are on.
   `annotationsFor(name)` returns the four keys in fixed order; `justificationFor(name)`;
   `scopesFor(name)`.

2. **`nvMcpOrderToolSchemas()`** keeps every schema literal exactly as it is (bytes matter) but each
   `annotations: { … }` literal becomes `annotations: nvRegistry.annotationsFor("<name>")`. Same values,
   same JSON, one source. The `// Tool annotations are always explicit booleans …` comment block moves
   to the registry.

3. **`nvMcpNormalizedAnnotations` → `nvMcpAssertAnnotations`**: no coercion; throws `TypeError` if a hint
   is not a boolean. Wire output for the 19 is unchanged.

4. **`nvMcpOAuthScopesForTool` → `nvRegistry.scopesFor(name)`**; this fixes the two inventory tools that
   currently fall to the default (`create_inventory_item` advertises `orders.read` for a write) and gives
   every new tool a case. No new scope names are introduced (`orders.read/write`, `notes.read/write`,
   `finance.read` cover everything), so the WWW-Authenticate challenge and the metadata document do not
   change. Scope is still not enforced per tool at runtime; the registry's `permission` block is what the
   context resolver enforces (§3).

5. **`nvMcpAvailableActions()` → `nvRegistry.publishedNames({ inventory: NV_MCP_INVENTORY, orchestrator:
   NV_MCP_ORCHESTRATOR })`**. The dispatcher keeps an explicit `case "<name>"` per tool (the
   `mcp-permissions` source-text assertion depends on it); orchestrator cases are one-liners:
   `return nvOrchestratorRun("get_commerce_overview", context, args);`.

6. **Discovery text outside tools/list** (safe to change, currently stale): `nvMcpServerInfo` version
   `"0.1.0"` → `"1.2.0"`; `nvMcpInitializeResult.instructions` rewritten to name every domain the list
   exposes (orders, notes, finance, banking receipts; inventory and cross-channel overview when their
   flags are on), the read/write boundary, the "does not modify an external provider" statement (§21),
   and the freshness rule ("if a response says a sync is behind, say so; never present it as live").
   The unauthenticated `GET /chatgptMcp` document gains `tools[].annotationJustification` only when
   `NV_MCP_ORCHESTRATOR` is on, so the probe DURUM.md uses stays identical until the operator flips it.

7. **`functions/scripts/mcp-tools-report.js`** prints the table + justifications from the registry
   (markdown for the release notes) and, with `--compare <url>`, diffs the deployed GET document against
   the registry projection (read-only GET; run by the operator at submission time, §20/§30).

8. **`update_order_status` / `update_note` no-op guard** (the only behaviour change to an existing tool,
   §2 → parity test first): read the document, and when every requested field already equals the
   requested value, return the current state without writing (no history entry, no `updatedAt` bump).
   First calls are unchanged; only exact repeats differ. This is what makes `idempotentHint:true` true
   under §1.1's definition, and it is the same transition rule WhatsApp will inherit (WA §70).

## 2. The orchestrator

### 2.1 Layout

```
functions/orchestrator/
  index.js            createOrchestrator(deps) → { resolveContext, listCapabilities, run, attention, render }
  registry.js         capability table (§1.4); MCP tools/list is a projection of it
  context.js          resolveContext / assertCapability over injected predicates (pure given companyData)
  envelope.js         ok/data/freshness/partial/warnings/entityRefs/suggestedActions/state builder
  freshness.js        freshness from commerceHealth + connection docs + bank/accounting sync fields
  channel.js          channelOf(order), CHANNELS, channelAvailability(providers, connections)
  loaders.js          the ONLY impure module: Firestore reads → snapshot; applies redactForChannel
  attention.js        deterministic detectors → §40 items; dedupe + batching
  commerce.js         commerceOverview, searchCommerceOrders, channelPerformance
  inventoryMetrics.js summarize(items) lifted from inventory.js closures (callables call it too)
  payouts.js          payout reconciliation over squarePayouts/paypalPayouts docs
  integrationHealth.js rows from connection docs + healthView + cursors + DLQ counts
  accountingStatus.js primary writer, phase, honest postings, readiness reasons
  bankAttention.js    §12 rules (uses functions/bank/insights.js, ported from the web client)
  render.js           §13-ordered text; styles "chat" (ChatGPT) and "compact" (WhatsApp)
functions/bank/insights.js   pure port of studioflow-web/lib/studioflow/bankInsights.ts rules
```

Rules for the modules:

- **Pure by construction.** Every module except `loaders.js` is `snapshot in → data out` with `nowMs`
  passed explicitly (the style of `commerce/settlements.js`, `commerce/health.js`, `bank/classification.js`).
  Tests build snapshots by hand; no fake Firestore, no `where()`.
- **No `require("../index")`.** Predicates that live in index.js (`uidHasCompanyAccess`,
  `uidIsCompanyOwner`, `uidCanAccessWorkspaceArea`, `normalizeWorkspaceRole`,
  `billingEntitlementsForCompany`, `nvRoleCanAccessFinancialInfo`, `recordPiiAccess`) are injected through
  `createOrchestrator(deps)`, the way `createInventoryFunctions` is wired. index.js builds one instance at
  load; the WhatsApp gateway (a later function in the same codebase) builds it with the same deps.
- **Existing helpers, not re-implementations**: money = `finance/engine.computeOrderFinance` (falling back
  from the stamped `order.finance` when `computedAtMs` is missing or `engineVersion` is behind — never
  the legacy `nvChatGPTOrderFinancialsFromData` math, which ignores refunds and `platformFeeKnown`);
  classification = `bank/classification.js`; health = `commerce/health.healthView`; cursors =
  `commerce/cursors.readCursor`; availability = `commerce/capabilities.getCapabilities/listProviders` +
  `commerce/connectionCapabilities`; settlement scoring = `commerce/settlements.js` and
  `settlementMatch.createSettlementMatcher().suggestForPayout`; production stage =
  `production.resolveProductionStage`; Pandle readiness = `pandle.js resolveMapping`; accounting attention
  = `accounting/core/store.openAttention`; redaction = `privacy/outbound.redactForChannel`.
- **Firestore reads stay single-field** (`where("companyId","==",cid)` on root collections, plain
  subcollection reads) with in-memory filtering; `firestore.indexes.json` has no composite index for
  `siparisler`, `bankTransactions` or `inventoryItems`, and a composite `where` returns nothing silently
  (index.js:29468 comment). Caps: orders 1000, bank rows 3000, inventory 2000, payouts 500 per provider;
  hitting a cap sets `partial:true` with warning `loader_cap_reached`.

### 2.2 Context (input to every capability)

```js
resolveContext({ uid, companyId, companyData, authType, scope, channel })
→ {
    uid, companyId, companyRef, companyData,
    role,                      // normalizeWorkspaceRole(...)
    isOwner,
    areas: { orders, dashboard, customers, financialInfo, bankFeed },   // uidCanAccessWorkspaceArea per area
    entitlements: billingEntitlementsForCompany(companyData),           // advancedFinanceEnabled, bankFeedEnabled, …
    workflowOnly, assignedOnly,                                         // workflowOnly → only assignedToUid === uid
    channel: { type: "mcp"|"rest"|"whatsapp"|"app", bindingId, isGroup, profile }  // §65 capability contract
  }
assertCapability(ctx, registryEntry) → void | throws HttpsError("permission-denied" | "failed-precondition")
```

`companyId` in the input always comes from the caller's resolved authority (the OAuth token's companyId
in `nvRequireChatGPTWorkspaceAccessWithOAuth`, the binding for WhatsApp), never from tool arguments
(§23, §85). Membership is re-checked on every call (`uidHasCompanyAccess`, which honours
`suspendedMembers`); a cached role snapshot is never authority (WA §13).

### 2.3 Envelope (§13, §14, §25)

Every orchestrator result, whatever the channel:

```js
{
  ok: true,
  action: "get_commerce_overview",         // kept: existing consumers read `action`
  state: "completed",                      // fixed vocabulary: prepared | awaiting_approval | approved | queued |
                                           //   executing | completed | partially_completed | failed | invalidated | needs_attention
  data: { … capability-specific … },
  freshness: {
    generatedAt: "2026-09-06T10:15:00.000Z",
    ordersLastSync: "2026-09-06T09:40:11.000Z" | null,     // oldest successful orders sync across CONNECTED channels; null = no syncing channel (NivaDesk-native data is live)
    inventoryLastSync: null,                               // inventory has no sync today (source "nivadesk")
    financeLastSync: "2026-09-06T04:02:00.000Z" | null,    // oldest of bank/payout/accounting sync
    staleAfterMs: 21600000,
    sources: [ { provider, connectionId, entity: "orders"|"inventory"|"finance", lastSuccessAt, state: "fresh"|"stale"|"never"|"unsupported"|"not_visible" } ]
  },
  partial: false,                          // true when a connected source was excluded or a loader cap was hit
  warnings: [ { code, message, channel?, connectionId? } ],
  entityRefs: [ { type: "order"|"bankTransaction"|"payout"|"inventoryItem"|"connection"|"note", id, label, url } ],
  suggestedActions: [ { capability, args, label, riskClass, requiresApproval } ],   // references only; nothing executed
  summary: { lines: [ { slot: "result"|"breakdown"|"finance"|"attention"|"next", text } ] }   // §13 order, numbers copied from data
}
```

Warning codes (closed list, tested): `channel_not_connected`, `channel_not_available`
(adapter exists, no runtime — amazon, ebay), `channel_not_supported` (faire), `channel_excluded_auth`
(needs reconnect), `channel_stale` (older than `staleAfterMs`), `status_not_visible_from_this_surface`
(Amazon zone project), `loader_cap_reached`, `plan_limited` (basic finance shape / bankFeed plan off),
`section_not_permitted` (role lacks the area; the section is named, its contents are not),
`unsupported_metric` (no data model for it, e.g. discounts, listing mappings), `estimated` (fee or profit
figure is an estimate).

Freshness rule for the renderer (§14): any `sources[]` row with `state: "stale"` produces a `finance` or
`breakdown` line of the form "Amazon finance sync is 8 hours behind, so today's payout total may be
incomplete"; `partial:true` produces a line naming what was excluded and why ("eBay is excluded because
the connection needs reauthorization", WA §67). Nothing in `summary.lines` may contain a number that is
not present in `data` (tested in §5).

Existing 19 tools: with `NV_MCP_ORCHESTRATOR` off, their results are untouched. With it on, the
dispatcher merges `freshness`, `partial`, `warnings` as additional top-level keys onto their existing flat
result (never overriding an existing key) so ChatGPT sees §14 metadata everywhere. The parity test pins
flag-off results byte-identical and flag-on results as a strict superset.

### 2.4 `run()`

```js
run({ capability, args, ctx, request: { requestId, channelType, providerMessageId, providerConversationId, idempotencyKey } })
```

1. `registry.get(capability)`; refuse unknown names and names whose flag is off (same rule as the
   dispatcher today).
2. `assertCapability(ctx, entry)` — before any read (§38 "permission check BEFORE tool call").
3. If `entry.pii.length`, `recordPiiAccess({ actorRole: ctx.channel.type === "mcp" ? "chatgpt_connection" : ctx.channel.type, action: "assistant", source: ctx.channel.type, categories })` (fire-and-forget, as today).
4. `loaders.snapshotFor(entry.domainNeeds, ctx)` — reads only what the capability declares; orders are
   redacted at the choke point (`redactForChannel(order, "assistant")`) before any pure module sees them.
5. `handler(snapshot, args, ctx, { nowMs })` → `data`, plus per-capability warnings/refs/suggestions.
6. `freshness.build(snapshot)`, `envelope.finish(...)`, `render.summary(...)`.
7. Emit the audit record (§86) through the injected `audit` sink: `{ request_id, channel_type,
   provider_message_id, provider_conversation_id, binding_id, workspace_id, user_id, group_id,
   received_at, intent: capability, orchestrator_route: entry.domain, tool_calls: [capability],
   proposal_id: null, approval_id: null, execution_id: null, result_state, response_message_id }`. No
   arguments, no secrets, no result body in the record (§54).

Reads carry no `idempotencyKey` behaviour; the parameter is part of the contract so that the CH-4 write
path (WA §43) plugs in without changing signatures.

### 2.5 Capabilities

All nine new tools plus the extended `search_inventory` are risk class A, assurance L1, annotations
true/false/true/false, scope as in §1.2. Common optional input on every tool: none — `companyId` is
accepted for backwards compatibility with the schema style of the 19 (`"Optional. Usually omit this…"`)
and ignored when the token carries one, exactly as today.

#### get_business_attention_summary (§11, §40, §51) — status: **spec-only today**, no implementation exists (§58.22)

Input: `{ horizonDays?: 1..30 (default 7), domains?: ["orders","shipping","payments","inventory","banking","payouts","accounting","integrations"], limit?: 1..50 (default 20) }`.

Output `data`: `{ counts: { critical, high, medium, low }, sections: [ { id, status: "ok"|"not_permitted"|"unsupported"|"unavailable", itemCount } ], items: AttentionItem[] }` where

```js
AttentionItem = { attentionId, type, severity: "critical"|"high"|"medium"|"low", title, reason,
                  reasons: [type...],          // merged detector types for the same entity
                  entityRefs: [...], facts: [ { key, value, currency? } ],
                  freshness: { source, lastSuccessAt, state }, suggestedActions: [...],
                  requiresApproval: false, createdAt, resolvedAt: null }
```

Detectors (pure, `attention.js`, each `detect(snapshot, ctx, opts) → items`), with their existing sources:

| type | rule | source helpers | permission |
|------|------|----------------|------------|
| order_overdue | due < now, not completed/cancelled, not dispatched | `nvChatGPTDueDateMillis` logic (dueDate/deliveryDueDate/deliveryDate else createdAt + deliveryTime days), `nvIsCompletedStatus/nvIsCancelledStatus` lifted into `channel.js` helpers | orders |
| order_due_soon | due within `horizonDays` | same | orders |
| payment_outstanding | remainingAmount > 0 and (dispatched or due ≤ horizon) | order money via computeOrderFinance | financialInfo |
| approval_waiting | estimateStatus in sent/viewed, or `production.resolveProductionStage` blocker `waiting_for_customer_approval` | production.js, estimates[] | orders |
| shipping_waiting | stage kind `shipready` && !isDispatched | production.js with `productionStagesFromSettings` + custom steps | orders |
| platform_fulfilment_mismatch | commerce.fulfillmentStatus === "fulfilled" && !isDispatched (provider says shipped, NivaDesk says waiting) | order.commerce | orders |
| shipped_without_tracking | isDispatched && !trackingNumber | order | orders |
| order_review_required | commerce.reviewRequired or row in `commerceReviewQueue`, or `heldIntegrationOrders` | commerce/engine REVIEW_COLLECTION | orders |
| stock_low | trackingType quantity, lowStockAt > 0, onHand ≤ lowStockAt | inventoryMetrics | orders (inventory gate) |
| stock_reserved_conflict | reservations reference an open order and onHand < reserved | inventoryMetrics + orders | orders |
| receipt_missing | spend row, !receiptPath, !receiptNotNeeded | bank/classification + extended loader | bankFeed |
| transaction_uncategorised | spend row and (!category or categoryAuto) | same | bankFeed |
| receipts_waiting | bankReceiptInbox status "waiting" | loader | bankFeed |
| payout_unmatched | payouts.js unmatched | payouts.js | bankFeed |
| bank_connection_attention | bankConnections.syncState in error/needs_reconsent/disconnected | loader | bankFeed |
| accounting_attention | accountingAttention open docs | store.openAttention | bankFeed (accounting reader) |
| accounting_not_ready | pandle mapping errors uncategorised/split/needs_info | pandle.js resolveMapping | bankFeed |
| integration_reconnect | connection status needs_reconnect / reconnect_required / uninstalled / needsReauth | integrationHealth.js | orders |
| integration_stale | healthView state stale for orders/finance | integrationHealth.js | orders |

Deterministic first, AI second (§40): no LLM anywhere in this module. Severity is a fixed map per type
with two escalations (overdue > 7 days → critical; reconnect required → critical). Dedupe/batching (§51,
§59.6): order-level detectors merge by `entityRef` into ONE item per order with `reasons[]` and the highest
severity (an overdue order that is also shipping-waiting is one item, not three); row-level detectors
(receipts, uncategorised, payouts, stock) produce ONE grouped item per type with `facts.count`,
`facts.amount` and up to 20 `entityRefs` ("8 transactions missing receipts — £1,842"). `attentionId` is
deterministic: `sha1(type + entityType + entityId)` for entity items, `sha1(type + companyId + day)` for
grouped items, so the WhatsApp briefing and the in-app engine refer to the same ids (WA §28).
Sections the role cannot see appear as `status: "not_permitted"` with no items (the renderer says
"Banking items are not included for your role", nothing more). workflowOnly contexts see only orders
assigned to them and no money/banking sections. The server-side Attention Engine (Phase 4) reuses
`attention.collect(snapshot, ctx)` unchanged; only the loader trigger differs.

#### get_commerce_overview (§11, §26)

Input: `{ source?: "all"|"manual"|"inbound"|"shopify"|"etsy"|"woocommerce"|"square"|"amazon"|"ebay"|"faire" (default "all"), fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }` — dates are inclusive UTC calendar days (the legacy `nvChatGPTScopeDateRange` uses server-local time; the new capability does not).

Output `data`:

```js
{ range: { fromDate, toDate, basis: "paymentDate|createdAt" },
  orders: { count },
  sales: { gross, refunds, net, currency, currencies: [ { currency, gross, orders } ],
           discounts: { available: false, reason: "not_persisted_on_order" },
           shippingIncome: { available: false, reason: "not_persisted_on_order" } },
  fees: { known, knownOrders, estimated, estimatedOrders, unknownOrders, basis: "platformFeeKnown|settings.feePercentage" },
  settlements: { square: { count, gross, fee, net, currency }, paypal: {...}, others: [ { provider, available: false, reason } ] },
  fulfilment: { unfulfilled, partial, fulfilled, unknown, dispatched, delivered },
  channels: [ { channel, availability: "connected"|"supported_not_connected"|"not_available"|"not_supported",
                orders, gross, refunds, feesKnown, feesEstimated, currency, freshness } ] }
```

Rules: per-order money comes from `order.finance` (stamp) or `computeOrderFinance(order, settings)`;
`sales.gross` sums `revenue`, `refunds` sums `refunded`; `settlements` are reported separately and are
never added to `sales` (§26 — sale, payment, fee, refund, payout, bank deposit and accounting posting are
distinct events; the fixture test in §5 has order £100 + payout £95 + bank deposit £95 and asserts gross
100, settlement 95, and that 290 appears nowhere). Discounts and shipping income are not persisted on
orders (`envelopeToOrder.shopOwnedFields` drops them) → `available:false`, warning `unsupported_metric`,
never zero. Fees: `platformFeeKnown` orders (Square) count as known; others use the workspace's
`feePercentage` and are labelled `estimated`. Channel rows for `not_available` / `not_supported` carry no
numbers (no fabricated zeros, §8/§33.15); when a connected channel is excluded (needs reconnect, stale
beyond threshold and `source:"all"`), `partial:true` and a warning naming it. Plan: basic plans get
`plan_limited` and only `orders.count`, `sales.gross/refunds`, `fulfilment` (mirrors
`nvChatGPTBasicFinanceLimitation`); advanced plans get fees and settlements.

`channelOf(order)` (channel.js) precedence: `commerce.provider` (engine-applied: woocommerce, square,
amazon) → `etsySource` → `orderSource === "inbound"` → `customFields.Source` known labels (Shopify, Etsy —
the Shopify live path writes only this + "Shopify Order ID") → `createdFrom === "chatgpt"` → `manual`.
Returns `{ channel, provider, connectionId, externalId, externalUpdatedAt, identitySource:
"engine"|"legacy"|"manual" }`; the §7/§27 identity fields are carried, never merged, never remapped
(eBay stays eBay). The vocabulary must include everything `test/qa/dashboard-channels.test.js` pins for
the web dashboard so the two surfaces agree.

#### search_commerce_orders (§10, §33.6)

Input: `{ source?, query?, status?, fromDate?, toDate?, paymentStatus?: "paid"|"partial"|"unpaid"|"refunded"|"unknown", fulfillmentStatus?: "unfulfilled"|"partial"|"fulfilled"|"unknown", needsAttention?: boolean, limit?: 1..50 (default 20) }`.

Output row (every field separate, §33.6):

```js
{ orderId, orderNumber, projectNumber,
  channel, provider, connectionId, connectionName, externalOrderId, externalAdminUrl,
  platformStatus,                         // commerce.platformStatus / etsySource.status — provider's word
  paymentStatus, fulfillmentStatus,       // provider payment / fulfilment state
  workflow: { status, designStatus, stage, isDispatched, isDelivered, dueDate },   // NivaDesk's word
  totals: { grandTotal, paid, remaining, refunded, currency },                       // only with Financial permission
  customer: { name, email } | { restricted: true, reason: "provider_pii_policy" },   // via redactForChannel
  needsAttention: { reviewRequired, reasons: [] },
  lastSyncAt, freshness: { state } }
```

Reads the same `siparisler` query as `search_orders` (companyId only, cap 1000, workflowOnly →
assignedToUid), filters in memory. `query` matches the same fields as `search_orders` plus
`externalOrderId` / `commerce.orderNumber` / `etsySource.receiptId`. PII: rows pass through
`redactForChannel(order, "assistant")` in the loader (Amazon/eBay/unknown provider → buyer fields
stripped and `restricted:true`); `pii: ["name","email"]` → `recordPiiAccess`. Attention flags come from
`commerce.reviewRequired`, `commerceReviewQueue`, `heldIntegrationOrders`.

#### get_channel_performance (§11)

Input: `{ fromDate, toDate, channels?: [...] }`. Output per channel: `{ channel, availability, orders,
gross, aov, refunds, fees: { known, estimated }, profit: { value, basis: "known"|"estimated"|"unavailable",
costCoverage: 0..1 }, settlement: { available, matched, unmatched } , fulfilment: {...}, freshness }`.
`profit.value` is only a definite number when `costCoverage === 1` (every order has `directCost` from
`watchPurchasePrice` or line items); otherwise `basis:"estimated"` with the coverage figure and warning
`estimated`, or `unavailable` when coverage is 0 (§11: "with missing cost data profit must not be given as
a definite number"). Settlement state only for square/paypal; others `available:false`. Faire is not a
provider anywhere in the code (`commerce/envelope.js PROVIDERS`) → `not_supported`.

#### get_inventory_overview (§11)

Input: `{ location?, category? }`. Output: `{ counts: { items, lowStock, reserved, incoming, available,
deadStock }, value: { cost, currency }, lowStock: [ { itemId, name, onHand, lowStockAt, supplierName } ]
(≤25), reservedForOpenOrders: [...], channelAllocation: { supported: false, reason: "no_listing_mapping" },
syncMismatch: { supported: false, … }, oversellRisk: { supported: false, … }, multiChannelListings: {
supported: false, … }, sourceOfTruth: "nivadesk" }`. The numbers come from
`inventoryMetrics.summarize(items, { nowMs })`, lifted from the `getInventorySummary` (inventory.js:546)
and `getInventoryReport` (1033) closures; those callables are changed to call the pure module so the app
and the assistant cannot drift (parity test). No product↔listing mapping collection exists, so the four
channel keys are `supported:false` with one `unsupported_metric` warning, not zeros. `inventoryLastSync`
is `null` (manual inventory).

#### search_inventory (existing hidden tool, extended)

Adds `status`, `lowStock`, `reserved`, `location`, `channel`, `mappingIssue` to the input schema in the
same `NV_MCP_INVENTORY` branch (schema change is invisible while the flag is off). `channel` and
`mappingIssue` return an empty result with warning `unsupported_metric` (no mapping data). SKU stays a
search field, not an identity (§27). Gate unchanged.

#### get_payout_reconciliation_overview (§11)

Input: `{ provider?: "all"|"square"|"paypal"|…, fromDate?, toDate? }`. Output: `{ totals: { matched,
partial, unmatched, needsReview }, providers: [ { provider, available, matched, partial, unmatched,
needsReview, unmatchedAmount, currency, oldestUnmatchedAt, freshness } ], unmatched: [ { payoutId,
provider, amount, currency, arrivalDate, candidateCount } ] (≤25) }`.
Sources: `companies/{cid}/squarePayouts` and `paypalPayouts` (`status`, `amount`, `currency`,
`arrivalDate`, `totals{gross,fee,refunds,net}`, `bankMatch{transactionId,confidence,method,amountDelta}`).
`matched` = `bankMatch.transactionId` set and `amountDelta === 0`; `partial` = matched with
`amountDelta ≠ 0`; `unmatched` = status in `MATCHABLE_STATUSES` and no match. `needsReview` is not
persisted today (the audit counter in `settlementMatch.matchProviderPayouts` is discarded), so it is
computed read-only with `suggestForPayout` for at most 25 unmatched payouts (`> 1` candidate →
needsReview); beyond that `needsReview: null` with warning `needs_review_truncated`. Phase 2 follow-up
(separate commit, e2e-tested): persist `matchState` on the payout doc during sync. Amazon settlements,
eBay/Faire/Shopify payouts, Etsy finance → `available:false` with the registry reason (Etsy
`financial_ledger.read` is false). An operational match is never described as the accounting provider's
reconciliation (§6.2) — the renderer's wording is "matched with a bank line", never "reconciled".

#### get_integration_health (§11)

Input: `{ provider? }`. Output rows:

```js
{ provider, connectionId, account,                          // shop domain / store name / account label, never a token
  authStatus: "ok"|"reconnect_required"|"pending"|"disconnected"|"not_visible",
  ordersFreshness, inventoryFreshness, financeFreshness,    // { state, lastSuccessAt, lagMs } from healthView or the connection doc
  retries, deadLetters,                                     // healthView counters + commerceEvents status dead/retrying
  lastSuccessfulSync, reconnectRequired,
  mode: "read_only"|"limited"|"full",                       // commerce/capabilities + connectionCapabilities
  availability: "connected"|"supported_not_connected"|"not_available"|"not_supported" }
```

Loaders: `shopifyStores`, `etsyConnections`, `wooConnections`, `squareConnections` (root, where
companyId; only the fields their `publicView` helpers expose), `companies/{cid}/bankConnections` (banks +
PayPal; `syncState`, `lastSyncedAt`, `consentExpiresAt`), `accountingConnections` + Pandle, root
`commerceHealth` (`healthView(doc, provider, { now, staleAfterMs: 6h })`), `commerceCursors`
(Shopify reconcile only), `commerceEvents` dead/retrying counts. Etsy never writes `commerceHealth`, so its
freshness comes from `etsyConnections.lastSuccessAt` — pairing healthView with the connection doc is
mandatory or Etsy reports a false "never". Amazon: status lives in the `nivadesk-amazon` project and is
only readable as `amazon-caller@`, which `chatgptMcp` is not → row `authStatus:"not_visible"` with warning
`status_not_visible_from_this_surface` (future: a mirrored `companies/{cid}/amazonStatus` doc written by
the zone; spec-only). eBay: adapter + registry only, no runtime → `not_available`. Bank and accounting rows
are included only for contexts with the bankFeed area; commerce rows need the orders area.

#### get_accounting_sync_status (§11)

Input: `{}`. Output: `{ phase: "read_only", primaryWriter: { provider, connectionId } | null,
conflict: boolean, connections: [ { provider, mode, health, writeBoundaryDate, lastSyncAt } ],
postings: { prepared, approved, queued, synced, failed, conflict } each `{ value: 0, available: false,
reason: "postings_not_implemented" }` while `accountingPostings` is never written (Faz 3–7),
attention: [ { id, kind, severity, message, entityRefs } ], readiness: { ready, notReady: { uncategorised,
split, needsInfo, unreviewed } } }`. Readiness is per bank transaction using `pandle.js resolveMapping`
rules and `BANK_REVIEW_STATUSES`. The `phase` flag is what stops "0 failed" from reading as "all synced";
the renderer says "Ledger posting is not switched on yet; NivaDesk is preparing records only". The AI
never acts as the accountant (§39.7): no wording implies a filing or a formal reconciliation.

#### get_banking_attention_summary (§12)

Input: `{ fromDate?, toDate?, limit? }`. Output: `{ items: AttentionItem[] (grouped per type), counts:
{...}, connection: { syncState, lastSyncedAt, consentExpiresAt } }` with types `transaction_uncategorised`,
`receipt_missing`, `possible_duplicate`, `unusual_charge`, `recurring_price_changed`,
`possible_cancelled_subscription`, `possible_transfer`, `payout_unmatched`, `order_link_suggestion`.
Rules in `functions/bank/insights.js`, a pure port of `studioflow-web/lib/studioflow/bankInsights.ts`
(`detectPossibleDuplicates`, `detectRecurringSpends` with price change/active, `suggestOrderLink` /
`rankOrdersForTransaction`, `suggestCategory`) with a shared fixture test so the two copies agree, the
way `bank/classification.js` mirrors its client copies. Two rules have no source anywhere and are
defined here deterministically: `unusual_charge` = spend > 3× the vendor's median over the last 12 rows
and > £100; `possible_transfer` = an outgoing and an incoming row with equal absolute amount within 2 days
on different `accountId`s and no `incomingKind` already set to transfer. `nvLoadBankTransactions`'s
projection is extended (additively) with `receiptNotNeeded`, `categoryAuto`, `reviewStatus`, `accountId`,
`provider`, `settlement`, `linkedOrderId`, `splits`, which also fixes the known over-count in
`spendingWithoutReceipt` (rows marked receipt-not-needed).

### 2.6 Renderer (§13)

`render.summary(envelope, { style })` produces `summary.lines` in fixed slot order — result → breakdown →
finance/banking status → attention → next action — omitting empty slots. Style `chat` joins them into the
`content[0].text` of the MCP result (replacing the JSON dump that `nvMcpToolContentFromResult` emits for
the tools it has no summary for, but only for the new tools; existing tools' text is unchanged flag-off).
Style `compact` numbers items and truncates to the channel's `rendering.long_text` limit (WA §38) — the
same data, a different presentation; totals cannot differ between styles (§89 scenario 12, tested).
Every number in a line is copied from `data` (the test extracts numerals and checks membership).

## 3. Permission and PII rules per capability

Gates are the existing predicates, injected; the orchestrator never reads a role from arguments and
never loosens an app gate. `companyId` from the model/channel is never authorization (§23).

| Capability | Membership | Area / role gate | Plan | workflowOnly | PII emitted | Notes |
|------------|-----------|------------------|------|--------------|-------------|-------|
| get_business_attention_summary | uidHasCompanyAccess | orders area for order/shipping/inventory/integration sections; financialInfo for payments; bankFeed area for banking/payouts/accounting | none refused; `plan_limited` warning when bankFeedEnabled is false | only assigned orders; no money/banking sections | none (titles use order number/design/channel, never the customer) | sections not permitted are named, not filled |
| get_commerce_overview | same | `nvRoleCanAccessFinancialInfo` (owner true; custom roles by access.financialInfo; viewOnly/workflowOnly false) | basic vs advanced shape (`nvChatGPTHasAdvancedFinance`) | refused (no financial access) | none | |
| search_commerce_orders | same | `nvRequireOrdersArea`; money fields only with financialInfo | — | assignedToUid filter | name, email via `redactForChannel(order,"assistant")`; `recordPiiAccess` categories [name,email] | Amazon/eBay/unknown provider rows return `customer.restricted:true`; no reveal grant on this surface |
| get_channel_performance | same | financialInfo | advanced only; basic → `plan_limited` with counts/gross only | refused | none | |
| get_inventory_overview, search_inventory | same | `nvRequireInventoryAccess` (owner, or orders area + canFullyEditOrder) — kept as the existing MCP gate; it is stricter than the app's read gate (orders area) and is documented as such; loosening is an owner decision, not a side effect | — | refused unless canFullyEditOrder | none (supplierName is a business, not a person) | |
| get_payout_reconciliation_overview | same | `nvRequireBankFeedAccess` (owner or bankFeed area) | no refusal for reads; `plan_limited` warning | refused | none | confirm/unlink stay owner-only and are not exposed |
| get_integration_health | same | orders area for commerce rows; bankFeed area for bank/accounting rows; owner all | — | commerce rows only | none; `account` is a shop domain/store label; tokens never loaded (loaders read the `publicView` fields only) | |
| get_accounting_sync_status | same | the exact `requireReader` predicate exported from accountingFunctions.js (owner OR memberAccess[uid].bankFeed) — reused, not re-derived, so it cannot be looser | — | refused | none | |
| get_banking_attention_summary | same | `nvRequireBankFeedAccess` | `plan_limited` warning | refused | none (merchant names are businesses) | order_link_suggestion refs carry order ids, not customers |

Why bank reads are not plan-refused: the plan gates live sync and connection (`bankFeed.js requireOwner`),
the existing three bank tools gate on role only, and the OpenAI review workspace has `bankFeedEnabled:false`
with seeded demo rows; refusing reads would break the reviewer's banking test cases and diverge from the
19. The plan state is surfaced as a warning instead.

PII rules (§22, memory "amazon-pii-isolation-layer", "told which order, asks before who"):

1. Redaction happens once, in `loaders.js`, at the read of `siparisler`, with
   `privacy/outbound.redactForChannel(order, "assistant")`; pure modules never see raw buyer fields.
   `loaders.js` is the only file under `functions/orchestrator/` allowed to read `siparisler`, and a test
   enforces both facts (§5.6).
2. `companies/{cid}/restrictedCustomer` is never read by any orchestrator module (grep-enforced), and no
   reveal-grant callable is on the MCP path in this phase; the row says `restricted:true` and the renderer
   says "the buyer details for this Amazon order are held separately" — it names the order, not the
   person.
3. Attention items, overviews, health rows and payout rows contain no person fields by construction;
   the outbound-pii call-graph guard is extended from `function nvChatGPT*` bodies to
   `functions/orchestrator/**` so any module that emits `customerName`/`emailAddress`/`phone`/`address`
   fails the test unless the value came through the loader.
4. Channel profile redaction (§65, §72, WA §93.22–23): `ctx.channel.profile.security.pii_level:"none"`
   strips `customer` even for allowed providers; `financial_data_allowed:false` strips `totals`, money
   facts and the whole finance/banking sections (group chats default to both). This is applied inside
   `envelope.finish`, so a channel cannot forget it.
5. `recordPiiAccess` source is the channel type (`mcp`, `rest`, `whatsapp`), never a phone number or
   display name (§68, §85.1); the audit record (§86) never contains arguments, result bodies or tokens.
6. No secrets in any argument or result (§22): loaders read connection docs through the same field
   projections as the app's `publicView` helpers; a test asserts no orchestrator output key matches
   `/token|secret|refresh|access_key|password/i`.

## 4. WhatsApp reuse contract (what the gateway needs, §62–§92, WA §7–§47)

The WhatsApp gateway is a later function (CH-2+). It must be able to be written without touching any
module in this document except to call it. What `functions/orchestrator/index.js` guarantees:

1. **Registry as the capability source** (WA §14, §81): `listCapabilities({ flags, channelProfile })`
   returns the registry projection filtered by flag and by the profile's `capabilities` (read /
   internal_write / external_write / file_upload / …) and `security.assurance_level ≥ minAssurance`.
   MCP tools/list is the `mcp` projection of the same table; WhatsApp gets the `whatsapp` projection. No
   WhatsApp-specific tool set exists (§81).
2. **Context resolution per request** (§69, WA §13): the gateway resolves binding → user, then calls
   `resolveContext({ uid, companyId, companyData, channel })`; the orchestrator re-checks membership,
   role, areas and entitlements on every call. Cached role snapshots are the gateway's optimisation only.
   A revoked permission takes effect on the next request (WA scenario 3).
3. **Same handler, same semantics** (WA §69–§70, §87): `run("update_order_status", …)` from WhatsApp
   executes the same transition logic, validation, permission check, audit and idempotency as from
   ChatGPT; the registry's annotations describe that shared handler, so a tool cannot be read-only on MCP
   and mutate from WhatsApp. Existing write handlers are adapted behind `run()` in CH-4, not duplicated.
4. **Envelope, not presentation** (§65, §82, §89): `run()` returns the §2.3 envelope; the gateway renders
   `summary.lines` with `render.summary(envelope, { style: "compact" })` (numbered list, WA §38) or its own
   renderer over `data`. Totals and states come from `data` and cannot differ from ChatGPT's answer.
5. **Attention Engine as shared source** (WA §27–§28, §68): the daily briefing and the on-demand summary
   call `attention.collect(snapshot, ctx, { horizonDays: 2 })`; integration health calls
   `run("get_integration_health")`. Same ids, same severities, same dedupe.
6. **Request metadata and idempotency hooks** (WA §42–§43, §85.7–8): `run()` accepts `request.{requestId,
   channelType, providerMessageId, providerConversationId, idempotencyKey}`; the gateway dedupes inbound
   events on `provider + providerMessageId` before calling; write capabilities (CH-4) use
   `idempotencyKey` so a duplicate delivery yields no second note/status/attachment.
7. **Audit sink** (§86): every `run()` emits the §2.4 record through the injected `audit` dependency;
   the gateway supplies `binding_id`, `group_id`, `provider_*` and later `response_message_id`.
8. **Ambiguity is a result, not a guess** (WA §65, §89 scenario 2): capabilities that resolve an entity
   from text (`search_commerce_orders` with `query`, order-financials style lookups) return `state:
   "needs_attention"` with `data.choices[]` when more than one entity matches; the gateway shows choices.
   Cross-workspace ambiguity is never resolved silently (context carries one `companyId`).
9. **Reserved interfaces (not implemented in this phase; signatures fixed so CH-3/CH-4 do not change
   the contract):**
   - `continuation.get/set(ctx, { activeWorkspaceId, lastSearchResultIds[], lastOpenedEntity,
     pendingProposalId, pendingFileMatchId, paginationCursor, expiresAt })` — UX state, never truth (WA §40–§41).
   - `pendingFileMatch.create/select(ctx, { id, workspaceId, userId, channelBindingId, fileAssetId,
     documentType, extractedMerchant, extractedAmount, extractedDate, candidateTransactionIds[], confidence,
     state, expiresAt })` — the channel-agnostic continuation of `attach_bank_receipt`'s
     candidates step: the file already stored under `bank_receipts/_inbox` is the `fileAssetId`, "2" or
     "the Cousins one" selects a candidate, the candidate is re-read before `assignInboxReceipt`, and the
     user is never asked to upload again (§6.1, §74, WA §22–§23).
   - `proposals.prepare/approve/revalidate/execute(ctx, ActionProposal)` with the WA §45 fields and the
     WA §44 state machine; allowlisted typed `actionType`s only (§48); revalidation on approval invalidates
     a proposal whose `beforeState` no longer matches (WA §47); an ambiguous "yes" never approves a
     class-D/E action (§85.15).
10. **No double counting across channels** (WA §90): the same `commerce.js` and `payouts.js` produce the
    figures; there is no WhatsApp-side arithmetic.

If adding WhatsApp requires changing anything in `commerce.js`, `attention.js`, `payouts.js` or the
gates, the abstraction is wrong (WA §71) and the fix goes into the orchestrator, not the channel.

## 5. Test plan

Conventions: `test/qa/*.test.js` are plain node scripts with hand-built snapshots (no `where()`, no
undefined values); `npm test` stops at the first failure; e2e under `test/e2e/*.test.js` via
`test/run-e2e.sh` inside `firebase emulators:exec --only firestore,storage --project demo-nivadesk-ci`
after confirming nothing listens on 8080/9199. Tests assert the spec's contract, never a copy of the
implementation (memory: "tests that assert the bug").

### 5.1 Registry and annotations (§19)

`test/qa/mcp-registry-annotations.test.js`
- For every flag combination (`{}`, `{inventory}`, `{orchestrator}`, both): each published entry has
  exactly the four hints, each `typeof === "boolean"`; a regex over `registry.js` source proves each hint
  is a literal `true`/`false` token (not an expression, not `null`); four non-empty `justification` lines
  each beginning with "Because"; non-empty `scopes` ⊆ `scopes_supported`; `riskClass` ∈ A–E;
  `minAssurance` ∈ 1–3; `permission` present.
- `assertRegistry()` throws on a mutated copy with `readOnlyHint: null`, a missing justification, an
  unknown scope.
- No entry named like an internal/test action; every published name has a `case` in the dispatcher
  (kept from `mcp-permissions`); no name outside the registry appears in `nvMcpOrderToolSchemas()`.
- The served `annotations` for every tool deep-equal `annotationsFor(name)`.

### 5.2 tools/list snapshot (§20, byte-identical rule)

`test/qa/mcp-tools-list-snapshot.test.js` with fixtures under `test/fixtures/mcp/`:
- `tools-list.flag-off.json` = the exact `nvMcpToolsWithSecuritySchemes()` output today (19 tools, names,
  order, descriptions, input schemas, annotations, `securitySchemes`, `_meta`) — recorded from the current
  code before any change and compared with `JSON.stringify` equality, so the frozen list cannot drift by a
  character.
- `tools-list.inventory.json`, `tools-list.orchestrator.json`, `tools-list.all.json` for the flag-on
  projections (order: 19, then inventory, then orchestrator).
- `initialize.instructions` mentions every domain present in the served list for that flag state.
- Flags are read in-process through `publishedNames(flags)`, so `mcp-inventory.test.js` is rewritten to
  the same mechanism and its source-slicing of `nvMcpOrderToolSchemas` is dropped in the same commit.

### 5.3 Parity for the existing 19 (§2, §29)

`test/qa/mcp-parity.test.js` — with the flag off, the dispatcher's results for each of the 19 over the
existing fake-Firestore harness (`mcp-permissions.test.js` style) equal fixtures recorded before this
change; with the flag on, results are a strict superset (only `freshness`, `partial`, `warnings` added).
Role matrix (owner / admin / member without bankFeed / viewOnly / workflowOnly / custom role with
financialInfo) for the finance stripping and the Orders switch, kept from `mcp-permissions`.

### 5.4 Behaviour tests that decide the annotation values (§17 "verify", §29) — emulator e2e

`test/e2e/mcp-annotation-behaviour-emulator.test.js` (Firestore + Storage emulators, no network):
- `update_order_status` twice with the same status → one history entry, identical document after call 2
  (except `updatedAt`); with a different status → new entry. Same for `update_note`, `pin_note`,
  `archive_note`.
- `add_order_note` / `append_note` twice → text contains the line twice (non-idempotent, additive).
- `create_order` / `create_note` twice → two documents.
- `attach_bank_receipt` internals (the handler's network fetch is not called): `assignInboxReceipt` on a
  transaction with an existing `receiptPath` → old object gone, new path set (destructive true); second
  `assignInboxReceipt` with the same `inboxPath` → throws (idempotent false); `queueInboxReceipt` keeps the
  file when nothing matches (§6.2 "file never lost"); single strong candidate assigns, two close candidates
  return both, permission denied for a non-owner.
- A trigger scan: after `update_order_status` no `smsMessages`/outbound document is created (keeps
  `openWorldHint:false` honest).

### 5.5 Orchestrator units (one file per capability, fake snapshots)

- `orchestrator-context.test.js` — permission matrix (role × capability) using the predicates exported
  from index.js; model-supplied `companyId` ignored; suspended member refused; workflowOnly sees only
  assigned orders; channel profile group mode strips money and customer.
- `orchestrator-envelope.test.js` — required keys; state vocabulary closed; `queued`/`executing` never
  rendered as completed; warning codes closed list; stale source → stale line; partial → exclusion line.
- `orchestrator-channel.test.js` — `channelOf` precedence and identity preservation (amazon/ebay never
  remapped; Shopify legacy `customFields.Source` resolved; inbound; chatgpt-created = manual); vocabulary
  matches `dashboard-channels.test.js`.
- `orchestrator-attention.test.js` — each detector on a fixture; an order that is overdue + shipping
  waiting + unpaid is ONE item with three reasons; 8 missing receipts are ONE item with count 8 and the
  summed amount; deterministic `attentionId`; severity map; sections not permitted are named and empty;
  horizon parameter.
- `orchestrator-commerce.test.js` — the triple-count fixture (order £100, payout £95, bank deposit £95 →
  gross 100, settlement 95, 290 absent); refunds separate from gross; known vs estimated fees; discounts
  `available:false`; absent channel rows carry no numbers; UTC inclusive range; basic vs advanced shape;
  stamped `order.finance` used when current, `computeOrderFinance` otherwise (fixture with a stale
  `engineVersion`).
- `orchestrator-search-commerce.test.js` — every §33.6 field separate; provider status ≠ workflow status;
  filters; Amazon row `restricted:true`; `choices[]` on ambiguous query; limit.
- `orchestrator-channel-performance.test.js` — profit definite only at full cost coverage, estimated with
  coverage, unavailable at zero; AOV; faire `not_supported`.
- `orchestrator-inventory.test.js` — `inventoryMetrics.summarize` equals the numbers the existing
  `getInventorySummary`/`getInventoryReport` closures produce on the same fixture (parity before the
  callables switch to the module); unsupported channel keys; `search_inventory` new filters; SKU is not
  identity (two items, same SKU, both returned).
- `orchestrator-payouts.test.js` — matched/partial/unmatched; needsReview from candidate count;
  truncation warning; unmatched amounts never appear in any revenue figure; provider rows for absent
  providers.
- `orchestrator-integration-health.test.js` — Etsy freshness from the connection doc, not from
  healthView "never"; Amazon `not_visible`; eBay `not_available`; reconnect flags per provider status
  vocabulary; stale threshold; no token-like keys in any row.
- `orchestrator-accounting.test.js` — `phase:"read_only"`, postings `available:false`; primary writer and
  conflict; readiness reasons from Pandle mapping rules; open attention items.
- `bank-insights.test.js` — duplicates, recurring price change, cancelled subscription, transfer,
  unusual charge thresholds, order link ranking; shared fixture with the web copy
  (`studioflow-web/lib/studioflow/bankInsights.ts`) so the two implementations agree.
- `orchestrator-render.test.js` — slot order; every numeral in `summary.lines` exists in `data`;
  stale/partial wording; chat vs compact styles give identical totals.

### 5.6 PII and secrets guards

- Extend `test/qa/outbound-pii-policy.test.js`: the call-graph scan covers `functions/orchestrator/**`;
  any function emitting `customerName|emailAddress|phone|address|customer` must be fed by `loaders.js`;
  `loaders.js` is the only orchestrator file reading `siparisler` and calls `redactForChannel` before
  returning; no orchestrator file mentions `restrictedCustomer`.
- Extend `test/qa/access-control-policy.test.js`: `functions/orchestrator/**` never requires
  `commerce/adapters/amazon` or `functions-amazon`.
- `orchestrator-no-secrets.test.js`: run every capability on a snapshot whose connection docs contain
  token-like fields; assert no output key or string value matches `/token|secret|refresh|password/i`.

### 5.7 Guide

`guide-corpus-fresh.test.js` (unchanged: rebuild must match), `guide-platform-tags.test.js`, and new
questions in `guide-retrieval.test.js` ("what can ChatGPT see", "ChatGPT'de neleri sorabilirim",
"attach receipt from ChatGPT") that must retrieve the ChatGPT chapter.

### 5.8 Submission-time checks (§20, §30) — manual, operator

`node functions/scripts/mcp-tools-report.js --compare https://mcp.nivadesk.app/chatgptMcp` (read-only
GET) must print zero differences between the deployed list and the registry projection for the flag
state that was deployed; the markdown it prints is pasted into the release notes.
`test/e2e/chatgpt-oauth-http.mjs` stays manual (needs the functions emulator; not globbed by
`run-e2e.sh`) and gains a tools/list assertion against the snapshot fixture for the flag state under test.

## 6. Guide entries (EN + TR)

Guide rule (memory "guide-bot-explain-rule"): `para` = what it is for (public), `bullets` = how (members),
in `studioflow-web/lib/publicSite/guide.ts` `TREE_EN` and `TREE_TR` with the same section id; then
`node functions/assistant/buildGuideCorpus.js`, commit `guideCorpus.json`, `guidePublicCorpus.json`,
`guideTree.json`; the seven assistant functions are deployed by the operator, followed by a live-bot probe.

Two-step landing so the bot never describes a tool that is not live:

**Step A (can land now — describes the 19 that are live):** a new section `chatgpt-app` ("NivaDesk in
ChatGPT") in the Settings/Integrations chapter. The four existing bullets under `set-client-domain`'s sub
"The NivaDesk app for ChatGPT" move into it unchanged (a one-line pointer stays in place), so nothing is
lost.

EN
```
{ id: "chatgpt-app", title: "NivaDesk in ChatGPT", blocks: [
  { kind: "para", items: [
    "NivaDesk has an app inside ChatGPT. Once you connect your workspace you can ask about it in plain language — what is overdue, what a customer ordered before, how a month went — and ChatGPT answers from your own records, in the role you have in NivaDesk.",
    "It works on the same orders, notes, finance and banking data you see in the app. It cannot see another workspace, and it never talks to your shops or your bank directly: everything comes through NivaDesk."
  ] },
  { kind: "sub", text: "Connecting" },
  { kind: "bullets", items: [
    "In ChatGPT open the apps list, choose NivaDesk and sign in with the NivaDesk account you already use. You pick the workspace on the NivaDesk consent page; ChatGPT never sees your password.",
    "Owners can see and end ChatGPT connections under Settings ▸ Account; connecting again from the same account replaces the earlier connection."
  ] },
  { kind: "sub", text: "What you can ask" },
  { kind: "bullets", items: [
    "Orders: find orders by customer, reference, design name or status; open one; add a note; change its status or design status; create a new order. Workflow-only members see only the orders assigned to them, and money fields are hidden from roles without the Financial permission.",
    "Notes: create, search, open, append to, edit, pin and archive your own personal notes. Team notes are not changed from ChatGPT.",
    "Finance and dashboard: an order's financials, the dashboard summary, the financial overview and extra spending for a month, year or date range — on the Starter plan in the basic shape, on Pro and Team with profit and remaining balances.",
    "Banking: monthly spending by category and merchant, recurring costs, search of bank transactions, and receipts — send a receipt or invoice photo and NivaDesk matches it to the bank line; if several lines could fit it asks which; if the payment has not arrived yet the receipt waits under Banking ▸ Receipts and is matched when it does. Attaching receipts is for the workspace owner."
  ] },
  { kind: "sub", text: "What it will not do" },
  { kind: "bullets", items: [
    "It does not change anything in Shopify, Etsy, WooCommerce, Square, Amazon or eBay, and it does not send messages to your customers. Those stay in the app.",
    "When a figure depends on a shop or bank sync that is behind, the answer says so instead of presenting old numbers as live."
  ] }
] }
```

TR
```
{ id: "chatgpt-app", title: "ChatGPT'de NivaDesk", blocks: [
  { kind: "para", items: [
    "NivaDesk'in ChatGPT içinde bir uygulaması var. Çalışma alanınızı bağladıktan sonra onu gündelik dille sorabilirsiniz — ne gecikmiş, bir müşteri daha önce ne sipariş etmiş, bir ay nasıl geçmiş — ve ChatGPT NivaDesk'teki rolünüzle kendi kayıtlarınızdan yanıtlar.",
    "Uygulamada gördüğünüz sipariş, not, finans ve banka verisinin aynısı üzerinde çalışır. Başka bir çalışma alanını göremez; mağazalarınızla ya da bankanızla doğrudan konuşmaz, her şey NivaDesk üzerinden gelir."
  ] },
  { kind: "sub", text: "Bağlama" },
  { kind: "bullets", items: [
    "ChatGPT'de uygulama listesini açın, NivaDesk'i seçin ve zaten kullandığınız NivaDesk hesabıyla giriş yapın. Çalışma alanını NivaDesk onay sayfasında siz seçersiniz; ChatGPT parolanızı asla görmez.",
    "Sahipler ChatGPT bağlantılarını Settings ▸ Account altında görüp sonlandırabilir; aynı hesaptan yeniden bağlanmak önceki bağlantının yerine geçer."
  ] },
  { kind: "sub", text: "Neler sorabilirsiniz" },
  { kind: "bullets", items: [
    "Siparişler: müşteri, referans, tasarım adı ya da duruma göre sipariş bulma; birini açma; not ekleme; durumunu veya tasarım durumunu değiştirme; yeni sipariş oluşturma. Yalnızca iş akışı üyeleri sadece kendilerine atanan siparişleri görür; Financial izni olmayan rollerden para alanları gizlenir.",
    "Notlar: kendi kişisel notlarınızı oluşturma, arama, açma, sonuna ekleme, düzenleme, sabitleme ve arşivleme. Ekip notları ChatGPT'den değiştirilmez.",
    "Finans ve pano: bir siparişin finansı, pano özeti, finansal genel bakış ve bir ay, yıl ya da tarih aralığı için ek harcamalar — Starter planda temel biçimde, Pro ve Team'de kâr ve kalan bakiyelerle.",
    "Banka: kategori ve satıcıya göre aylık harcama, tekrarlayan giderler, banka hareketlerinde arama ve fişler — bir fiş ya da fatura fotoğrafı gönderin, NivaDesk onu banka satırıyla eşleştirir; birden fazla satır uyuyorsa hangisi olduğunu sorar; ödeme henüz gelmediyse fiş Banking ▸ Receipts altında bekler ve geldiğinde eşlenir. Fiş ekleme çalışma alanı sahibine özeldir."
  ] },
  { kind: "sub", text: "Yapmayacakları" },
  { kind: "bullets", items: [
    "Shopify, Etsy, WooCommerce, Square, Amazon ya da eBay'de hiçbir şeyi değiştirmez ve müşterilerinize mesaj göndermez. Bunlar uygulamada kalır.",
    "Bir rakam geride kalmış bir mağaza ya da banka senkronuna bağlıysa yanıt bunu söyler; eski sayıları canlıymış gibi sunmaz."
  ] }
] }
```

**Step B (lands in the same commit that flips `NIVADESK_MCP_ORCHESTRATOR` / `NIVADESK_MCP_INVENTORY`):**
add to `chatgpt-app` under "What you can ask":

EN
```
"Across your channels: how many orders this month and where they came from (Shopify, Etsy, WooCommerce, Square, manual); the sales, refunds and known platform fees of each channel; payouts and whether they have been matched with a bank line; orders that need attention because a shop shows them shipped while NivaDesk is still waiting. Channels you have not connected are named as not connected, never counted as zero.",
"What needs attention today: overdue and due-soon orders, approvals and shipments waiting, low stock, receipts missing, uncategorised bank lines, unmatched payouts, connections that need reconnecting — one list, each item once, with the sync time behind it.",
"Connections and bookkeeping: whether each shop, bank and accounting connection is healthy and when it last synced; what is prepared for Pandle, Xero or QuickBooks and why a record is not ready yet. NivaDesk prepares; your accountant decides.",
"Inventory: stock overview, low-stock items and reserved items; search by name, SKU, serial, location or status; add an item from a photo after you confirm what it is."
```

TR
```
"Kanallarınız genelinde: bu ay kaç sipariş geldi ve nereden (Shopify, Etsy, WooCommerce, Square, elle); her kanalın satışı, iadeleri ve bilinen platform ücretleri; ödemeler (payout) ve banka satırıyla eşlenip eşlenmediği; mağaza gönderildi derken NivaDesk'in hâlâ beklediği siparişler. Bağlamadığınız kanallar bağlı değil diye söylenir, asla sıfır sayılmaz.",
"Bugün nelere bakılmalı: gecikmiş ve yaklaşan siparişler, bekleyen onaylar ve gönderiler, düşük stok, eksik fişler, kategorisiz banka satırları, eşlenmemiş ödemeler, yeniden bağlanması gereken bağlantılar — tek liste, her madde bir kez, arkasında senkron zamanıyla.",
"Bağlantılar ve defter: her mağaza, banka ve muhasebe bağlantısının sağlıklı olup olmadığı ve en son ne zaman senkronlandığı; Pandle, Xero ya da QuickBooks için nelerin hazırlandığı ve bir kaydın neden henüz hazır olmadığı. NivaDesk hazırlar; kararı muhasebeciniz verir.",
"Envanter: stok özeti, düşük stoklu ve rezerve ürünler; ad, SKU, seri, konum ya da duruma göre arama; ne olduğunu onayladıktan sonra fotoğraftan ürün ekleme."
```

Both steps: rebuild the corpus, run the three guide tests, and add retrieval questions (§5.7). The
public marketing copy (`translations.ts aiPage.*`) is not part of the guide rule and is left to the
operator.

## 7. OpenAI submission 1.2.0

History: 1.0.0 published; 1.1.0 rejected (test-case customer name + annotations); 1.1.1 submitted 22 Aug
after commit 68222996 and rejected on the annotation/justification wording (§1). 1.2.0 is the next
version and the annotation justification is its release blocker.

### What changes

1. **Annotations**: values stay as live (they match runtime — §1.2), but they now come from one registry
   with literal booleans, are asserted at load (no coercion), and every tool carries four "Because…"
   lines. The release notes carry the full §1.3 text, the definitions in §1.1, and an explicit answer to
   the 1.1.1 message: "every hint is a literal boolean in source and on the wire; the deployed list was
   diffed against the registry; the two `verify` cases OpenAI could not see (`update_*` idempotency and
   `attach_bank_receipt` retry) are decided by the emulator behaviour tests in §5.4".
2. **Runtime**: `update_order_status` / `update_note` no-op guard (§1.4.8) so `idempotentHint:true` is
   true under the strict definition; `create_inventory_item` scope corrected to `orders.write`.
3. **Discovery text**: serverInfo version `1.2.0`; initialize `instructions` covering every exposed domain
   and the read/write and provider boundaries (§21).
4. **Descriptions of new tools** follow §21 (what, when, read/write boundary, provider boundary; the
   cross-channel search uses the §21 model sentence "…does not modify an external provider").
5. **Tools exposed** — decided by the operator at flip time, and only via flags:
   `NIVADESK_MCP_EMAIL_RECEIPTS=1` (receiptUrl/emailReceipt inputs on `attach_bank_receipt`),
   `NIVADESK_MCP_INVENTORY=1` (2 tools), `NIVADESK_MCP_ORCHESTRATOR=1` (9 tools). The list OpenAI reviews
   is whichever projection was deployed, and `mcp-tools-report.js --compare` proves it. Recommended: all
   three on, one submission, so the reviewer sees the finished 30-tool surface once.
6. **Test cases**: the five 1.1.1 cases re-run on the review account (customer exactly "OpenAI Review Test
   Customer"; ESET row `demo-acc_demo006` reset to no receipt); new cases for `get_business_attention_summary`,
   `get_commerce_overview`, `get_integration_health` on the review workspace (manual orders only → channel
   rows `not connected`, health rows for the demo bank connection), so the reviewer sees honest degrade.
7. **Guide** Step A + Step B and the corpus rebuild ship with the same deploy.

### What stays

- The 19 tool names, order, input schemas, descriptions and annotation values (pinned by the snapshot
  test; byte-identical with flags off).
- The `attach_bank_receipt` flow (§6.1): single strong match attaches; several return candidates +
  `inboxPath`; second call with `transactionId` + `inboxPath` and no re-upload; no match with amount →
  queued; owner-only; SSRF-guarded fetch; `_meta["openai/fileParams"]:["receipt"]`.
- Orders/Notes/Finance behaviour and gates (workflowOnly/viewOnly finance stripping, Orders switch,
  hidden tools not dispatchable).
- OAuth and discovery surface: `mcp.nivadesk.app`, `.well-known` routes, DCR-only, PKCE, redirect-URI
  registry, 401 challenge with `scope="orders.read notes.read finance.read"` (no new scope names), 405 on
  SSE GET, 202 on notifications, the `openai-apps-challenge` file.
- The review workspace, its connection/token and demo rows; the production flag values until the
  operator flips them.
- PII policy: no path returns customer fields outside `redactForChannel`; `restrictedCustomer` never
  serialised; Amazon/eBay only as canonical records with `order_source` preserved.
- No per-provider or per-agent tools (§10, §48); no generic action tool (§57); no external write from
  ChatGPT in this version (Phase 5 territory).

## 8. Open decisions for the operator

1. Approve the `update_order_status` / `update_note` no-op guard (the only behaviour change to an
   existing tool). Alternative: keep the history entry and change the justification to say so — weaker
   against the reviewer's wording.
2. Flip order for 1.2.0: all three flags together (recommended) or inventory + email first.
3. Persist `matchState` on payout docs during settlement sync (Phase 2) so `needsReview` is not
   recomputed per request.
4. Mirror Amazon connection status into the main project so `get_integration_health` can show it; until
   then the row says `not_visible`.
5. Whether `get_inventory_overview` should use the app's looser read gate (orders area) instead of the
   MCP's existing `canFullyEditOrder` requirement.
6. Moving the four ChatGPT bullets out of `set-client-domain` into the new `chatgpt-app` section.
