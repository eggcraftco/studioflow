# The Niva Orchestrator — module contract for a second channel

Status: contract, 6 Sep 2026. Branch `mcp-orchestration`, worktree `/Users/gocmen/Developer/studioflow-mcp`.
Audience: whoever writes the WhatsApp gateway (WhatsApp spec `NivaDesk_WhatsApp_AI_Channel_Implementation_Spec_2026-09-05.md`,
cited as WA §n) or any later channel — a voice adapter, a REST surface, a second AI client (WA §72–§74).
Design rationale lives in `docs/mcp-orchestration-design.md` §2 and §4; this document is the interface.

**The code is the source of truth and this document is pinned to it.**
`functions/test/qa/orchestrator-contract.test.js` fails if a function named here stops existing, if a
capability appears that is not described here, or if one of the reserved interfaces below is implemented
without this page being rewritten. A contract nobody checks is a comment.

---

## 0. The rule the whole thing exists for

> One NivaDesk. One business truth. One orchestrator. Many trusted channels. (WA §85)

The channel owns the transport, the identity binding, the rendering and the conversation. It owns **no
business rule**. Totals, permissions, freshness, PII policy, attention detection and the answer's shape
are the orchestrator's, so that ChatGPT and WhatsApp cannot give a user two different answers to
"how did this month go".

If adding WhatsApp requires an edit inside `commerce.js`, `attention.js`, `payouts.js`, `money.js` or a
gate, the abstraction is wrong (WA §71) and the fix belongs in the orchestrator, not in the channel.

---

## 1. Module map

```
functions/orchestrator/
  index.js            createOrchestrator(deps) — the only entry point a channel uses
  registry.js         the tool/capability table: flags, scopes, permissions, annotations, channel policy
  context.js          who is asking, and what that lets them see
  loaders.js          the ONLY module that touches Firestore, and only to read
  envelope.js         the one result shape (§13/§14 of the orchestration spec)
  freshness.js        per-source sync age, and the honest null
  render.js           envelope → summary lines, in chat or compact style
  commerce.js  attention.js  inventory.js  inventoryMetrics.js  payouts.js
  integrationHealth.js  accountingStatus.js  orderView.js  money.js  channel.js
                      the capabilities themselves: snapshot in, data out, no I/O
```

Import rules, enforced by `test/qa/orchestrator-purity.test.js`:

- Only `loaders.js` may reach Firestore. Everything else is snapshot-in / data-out, which is why the
  capabilities can be tested with hand-built fixtures and why a channel can call them from anywhere.
- No orchestrator module imports a **writer** (`openAttention`, `resolveAttention`, `recordAudit`,
  `settlementMatch`). A read capability that bumps a document on every call is exactly the annotation
  mismatch OpenAI rejected 1.1.1 over.
- A channel must import `functions/orchestrator/…` only. Reaching around it into `commerce/`,
  `bankFeed.js` or `finance/` from a gateway is how a second, looser copy of the rules gets born.

---

## 2. Building an instance — `createOrchestrator(deps)`

`require("./orchestrator").createOrchestrator(deps)` returns
`{ resolveContext, listCapabilities, run, loaders, flags }`. Build it once at module load, like the MCP
adapter does (`functions/index.js`, `nvOrchestrator`).

| dep | type | required | what it is |
|-----|------|----------|------------|
| `db` | `() => admin.firestore()` | yes (unless `loaders` is supplied) | a getter, not an instance, so nothing is initialised at load |
| `now` | `() => number` | no | epoch ms; injected in tests |
| `flags` | `{ emailReceipts, inventory, orchestrator }` | yes | booleans. `registry.flagsFromEnv(process.env)` reads the three `NIVADESK_MCP_*` variables |
| `uidHasCompanyAccess` | `(companyData, uid) => boolean` | yes | the app's own membership predicate, honouring `suspendedMembers` |
| `uidIsCompanyOwner` | `(companyData, uid) => boolean` | yes | |
| `uidCanAccessWorkspaceArea` | `(companyData, uid, area) => boolean` | yes | `orders`, `dashboard`, `customers`, `bankFeed` |
| `workspaceMemberRole` | `(companyData, uid, fallback) => string` | yes | the app's role RESOLVER — it follows `memberCustomRoles` into `customRoles` and returns that role's `baseRole`. Without it `resolveContext` refuses: a re-derived role reads a custom-role workflow-only member as a plain `member` and opens payments, banking and payouts to them |
| `normalizeWorkspaceRole` | `(value, fallback) => string` | no | applied on top of the resolver's answer, to keep the value in the app's vocabulary |
| `billingEntitlementsForCompany` | `(companyData) => object` | yes | plan gates; never re-derived here |
| `roleCanAccessFinancialInfo` | `(companyData, uid) => boolean` | yes | |
| `accountingReaderCanRead` | `(companyData, uid) => boolean` | no | defaults to owner-only |
| `inventoryAccessAllowed` | `(companyData, uid) => boolean` | no | defaults to owner-only |
| `recordPiiAccess` | `(row) => Promise` | **yes for WhatsApp** | see §5.4 — MCP deliberately does not inject it |
| `audit` | `(record) => Promise` | recommended | see §5.5 |
| `loaders` | `{ loadCompany, snapshotFor }` | no | tests inject fixtures; production leaves it out and `createOrchestrator` builds `loaders.createLoaders({ db, now })` itself |

Every predicate is **the app's own function, injected**. Nothing in the orchestrator re-implements a
permission rule: if an owner unticks Banking for somebody, the assistant loses it in the same instant,
because the assistant asks the same question the screen asks.

```js
// functions/whatsapp/gateway.js (sketch — CH-2)
const { createOrchestrator } = require("../orchestrator");
const registry = require("../orchestrator/registry");
const render = require("../orchestrator/render");

const nivaOrchestrator = createOrchestrator({
  db: () => admin.firestore(),
  flags: registry.flagsFromEnv(process.env),
  uidHasCompanyAccess, uidIsCompanyOwner, uidCanAccessWorkspaceArea,
  workspaceMemberRole, normalizeWorkspaceRole, billingEntitlementsForCompany,
  roleCanAccessFinancialInfo: nvRoleCanAccessFinancialInfo,
  accountingReaderCanRead: (c, uid) => nvAccountingAccess.accountingReaderCanRead(c, uid, { uidIsCompanyOwner }),
  inventoryAccessAllowed: (c, uid) => { try { return nvRequireInventoryAccess({ companyData: c, uid }) === true; } catch { return false; } },
  recordPiiAccess,          // WhatsApp has no MCP dispatcher, so it injects the hook itself
  audit: writeAssistantAudit
});
```

---

## 3. Who is asking — `resolveContext(input, overrides?)`

```js
const ctx = await nivaOrchestrator.resolveContext({
  uid,                       // string, required — the NivaDesk user the binding resolved to
  companyId,                 // string, required — a LOOKUP KEY, never a grant
  authType: "whatsapp_binding",
  scope: "",                 // OAuth scopes where the channel has them; "" means "not scope-limited"
  email: "",                 // for the audit row only
  channel: {                 // §4.1
    type: "whatsapp",        // "mcp" | "rest" | "whatsapp" | "app"; unknown values fall back to "mcp"
    bindingId: "cb_123",
    isGroup: false,
    profile: bindingProfile  // §4.1; null for a 1:1 binding with no extra limits
  }
});
```

Returns the context every capability is handed: `uid`, `email`, `companyId`, `companyData`, `authType`,
`role`, `isOwner`, `areas{orders,dashboard,customers,bankFeed}`, `financialInfo`, `accountingReader`,
`inventoryAccess`, `entitlements`, `workflowOnly`, `assignedOnly`, `scope[]`, `settings`, `channel`.

Three rules the gateway cannot opt out of:

1. **The company document is read for this request.** `resolveContext` calls `loadCompany` every time.
   A gateway that caches a role snapshot keeps serving somebody whose access was revoked a minute ago
   (WA §13: a cached role may be an optimisation, never the authority). The `overrides` argument exists
   for exactly one case — a caller that already read the document *in this same request* passes its own
   `loadCompany` to avoid a second round trip. It must not be used to hand over a cache that outlives
   the request.
2. **`companyId` is a lookup key.** Membership is checked on the resolved document before anything is
   read, so a model or a message that names another workspace gets `permission-denied`, not data.
3. **Multi-workspace is resolved by the channel, never guessed** (WA §12). One `ctx` carries one
   workspace; an ambiguous "which workspace" is a question to the user, not a default.

Failures throw `OrchestratorError` (`require("./orchestrator/context").OrchestratorError`) with a `code`
the channel maps onto its own reply:

| `error.code` | when | WhatsApp should say |
|--------------|------|---------------------|
| `unauthenticated` | no uid | ask the user to link their account |
| `invalid-argument` | no companyId, unknown capability | an internal error; do not echo the message |
| `not-found` | workspace document gone | "that workspace is no longer available" |
| `permission-denied` | not a member, scope missing, role gate, owner-only | name the area, never its contents |
| `failed-precondition` | capability's flag is off, plan does not include the channel | "that is not switched on for this workspace" |

A refusal names the area and not what is inside it: "Banking is not included for your role" tells the
model nothing about the bank feed.

The gate itself is `context.assertCapability(ctx, entry)`, and `run()` calls it before it reads (§5.1).
A channel never calls it directly to *decide* something — deciding twice is how two answers to the same
question get born — but `context.sectionAccess(ctx)` is fair game when a gateway wants to say up front
which sections of a multi-section answer this person will get.

---

## 4. What this binding may call — `listCapabilities({ channelProfile })`

```js
nivaOrchestrator.listCapabilities();                    // the flag projection — what MCP tools/list serves
nivaOrchestrator.listCapabilities({ channelProfile });  // narrowed to what this binding may call
```

Returns capability **names**, in registry order. One table, two projections: MCP's is the whole
published set, because the OAuth consent screen plus the workspace role are that channel's policy layer;
a chat binding has a second, coarser policy — "this phone may read, but may not send anything to a
customer" — and `channelProfile` is how it says so (WA §11 `allowedCapabilities`, §14, §15).
There is no WhatsApp-specific tool set, and there must never be one (WA §81).

### 4.1 The channel profile

```js
const bindingProfile = {
  capabilities: ["read"],            // WA §11 allowedCapabilities; alias: allowedCapabilities
  security: {
    assurance_level: 1,              // WA §15; alias: profile.securityLevel
    pii_level: "full",               // "none" on a group thread (WA §35)
    financial_data_allowed: true     // false on a group thread
  }
};
```

Read closed, on purpose:

- a profile with **no** `capabilities` gets `["read"]`, not everything;
- a capability name the table does not know is dropped, so a typo removes access instead of granting it;
- a missing or unreadable assurance level is **1**, the lowest a live binding can be;
- passing **no profile at all** means "this channel has no second policy layer" — that is MCP, and only
  MCP should do it.

`security.pii_level` and `security.financial_data_allowed` are applied later, inside the envelope (§6.3),
so a group thread gets the same answer with the person and the money taken out whatever the capability
wrote.

### 4.2 How a tool's required kinds are derived — `registry.kindsFor(entry)`

From the same two fields the OpenAI annotations are derived from, so a channel's policy and a reviewer's
annotation can never disagree about the same tool:

| entry | kinds | why |
|-------|-------|-----|
| `permission.write === false` | `read` | |
| write, `effects` includes `customer_message` or `provider_write` | `external_write` | the write leaves NivaDesk — the same fact that makes `openWorldHint` true |
| write, no outward effect | `internal_write` | |
| plus `effects` includes `external_fetch` or `ocr` | adds `file_upload` | the tool takes a document off the caller |

Worked examples over the full registry (`registry.publishedForChannel({ flags, channelProfile })`):

| binding | gets | does not get |
|---------|------|--------------|
| `["read"]`, level 1 | every read tool, including all ten orchestrator capabilities | `create_order`, `update_order_status`, `add_order_note`, `attach_bank_receipt`, `create_inventory_item` |
| all four kinds, level 1 | reads and nothing else | `attach_bank_receipt`/`create_inventory_item` (level 2), `create_order`/`update_order_status` (level 3) |
| `["read","internal_write","file_upload"]`, level 3 | reads, note writes, `attach_bank_receipt` | `create_order`, `update_order_status` — those need `external_write` because they can e-mail the buyer |

That last row is the point of the whole mechanism: `update_order_status` is class D / assurance 3 and
`external_write` because a status change fires `notifyCustomerOnStatusChange` and reaches the customer's
inbox. A read-only WhatsApp beta cannot call it by accident, and a level-1 binding cannot either.

---

## 5. Asking — `run({ capability, args, ctx, request })`

```js
const envelope = await nivaOrchestrator.run({
  capability: "get_business_attention_summary",
  args: { horizonDays: 2 },
  ctx,
  request: {
    requestId: "wa_01J…",           // used in the audit record
    channelType: "whatsapp",        // reserved: today the channel comes from ctx.channel.type
    providerMessageId: "wamid.…",   // reserved (§9)
    providerConversationId: "…",    // reserved (§9)
    idempotencyKey: "…"             // reserved (§9) — no capability writes yet
  }
});
```

### 5.1 The order is fixed

1. resolve the capability — unknown name, or a name whose flag is off → refuse;
2. **assert permission before a single document is read** (§38 of the orchestration spec);
3. record the PII access, when the capability declares one;
4. load only the domains the capability declares (`entry.domainNeeds`);
5. run the pure handler;
6. build the envelope — freshness, warnings, `partial` — and the summary lines.

Step 2 before step 4 is not a style choice: a gate that runs after the read has already handed the data
to the process that was not allowed to ask for it.

### 5.2 Same handler, same semantics

`run("get_commerce_overview")` from WhatsApp executes the same code, the same gates, the same rounding
and the same freshness rules as from ChatGPT. The figures are identical by construction; only the
rendering differs (§7). When write capabilities are adapted behind `run()` in CH-4 they inherit the same
property — including the customer notification that makes `update_order_status` an external write.

### 5.3 Arguments

`args` are the capability's own (date ranges, `source`, `query`, `limit`, …) and are validated inside the
capability. The channel does not pre-filter, re-total or post-process them; a channel that reshapes an
answer has started keeping its own truth.

### 5.4 The PII hook — WhatsApp must inject it

`recordPiiAccess` is called before dispatch for any capability whose registry entry declares `pii`
(today: `search_commerce_orders` → name, e-mail; `get_banking_attention_summary` → counterparty name),
with `source: ctx.channel.type`. MCP does **not** inject it, because the MCP dispatcher already writes
exactly one row per call and two rows for one read is a worse audit than none. Any other channel must
inject it, or its reads of customer data are unlogged.

Known gap, not yet fixed: `functions/privacy/accessLog.js` `ACCESS_SOURCES` is
`["web","ios","android","mcp","portal","server","unknown"]`, so a WhatsApp row lands as `unknown` today.
Adding `whatsapp` and `rest` to that list is part of the 1.2.0 audit corrections
(`docs/mcp-submission-1.2.0.md` §2.3); do it before the first WhatsApp read of customer data ships,
not after.

PII rules that hold on every channel: the assistant is told which order and asks before it is told who;
`restrictedCustomer` never leaves the server without an explicit reveal grant; orders are redacted once,
in `loaders.projectOrderForAssistant`, and a row that will not name the buyer also loses `notes` and
`historyLog`, because engine orders keep the buyer's own sentence in `notes`.

### 5.5 The audit sink

When `audit` is injected, every run emits:

```js
{ requestId, channelType, companyId, userId, capability, resultState,
  recordsRead: { orders, bankTransactions, inventoryItems } }
```

The gateway adds its own fields — `binding_id`, `group_id`, `provider_message_id`,
`response_message_id` — and writes the row (WA §57, orchestration spec §86). The sink is fire-and-forget:
a failed audit write never fails the answer, and never silently swallows the answer either.

---

## 6. The answer — the envelope

### 6.1 Shape

```js
{
  ok: true,
  action: "get_commerce_overview",   // the capability name
  state: "completed",                // §6.2
  data: { … },                       // the capability's own structure — the only place figures live
  freshness: { ordersLastSync, financeLastSync, inventoryLastSync, sources: [ … ] },
  partial: false,                    // something could not be included; say so, never round it away
  warnings: [ { code, message, channel?, connectionId?, section? } ],
  entityRefs: [ { type, id, label, url } ],
  suggestedActions: [ { … } ],
  summary: { lines: [ { slot, text } ] }
}
```

### 6.2 `state` is a closed vocabulary

`prepared`, `awaiting_approval`, `approved`, `queued`, `executing`, `completed`, `partially_completed`,
`failed`, `invalidated`, `needs_attention`. **`queued` is not `completed`**: a request accepted for later
work must never render as done. The renderer reads this field instead of guessing from the presence of
data.

### 6.3 `warnings[].code` is a closed list

`channel_not_connected`, `channel_adapter_only`, `channel_not_supported`, `channel_excluded_auth`,
`channel_stale`, `status_not_visible_from_this_surface`, `loader_cap_reached`, `plan_limited`,
`section_not_permitted`, `unsupported_metric`, `estimated`, `mixed_currency`, `tax_needs_review`,
`needs_review_truncated`, `source_state_unknown`.

A new kind of incompleteness has to be named in `envelope.WARNING_CODES` next to the others, and the
renderer taught to say it. An open string bag lets a capability invent `amazon_probably_fine` and nobody
notices.

The three honesty rules a channel must not paper over:

- a channel that is **not connected** is named, never counted as zero;
- a source that contributed rows but cannot report a sync time sets `partial: true` and names itself —
  "no sync time" and "live data" must not render identically;
- amounts in another currency are listed in their own rows and never converted.

### 6.4 The channel profile is applied here

`envelope.applyChannelProfile` runs inside `finish()`, so a group thread with `pii_level: "none"` and
`financial_data_allowed: false` gets `{ restricted: true, reason: "channel_pii_policy" }` in place of the
customer and the money, whatever the capability wrote. The channel cannot forget to apply it, and cannot
undo it. It runs over `data` **and** `entityRefs`, because the refs leave the server beside the data.

Redaction follows the value, not the field name, because money reaches a reader in three shapes:

- a **block** — `totals`, `sales`, `fees`, `tax`, `settlements`, `amounts`, `profit`, and `value` when it
  holds an object (a stock valuation) — replaced whole;
- a **fact row** — `{ key, value, currency? }`, where the meaning is in `key` at runtime. `{ key:
  "amount" }` is withheld and `{ key: "count" }` is not: a rule reading the literal field name `value`
  destroys the counts a shared thread may see and keeps the amounts it may not;
- a **sentence** — `"420 GBP still outstanding"`, written by a detector. Amounts in any string become
  `[amount withheld]`, so the line still reads as a line and says what was removed.

For `pii_level: "none"`: `customer`, `customerName`, `customerEmail`, `email` and `phone` are replaced,
and an `entityRef` of type `bankTransaction` or `note` keeps its `id` and loses its `label` with
`labelRestricted: true` — the thread is told WHICH row, never who was paid. A product name is not PII and
is not touched.

---

## 7. Rendering — presentation only

```js
const lines = render.summaryFor(envelope, { style: "compact" }); // [{ slot, text }]
const text  = render.toText(lines, { style: "compact" });        // "1. …\n2. …"
```

`run()` has already filled `envelope.summary.lines` using the style that matches `ctx.channel.type`
(`compact` for WhatsApp, `chat` elsewhere), so a gateway can send `toText(envelope.summary.lines, …)`
directly, or render `data` itself.

Slots come out in the §13 answer order — `result`, `breakdown`, `finance`, `attention`, `next` — and
empty slots are dropped. Three rules the render tests pin:

- **every number in a line comes from `data`.** A summary that computes its own total is a second
  implementation of the arithmetic, and the two drift.
- **no provider- or buyer-authored text reaches a line.** Notes, history entries, design names and custom
  fields are written by other people; that is where a buyer's name leaks and where a prompt injection
  arrives.
- **a withheld figure is said to be withheld, never coerced.** `run()` applies the channel profile inside
  `finish()` and renders afterwards, so the renderer reads redacted `data`: a block may be
  `{ restricted: true }` rather than figures. Rendering it anyway produced "5 order(s) and 0 undefined
  gross" — a fabricated sales total on the path the WhatsApp consumer uses. The line says the figure is
  not shown in this channel and carries no number at all.

WhatsApp's own formatting (numbered lists, pagination, WA §38–§39) is the channel's business. The figures
are not.

---

## 8. The registry as the capability source

`functions/orchestrator/registry.js` is the single table behind `tools/list`, the OpenAI annotations and
the channel policy.

| function | returns |
|----------|---------|
| `flagsFromEnv(env)` | `{ emailReceipts, inventory, orchestrator }` from `NIVADESK_MCP_*` |
| `normalizeFlags(flags)` | the same three, coerced to booleans |
| `publishedEntries(flags)` / `publishedNames(flags)` | what this deployment publishes, in `tools/list` order |
| `publishedForChannel({ flags, channelProfile })` | §4 — the same table, narrowed to one binding |
| `kindsFor(entry)` | §4.2 |
| `entryFor(name)` | the whole entry, or `null` |
| `annotationsFor(name, flags)` | the four hints, always booleans, in wire order |
| `justificationFor(name)` | the four `Because …` lines |
| `scopesFor(name)` / `effectsFor(name)` | OAuth scopes / outward effects |
| `correctionsPending()` | hints the live listing serves that the runtime no longer supports |

Entry fields a channel policy reads: `name`, `flag`, `scopes`, `permission{guard, area, write, financial,
bankFeed, ownerOnly, …}`, `riskClass` (A–E), `minAssurance` (1–3), `pii[]`, `piiAccessLogged`, `effects[]`,
`annotations`, `domainNeeds[]`.

The table validates itself at load (`assertRegistry`) and refuses to start rather than serve a listing
with a hole in it. `CAPABILITY_KINDS`, `RISK_CLASSES` and `EFFECT_KINDS` are closed lists for the same
reason the warning codes are.

### 8.1 The ten capabilities `run()` serves today

All are reads: class A, assurance 1, no outward effect — which is why a level-1 read binding may call
every one of them.

| capability | scopes | gates | PII | domains read |
|------------|--------|-------|-----|--------------|
| `get_business_attention_summary` | orders.read finance.read | orders | — | settings orders production inventory bank receiptInbox payouts connections commerceHealth review accounting |
| `get_commerce_overview` | orders.read finance.read | orders + financial | — | settings orders payouts connections commerceHealth |
| `search_commerce_orders` | orders.read | orders | name, e-mail | settings orders commerceHealth |
| `get_channel_performance` | orders.read finance.read | orders + financial | — | settings orders payouts connections commerceHealth |
| `get_inventory_overview` | orders.read | orders + inventory | — | settings inventory |
| `search_inventory_items` | orders.read | orders + inventory | — | settings inventory |
| `get_payout_reconciliation_overview` | finance.read | bankFeed | — | settings payouts bank connections |
| `get_integration_health` | orders.read | orders | — | orders connections commerceHealth review |
| `get_accounting_sync_status` | finance.read | accountingReader | — | settings connections accounting bank |
| `get_banking_attention_summary` | finance.read | bankFeed | name | settings bank receiptInbox connections |

`search_inventory_items` is registered as its own tool under the orchestrator flag, while the older
`search_inventory` is registered under the inventory flag. With both flags on `tools/list` carries two
inventory searches, which is the tool sprawl §10 of the orchestration spec warns about; the submission
document (`docs/mcp-submission-1.2.0.md` §5.1) carries it as a decision the operator closes before the
next listing goes out. For a channel it changes nothing — `run("search_inventory_items", …)` is the
capability either way.

Loader caps, per call: orders 1000, bank 3000, inventory 2000, payouts 500, review 200, inbox 100.
Hitting one sets `partial: true` with `loader_cap_reached` — a truncated answer says it is truncated.

---

## 9. Reserved interfaces — not implemented

Signatures are fixed here so CH-3/CH-4 can be written without renegotiating the contract. **None of these
exists in code today.** When one lands, this section is rewritten and the contract test's reserved list
shrinks with it.

- `continuation.get/set(ctx, { activeWorkspaceId, lastSearchResultIds[], lastOpenedEntity,
  pendingProposalId, pendingFileMatchId, paginationCursor, expiresAt })` — conversation state (WA §40–§41).
  UX state, never truth: "the second one" resolves an id, it never authorises an action.
- `pendingFileMatch.create/select(ctx, { id, workspaceId, userId, channelBindingId, fileAssetId,
  documentType, extractedMerchant, extractedAmount, extractedDate, candidateTransactionIds[], confidence,
  state, expiresAt })` — the channel-agnostic continuation of `attach_bank_receipt`'s candidates step
  (WA §22–§23). The candidate is re-read before assignment and the user is never asked to upload again.
- `proposals.prepare/approve/revalidate/execute(ctx, ActionProposal)` — the WA §44 state machine over the
  WA §45 object, allowlisted `actionType`s only. Approval revalidates: a proposal whose `beforeState` no
  longer matches is `invalidated`, not executed (WA §47). An ambiguous "yes" never approves a class-D/E
  action (WA §85.15) — which includes `update_order_status`.
- **Write capabilities through `run()`** (CH-4). Today `run()` serves reads only; the existing write tools
  are still MCP handlers in `functions/index.js`. When they move behind `run()` they keep their registry
  entry, their annotations and their `idempotencyKey` semantics — a duplicate WhatsApp delivery must yield
  no second note, no second status change and no second customer message (WA §42–§43).
- **`request.idempotencyKey` / `providerMessageId` enforcement.** Accepted and carried today; deduplication
  is the gateway's until a write capability needs it.
- **`ACCESS_SOURCES` gaining `whatsapp` and `rest`** (§5.4).

---

## 10. What the channel may not do

1. Compute a figure. Every number comes from `data`.
2. Cache a role, a company document or an entitlement across requests and treat it as authority (WA §13).
3. Call a capability the binding's profile does not allow, or raise the binding's own assurance level to
   make a call succeed.
4. Reach past `functions/orchestrator/` into `commerce/`, `bankFeed.js`, `finance/` or a provider client.
5. Render `state: "queued"` as done, drop a `warning`, or hide `partial`.
6. Send a message to a customer of its own composition. The only thing that reaches a buyer is the
   workspace's own notification, in the workspace's own words.
7. Resolve an ambiguity by guessing — across workspaces, orders or candidates (WA §65).
8. Invent a tool name. A capability that does not exist is a design conversation, not a channel patch
   (§10 of the orchestration spec: no per-provider, per-agent or generic action tools).

---

## 11. Testing against this contract

- `test/qa/orchestrator-contract.test.js` — the projections, the fail-closed profile, the read-only
  capability set, cross-channel identity of figures, the audit and PII hooks, and this document.
- `test/qa/orchestrator-purity.test.js` — the import rules of §1.
- `test/qa/orchestrator-context.test.js` — permission before read, per-request company document,
  domain-only loading.
- `test/qa/orchestrator-envelope.test.js`, `-render.test.js` — §6 and §7.
- `test/qa/mcp-tool-annotations.test.js` — the registry's four booleans and their justifications.
- Fixtures: `test/fixtures/orchestrator.js` (`mixedSnapshot`, `attentionSnapshot`, `ownerContext`). Build
  snapshots as literals; there is no fake Firestore in these tests and none is needed.

A new channel's own tests belong beside these and must assert the contract — never a copy of the
implementation.
