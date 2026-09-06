# NivaDesk ChatGPT MCP — orchestration design (v2 read layer)

Status: design, revision 2, 6 Sep 2026. Branch `mcp-orchestration`, worktree `/Users/gocmen/Developer/studioflow-mcp`.

> **Scope, 6 September 2026 — eight of the ten capabilities below are NOT in this release.** The
> operator's list was order search and read, customer search and read, and the workspace's ONE inventory
> search; there has never been a customer capability on any assistant surface, so what ships behind
> `NIVADESK_MCP_ORCHESTRATOR` is the two that exist: `search_commerce_orders` and `search_inventory`.
> `get_business_attention_summary`, `get_commerce_overview`,
> `get_channel_performance`, `get_inventory_overview`, `get_payout_reconciliation_overview`,
> `get_integration_health`, `get_accounting_sync_status` and `get_banking_attention_summary` came out —
> every banking capability, marketplace payouts, the sales and per-channel money summaries, the
> inventory valuation, the connection roster and the accounting sync status. "Out" means the registry
> has no row for them and the dispatcher publishes and runs nothing for them, so no flag state can list
> or call one; `functions/test/qa/mcp-reduced-surface.test.js` proves it over all eight flag
> combinations. Their modules stay on disk and unreachable. Everything this document says about how they
> are DESIGNED is still accurate; what changed is which of them the release publishes, and this
> document has not been rewritten around that — read it as the design, and §8.1 of
> `docs/orchestrator-contract.md` as the surface.
>
> **One part of this document is not a design and is therefore corrected here rather than left standing:
> §5, the test plan.** It names a file per capability, and the files for the eight removed capabilities
> are not in the suite. Three of them existed and were deleted by the reduction —
> `orchestrator-attention.test.js`, `orchestrator-payouts.test.js` and `orchestrator-integrations.test.js`
> (§5.5 calls the last of these `orchestrator-integration-health.test.js`) — because a test asserting the
> behaviour of a capability nothing can reach hides real coverage rather than adding to it. The rest
> (`orchestrator-channel.test.js`, `orchestrator-money.test.js`, `orchestrator-search-commerce.test.js`,
> `orchestrator-channel-performance.test.js`, `orchestrator-accounting.test.js`,
> `orchestrator-no-secrets.test.js`, `bank-insights.test.js`) were never written; they were the plan.
> §11 of the contract document lists the suite that exists.
Spec: `NivaDesk_ChatGPT_MCP_Agentic_Orchestration_Expanded_2026-09-05-2.md` (§1–§93) and
`NivaDesk_WhatsApp_AI_Channel_Implementation_Spec_2026-09-05.md` (cited as WA §n). Both read-only.

Source of truth for "what the server does today" is `functions/index.js` (`exports.chatgptMcp`,
line refs from HEAD `d4399da1`), not the spec's memory of it (§15: "runtime behaviour is the source of
truth"). Where the spec and the runtime disagree the runtime wins and the disagreement is called out.

**Revision 2 exists because revision 1 asserted runtime facts that are not true.** The corrections that
change a conclusion rather than a wording are listed here once, because several of them invalidate a
sentence that was going to be sent to a reviewer:

1. `update_order_status` **can send a customer an e-mail or SMS.** `exports.notifyCustomerOnStatusChange`
   (index.js:28196) is an `onDocumentWritten` on `siparisler/{orderId}` holding the SMTP and Twilio
   secrets, and it fires on every status change. Revision 1 said no such trigger exists. It does, and
   `cleanPortalAutoUpdates` defaults `{ enabled: true, email: true, sms: false }`, so the e-mail is **on
   by default** for any order that carries an address — not opt-in. §1.1, §1.2, §1.3, §5.4, §6 and §7
   are rewritten around that fact.
2. `accounting/core/store.openAttention` is a **writer** (`store.js:109`, `set({ status:"open",
   occurrences: +1 }, { merge:true })`). Revision 1 named it as the source for a `readOnlyHint:true`
   capability. §2.1 and §2.5 now name a reader.
3. The `attach_bank_receipt` fetch is **not SSRF-guarded on the path that matters**: index.js:24931 calls
   `nvAssertPublicHttpsUrl` only when the URL is *not* https, and the guard rejects non-https on
   protocol, so it never blocks a request that would otherwise be made. §7 no longer claims a guard that
   does not run.
4. `nvLoadBankTransactions` (index.js:24681) reads `bankTransactions` only, not `bankReceiptInbox`.
5. `requireReader` is a closure inside `createAccountingFunctions`, not an export, and it is *stricter*
   than the bankFeed area predicate revision 1 planned to reuse in its place.
6. `privacy/accessLog.ACCESS_SOURCES` had no `rest` or `whatsapp` value; both were logged as
   `unknown`. `rest` shipped with the 1.2.0 audit corrections and is in the list; `whatsapp` is
   deliberately still out (a source nothing can write is a vocabulary entry pretending to be a control)
   and goes in with CH-3, so a WhatsApp row lands as `unknown` and names its channel in `note`.
7. Amazon orders reach this project's `siparisler` through `ingestAmazonEnvelope` (index.js:34228), so
   "Amazon is not available" cannot be a static registry fact.

## 0. Scope, constraints, decisions

What this document covers (spec §56 Phase 0 + Phase 1, spec §88 Phase CH-1 — the CH-n phases live in the
orchestration spec; the WhatsApp spec's own phases are W0–W8):

1. The annotation table and per-tool justification for every tool the runtime registers, and the code
   change that makes the four hints explicit, single-sourced and CI-validated (§16–§21).
2. The channel-agnostic orchestrator (`functions/orchestrator/*.js`): the §11–§12 read capabilities as
   pure functions over existing helpers, the result envelope (§13–§14), and the MCP tools as thin
   adapters behind a flag that is off by default.
3. Permission and PII rules per capability (§22–§23, memory rules).
4. The reuse contract the WhatsApp gateway will consume (§62–§92, WA §7–§47).
5. The test plan. 6. Guide entries. 7. What changes for OpenAI submission 1.2.0 and what does not.

Non-negotiables carried through every section:

- **The deployed discovery surface does not move until the operator deploys the 1.2.0 submission.**
  Every new tool, every annotation correction, the `serverInfo.version` bump and the rewritten
  `initialize.instructions` sit behind `NIVADESK_MCP_ORCHESTRATOR=1` (`NV_MCP_ORCHESTRATOR`, read at
  module load like the other two). Flag off, `tools/list`, `serverInfo` and `instructions` are the exact
  bytes serving the 1.1.1 review connection today. This is stricter than revision 1, which called the
  discovery text "safe to change": it is served in production on the next `chatgptMcp` deploy, and the
  review connection is live on 1.1.1.
- **No new business logic in the channel.** Orchestration and policy are server modules that take an
  already-resolved workspace context; `chatgptMcp` and `chatgptWorkspaceAction` become adapters, and the
  WhatsApp gateway calls the same modules (WA §2 "WhatsApp is a channel, not a second NivaDesk").
- **Existing 19 tools keep their behaviour except where a stated behaviour is false.** Three changes are
  proposed and all three are corrections, not features: the `update_order_status` / `update_note` no-op
  guard (§1.4.8), the `update_order_status` status vocabulary gate (§1.4.9), and the URL fetch guard on
  `attach_bank_receipt` / `create_inventory_item` (§1.4.10). Each needs its parity test written first.
- **No tool sprawl** (§10, §48): one source-filtered tool per job; no per-provider or per-agent tools.
- **Never deploy from this worktree; never touch the live listing, the review connection or the flags in
  production.** Nothing here writes to production.

Naming decision (§11 "final only after repository conflict check"): the ten §11–§12 names were grepped
across `functions/` (excluding `node_modules`) and none exists as a tool, callable or export. Nine are
adopted as-is.

> **Corrected 6 September 2026, after a reviewer measured the listing rather than reading this
> paragraph.** What follows was the plan; it is not what the code did. `search_inventory_items` **was**
> published, in the orchestrator flag branch, alongside the pre-existing hidden `search_inventory`, so
> the repository shipped two inventory searches when both flags were on — exactly the sprawl §10 warns
> about.
>
> The arithmetic was wrong as well. Measured across the flag states: 19 published with the
> orchestrator flag off, 21 with inventory, 29 with the orchestrator, **31 with both** — the
> orchestrator appended **ten** tools, not nine, and the tenth was `search_inventory_items`, which is
> why §7 carried no submission description for it.
>
> **Closed the same day.** The two are one tool now. Neither was ever public — production runs with
> every MCP flag unset, so its listing carries no inventory search at all — so the choice was made on
> the merits: the published name is `search_inventory`, gated by **both** flags, with the orchestrator's
> implementation behind it whenever the orchestrator flag is on; `search_inventory_items` has no
> registry row and survives only as an internal alias. Both flags on is **22** tools. This fold took
> that state from 31 to 30; the 6 September reduction in the banner at the top of this document then
> removed eight capabilities and took it to 22, which is where the builder stands today. The
> field-by-field comparison, what was folded in rather than dropped, and the test that fails if a second
> inventory search ever appears in any flag state are in `docs/mcp-inventory-search-decision.md`.

## 1. Annotations

### 1.1 The rule the reviewer applies

OpenAI rejected 1.1.1 with: "annotations do not appear to match the tool's behavior … explicitly set to
true or false (not null) for every tool … include a clear justification … based on the tool's actual
behavior." Two demands (§1): all four hints are literal booleans on every published tool, and each value
is defensible from runtime behaviour. Definitions used below, fixed so the "verify" cells of §17 can be
decided by tests instead of opinion:

- **The unit being annotated is the observable effect of calling the tool, not the lines inside its
  handler.** If a workspace-configured Firestore trigger turns the handler's write into an e-mail, an
  SMS or a provider call, that effect belongs to the tool. A hint that is true only because the code
  doing the thing lives in another function is the kind of claim 1.1.1 was rejected over. This rule is
  what moves `update_order_status` and `create_order` (§1.3).
- `readOnlyHint: true` — the handler performs no Firestore/Storage write of workspace state, no external
  call with a side effect, and no trigger fires off the back of it. **Carve-out, taken deliberately and
  disclosed:** `recordPiiAccess` writes a row to `companies/{cid}/piiAccessLog` before dispatch
  (index.js:29511); that is a record *of the read*, not a change to what the workspace holds, and it does
  not flip the hint. Spec §16 defines readOnly as "persistent state değiştirmeyen", so this is a
  position, not a deduction — therefore every registry entry whose `readOnlyHint` is `true` **and** whose
  `pii` list is non-empty must say so in its own `readOnlyHint` justification line (CI-enforced, §5.1).
  The reviewer sees the carve-out on the tool, not buried in a design document, and the operator signs
  it off in §8.
- `destructiveHint: true` — a call can overwrite, replace, move or delete something the workspace already
  had (a status value, a note body, a receipt on a transaction). Purely additive writes (a new document,
  an appended line) and reversible boolean flags are `false`.
- `idempotentHint: true` — a second identical call produces no new document, no new sub-record (history
  entry, note line, stored file), no change to any user-visible field **and no outbound message**.
  Server bookkeeping timestamps (`updatedAt`) are excluded from the comparison. This is the criterion
  the behaviour tests in §5.4 assert; a value is not set to `true` without that test (§33.10).
- `openWorldHint: true` — calling the tool reaches outside the NivaDesk closed domain: it fetches a URL,
  calls a third-party API (Vision OCR, an SMTP relay, Twilio), or mutates a provider — whether the
  handler does it directly or a trigger the workspace configured does it in consequence. Writing a
  NivaDesk record that later feeds an *internal proposal* is still not open-world (§16's "internal
  proposal ≠ external provider mutation"); writing a NivaDesk record that puts a message in a customer's
  inbox is.

### 1.2 Runtime tool table

Order = `nvMcpAvailableActions()` (index.js:24413) = tools/list order. RO/D/I/OW = readOnly /
destructive / idempotent / openWorld. "Live 1.1.1 → 1.2.0" says whether the value on the wire changes.
Scope = `nvMcpOAuthScopesForTool` today → proposed. Risk class per §43; assurance per WA §15 (channel
policy only; not on the wire).

| # | Tool | Flag | RO | D | I | OW | Live 1.1.1 → 1.2.0 | Scope today → proposed | Risk / assurance |
|---|------|------|----|---|---|----|--------------------|------------------------|------------------|
| 1 | create_order | — | false | false | false | **true** | OW false → **true** | orders.write | **D / L3** |
| 2 | search_orders | — | true | false | true | false | unchanged | orders.read | A / L1 |
| 3 | get_order_detail | — | true | false | true | false | unchanged | orders.read | A / L1 |
| 4 | add_order_note | — | false | false | false | false | unchanged | orders.write, notes.write | B / L1 |
| 5 | update_order_status | — | false | true | true | **true** | OW false → **true** | orders.write | **D / L3** |
| 6 | create_note | — | false | false | false | false | unchanged | notes.write | B / L1 |
| 7 | search_notes | — | true | false | true | false | unchanged | notes.read | A / L1 |
| 8 | get_note_detail | — | true | false | true | false | unchanged | notes.read | A / L1 |
| 9 | append_note | — | false | false | false | false | unchanged | notes.write | B / L1 |
| 10 | update_note | — | false | true | true | false | unchanged | notes.write | B / L1 |
| 11 | pin_note | — | false | false | true | false | unchanged | notes.write | B / L1 |
| 12 | archive_note | — | false | false | true | false | unchanged | notes.write | B / L1 |
| 13 | get_order_financials | — | true | false | true | false | unchanged | finance.read | A / L1 |
| 14 | get_dashboard_summary | — | true | false | true | false | unchanged | orders.read, finance.read | A / L1 |
| 15 | get_extra_spending_overview | — | true | false | true | false | unchanged | finance.read | A / L1 |
| 16 | get_financial_overview | — | true | false | true | false | unchanged | finance.read | A / L1 |
| 17 | get_bank_spending_summary | — | true | false | true | false | unchanged | finance.read | A / L1 |
| 18 | search_bank_transactions | — | true | false | true | false | unchanged | finance.read | A / L1 |
| 19 | attach_bank_receipt | — | false | true | false | true | unchanged | finance.read, orders.write | C / L2 |
| 20 | search_inventory | NV_MCP_INVENTORY **or** NV_MCP_ORCHESTRATOR | true | false | true | false | hidden | (default orders.read) → orders.read | A / L1 |
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

- `create_order`, `update_order_status` → openWorld **true**. The reason is §1.3 and it is the biggest
  correction in this revision.
- `get_bank_spending_summary`, `search_bank_transactions` → openWorld **false**: `nvLoadBankTransactions`
  (index.js:24681) reads `companies/{cid}/bankTransactions` only — `orderBy("bookingDate","desc")`,
  `limit(3000)` — and nothing else; no provider call, no TrueLayer/PayPal request. (Revision 1 said it
  also reads `bankReceiptInbox`. It does not; that read is *added* by this design, §2.5.)
- `update_order_status`, `update_note` → destructive **true** (an existing value is overwritten via
  set(merge)), idempotent **true** *only once §1.4.8 lands*. Today a repeat appends a second history
  entry: `nvHistoryItem` mints `crypto.randomUUID()` and `Timestamp.now()` per call, so the `arrayUnion`
  in `nvChatGPTUpdateOrderStatus` (index.js:24205-24215) can never dedupe, and
  `update_note`/`pin_note`/`archive_note` re-stamp `source:"chatgpt"` (24356, 24370, 24389, 24400). The
  registry couples the two: CI fails the build if `idempotentHint` is `true` for these tools while the
  guard is absent from the handler (§5.1), so the hint cannot outlive the behaviour.
- `pin_note`, `archive_note` → destructive **false** (reversible boolean), idempotent **true** (set(merge)
  of the same boolean plus the `source` stamp; the §1.4.8 guard covers these two as well).
- `attach_bank_receipt` → idempotent **false**: the §6.2 duplicate-retry test shows that a second call
  with the same `inboxPath` fails because `assignInboxReceipt` (bankFeed.js:1843) moved the inbox file,
  and a second call with the same file uploads and scores a second copy.
- Two §17 rows disagree with runtime and the runtime values are kept: `attach_bank_receipt` is
  destructive **true** (assigning replaces and deletes a previous `receiptPath`) and openWorld **true**
  (fetches a model-supplied URL and calls Google Vision OCR).

### 1.3 Per-tool justification (registry text, one paragraph each)

The registry (§1.4) stores four `Because …` lines per tool; the paragraph below is the same content in
prose and is what goes into the 1.2.0 release notes.

**create_order** — readOnlyHint false because the call writes a new document in `siparisler` through
`nvOrderDefaults` with `createdFrom:"chatgpt"`. destructiveHint false because it only adds a record; no
existing order is changed or removed. idempotentHint false because there is no request-level
deduplication: the same arguments twice create two orders with fresh ids. **openWorldHint true because
creating an order with a status and a customer e-mail address can put a message in that customer's
inbox**: `notifyCustomerOnStatusChange` (index.js:28196) runs on document *creation* as well as update —
`before` is null, so the "same status as before" early return does not fire — and the notification
defaults are on (`cleanPortalAutoUpdates` returns `{enabled:true, email:true, sms:false}` when the order
carries no `portalAutoUpdates` block, which is every order this tool makes). The mail leaves through
NivaDesk's SMTP provider; where the workspace has SMS enabled and a verified sender it also leaves
through Twilio. The tool calls no shop or marketplace API.

**search_orders** — readOnlyHint true because it queries `siparisler` by `companyId` and filters in
memory; the only write is the PII access row this read produces (`companies/{cid}/piiAccessLog`, §1.1
carve-out). destructiveHint false because no record is altered. idempotentHint true because repeating
the query returns the same rows and creates nothing beyond that audit row. openWorldHint false because
it reads NivaDesk data only and never contacts a sales channel.

**get_order_detail** — same behaviour class as search_orders on a single document, including the PII
access row (cross-workspace and workflow-only assignment checks are reads).

**add_order_note** — readOnlyHint false because it appends to the order's `notes` string and adds a
`historyLog` entry. destructiveHint false because existing text is kept; the call only concatenates.
idempotentHint false because each repeat appends the same line again. openWorldHint false: the customer
notification keys on `status`, which this tool does not touch, so nothing leaves the workspace.

**update_order_status** — readOnlyHint false because it sets `status` / `designStatus`. destructiveHint
true because the previous value is overwritten (the old status is not recoverable from the field).
idempotentHint true because the call sets an explicit end state and the §1.4.8 guard makes an exact
repeat a real no-op: no second history entry, no write, and therefore no second customer message (the
trigger only fires on a change). **openWorldHint true because a status change is what the workspace's
own customer notification listens for.** `notifyCustomerOnStatusChange` sends an e-mail through
NivaDesk's SMTP provider, and an SMS through Twilio where the workspace has SMS enabled, to the address
and number on the order. It is on by default: an order with no `portalAutoUpdates` block counts as
enabled with e-mail on, and the three milestone triggers (`estimateReady`, `readyForCollection`,
`workStarted`) default on (`cleanSmsTriggers`). Which message goes out is decided by matching the status
text against `portalStatusMessage`'s patterns, and a workspace that opted into `everyStatusChange` gets
`portalGenericStatusMessage`, which copies the status string into the message verbatim ("Your order is
now at this stage: …"). The tool contacts no shop, marketplace or accounting provider, and it does not
push status to Shopify/Etsy/Amazon — but the effect of calling it reaches a third-party sender and the
buyer, so the hint says true (§1.1's first rule). Two mitigations ship with this annotation and both are
named in the release notes: the status argument is validated against the workspace's own status
vocabulary (§1.4.9), so a chat cannot compose arbitrary customer-facing text through this tool; and the
tool is registered as risk class D (external communication) with assurance L3, which is what routes it
through the proposal/approval flow on the WhatsApp projection (WA §44–§45).

**create_note** — false/false/false/false: creates a new note document under the connected user's
`personal_notes`; additive; no dedupe; workspace only, no trigger.

**search_notes**, **get_note_detail** — true/false/true/false: read the user's own notes only; no PII
access row (the notes are the caller's own).

**append_note** — false/false/false/false: appends to `text`; existing text kept; each repeat appends again.

**update_note** — readOnlyHint false because it sets title/text/labels/links/colour and stamps
`source:"chatgpt"`. destructiveHint true because the supplied fields replace the previous values.
idempotentHint true because it sets an explicit end state and the §1.4.8 guard makes an exact repeat a
no-op — without that guard the `source`/`updatedAt` re-stamp on every call is the only difference, which
sits inside the definition's exclusion, but the guard is what makes the claim testable rather than
argued. openWorldHint false.

**pin_note** / **archive_note** — readOnlyHint false because they set `isPinned` / `isArchived` and
`source`. destructiveHint false because the flag is reversible and no content is lost. idempotentHint
true because a repeat sets the same boolean and, with the §1.4.8 guard, writes nothing at all.
openWorldHint false. (Behaviour note kept in the justification: omitting the boolean defaults it to
`true`.)

**get_order_financials**, **get_dashboard_summary**, **get_extra_spending_overview**,
**get_financial_overview** — true/false/true/false: compute over orders/spending documents in the
workspace; plan and role decide the shape (basic vs advanced, finance fields stripped without the
Financial permission); the only write is the PII access row for the read (§1.1 carve-out); nothing
external.

**get_bank_spending_summary**, **search_bank_transactions** — true/false/true/false: read the
workspace's already-imported bank rows; classification is in-process (`bank/classification.js`); no
bank, PayPal or provider API is called; repeat calls change nothing beyond the access row. Both emit
one: a bank row's `counterparty` on a person-to-person payment is a person and `linkedOrderLabel` can
carry a customer's name, so their registry `pii` is `["name"]`, not empty (§3).

**attach_bank_receipt** — readOnlyHint false because it stores the file under
`companies/{cid}/bank_receipts/_inbox/…`, and then either assigns it to a transaction, returns
candidates, or queues it as waiting. destructiveHint true because assigning to a transaction that
already has a receipt replaces that receipt (the previous `receiptPath` is deleted). idempotentHint
false because a repeat with the same file stores and scores a second copy, and a repeat with the same
`inboxPath` fails because the inbox file was moved on the first assignment. openWorldHint true because
the handler downloads the document from a model-supplied `https` URL and calls Google Vision for OCR —
it interacts with systems outside NivaDesk even though it mutates no sales provider. Owner-only; the
§6.1 match flow is regression-critical and unchanged. (The URL guard on that download is fixed in
§1.4.10; the annotation is true either way.)

**search_inventory** (flag) — true/false/true/false: reads `inventoryItems`; workspace only; no person
fields, so no PII access row.

**create_inventory_item** (flag) — readOnlyHint false because it writes an item through
`inventoryInternal.saveItemForWorkspace` and stores the photo. destructiveHint false because it only adds.
idempotentHint false because a repeat creates a second item (it refuses without `confirmed:true`, which
is a guard, not deduplication). openWorldHint true because it downloads the photo from a model-supplied
`https` URL.

**get_business_attention_summary, get_commerce_overview, get_channel_performance,
get_inventory_overview, get_payout_reconciliation_overview, get_integration_health,
get_accounting_sync_status, get_banking_attention_summary** (flag) — readOnlyHint true because each runs
`orchestrator.run()` over a snapshot read from Firestore and returns an envelope; no workspace record is
written, and no module they call writes — enforced, not asserted: §5.6 fails the build if any
orchestrator module imports `openAttention`, `resolveAttention` or `recordAudit`. destructiveHint false:
no record altered. idempotentHint true: same input, same snapshot → same answer; nothing created.
openWorldHint false because they read NivaDesk's canonical records (orders, payouts, bank rows,
connection status docs) and never call Shopify, Etsy, Amazon, eBay, Square, PayPal, a bank or an
accounting provider; provider status is whatever the last sync recorded, and the envelope says how old
that is. The `suggestedActions` they return are references to other NivaDesk tools, not executed
actions (§16 internal-proposal rule).

**search_commerce_orders** (flag) — as above, with readOnlyHint true carrying the §1.1 carve-out
explicitly: the call writes one `piiAccessLog` row recording that buyer names and e-mail addresses were
released to the assistant, and no other write.

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
     scopes: ["orders.write"],        // advertised in securitySchemes AND enforced in run()
     permission: { area: "orders", write: true, financial: false, bankFeed: false, ownerOnly: false },
     riskClass: "D",                  // §43 A–E
     minAssurance: 3,                 // WA §15 L1–L3 (channel policy; not on the wire)
     pii: [],                         // categories emitted → recordPiiAccess
     effects: ["customer_message"],   // closed list: customer_message | provider_write | external_fetch | ocr
     domainNeeds: ["orders"],         // what loaders may read, and what freshness the merge may add
     annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
     requiresBehaviourGuard: "status_no_op",   // names the guard the hint depends on; CI checks it exists
     justification: {
       readOnlyHint: "Because the call sets status/designStatus on the order document.",
       destructiveHint: "Because the previous status value is overwritten.",
       idempotentHint: "Because it sets an explicit end state and a repeat with the same values writes nothing, so there is no second history entry and no second customer notification.",
       openWorldHint: "Because a status change triggers the workspace's customer notification, which sends e-mail through NivaDesk's mail provider and SMS through Twilio to the buyer."
     }
   }
   ```

   `assertRegistry()` throws — never warns — when any published entry has a hint that is not
   `typeof "boolean"`, a missing/empty justification
   line, an empty scope list, a scope outside `scopes_supported`, `openWorldHint:false` alongside a
   non-empty `effects`, or `readOnlyHint:true` with a non-empty `pii` whose justification line does not
   mention the access log. `publishedNames(flags)` returns the frozen 19 in order, then `inventory`
   entries, then `orchestrator` entries, only for flags that are on. `annotationsFor(name, flags)`
   returns the four keys in fixed order; `justificationFor`, `scopesFor`, `effectsFor`, `domainNeedsFor`.

2. **`nvMcpOrderToolSchemas()`** keeps every schema literal exactly as it is (bytes matter) but each
   `annotations: { … }` literal becomes `annotations: nvRegistry.annotationsFor("<name>", flags)`. Same
   values flag-off, one source. The `// Tool annotations are always explicit booleans …` comment block
   moves to the registry.

3. **`nvMcpNormalizedAnnotations` → `nvMcpAssertAnnotations`**: no coercion; throws `TypeError` if a hint
   is not a boolean.

4. **`nvMcpOAuthScopesForTool` → `nvRegistry.scopesFor(name)`, and scope becomes enforced.** `run()`
   (§2.4) and the dispatcher refuse a call whose tool needs a scope the token does not carry —
   `context.scope` is captured today (index.js:25473) and never checked. This fixes the two inventory
   tools that fall to the default (`create_inventory_item` advertises `orders.read` for a write) and
   stops it being callable under a read-only grant. No new scope names are introduced
   (`orders.read/write`, `notes.read/write`, `finance.read` cover everything), so the WWW-Authenticate
   challenge and the metadata document do not change. Enforcement is flag-gated with everything else,
   because refusing a call that used to succeed is a behaviour change to the reviewed surface.

   **Built, September 2026, with the rule stated as one sentence: a delegated grant is the whole of what
   that caller may do.** `context.missingScopes` is that rule and is the only place it lives;
   `assertCapability` applies it to the ten and `nvMcpAssertScope` applies it to the 19, over the same
   registry table. A token carrying no scope string is refused everything (the old
   `granted.size > 0 && …` let it through everything), and a caller that legitimately has no grant — a
   member on their own Firebase ID token, `authType: "firebase_session"` — is answered by WHO is asking
   rather than by an empty string: no scope gate, role and area gates unchanged. A default grant smaller
   than the unauthenticated `tools/list` would make advertised tools uncallable, so `nvOAuthDefaultScope()`
   (the registry's `SCOPES_SUPPORTED`) is now the single default at every mint site. See
   docs/mcp-submission-1.2.0.md §5.4 for the flip-day consequence.

5. **`nvMcpAvailableActions()` → `nvRegistry.publishedNames({ inventory: NV_MCP_INVENTORY, orchestrator:
   NV_MCP_ORCHESTRATOR })`**. The dispatcher keeps an explicit `case "<name>"` per tool (the
   `mcp-permissions` source-text assertion depends on it); orchestrator cases are one-liners:
   `return nvOrchestratorRun("get_commerce_overview", context, args);`.

6. **Discovery text is flag-gated, not "safe to change".** With `NV_MCP_ORCHESTRATOR` off,
   `nvMcpServerInfo` still returns `"0.1.0"` and `nvMcpInitializeResult.instructions` is the string
   serving the 1.1.1 connection, byte for byte. With it on: version `"1.2.0"`, and `instructions`
   rewritten to name every domain the list exposes (orders, notes, finance, banking receipts; inventory
   and cross-channel overview when their flags are on), the read/write boundary, the freshness rule
   ("if a response says a sync is behind, say so; never present it as live") and — replacing the line
   revision 1 proposed — an accurate provider/notification boundary:

   > NivaDesk never writes to a connected shop, marketplace, bank or accounting provider from this
   > connection. Changing an order's status is the one action that can reach the customer: the
   > workspace's own notification setting may send them an e-mail or SMS about the new status. Tell the
   > user that before you change a status.

   Revision 1's proposed sentence — §21's model line "does not modify an external provider" used as a
   blanket statement — is dropped from the instructions, because standing alone next to
   `update_order_status` it reads as a claim that nothing leaves the workspace. It stays where it is
   true: on the nine read tools' own descriptions (§7). The unauthenticated `GET /chatgptMcp` document
   gains `tools[].annotationJustification` and `tools[].effects` only when `NV_MCP_ORCHESTRATOR` is on,
   so the probe DURUM.md uses stays identical until the operator flips it.

7. **`functions/scripts/mcp-tools-report.js`** prints the table + justifications from the registry
   (markdown for the release notes) and, with `--compare <url>`, diffs the deployed GET document against
   the registry projection (read-only GET; run by the operator at submission time, §20/§30).

8. **`update_order_status` / `update_note` / `pin_note` / `archive_note` no-op guard** — committed, not
   an operator option. Read the document, and when every requested field already equals the requested
   value, return the current state without writing: no history entry, no `updatedAt` bump, no `source`
   re-stamp, and — the reason it matters most — **no document write, so
   `notifyCustomerOnStatusChange` does not fire**. First calls are unchanged; only exact repeats differ.
   Without this, `idempotentHint:true` is false under §1.1 for a reason nothing in the handler reveals:
   `nvHistoryItem` mints a fresh UUID and `Timestamp.now()` per call, so `arrayUnion` appends rather than
   dedupes. The registry's `requiresBehaviourGuard` names the guard and CI (§5.1) fails if the hint is
   `true` while the guard is missing, so the annotation and the behaviour ship together or neither ships.
   If the operator refuses the guard the answer is not to keep the hint and soften the prose: the entry
   flips to `idempotentHint: false` with the justification "Because a repeat appends a second history
   entry", and the same CI check enforces that pairing too.

9. **`update_order_status` status vocabulary gate** (new in revision 2). `status` and `designStatus` are
   validated case-insensitively against the workspace's own vocabulary —
   `parseStringArrayJSON(companySettings.activeStatusesJSON, ["New","Not Yet","In Progress","Done",
   "Cancelled"])`, the list the order screen and the customer portal already use (index.js:7558, 27767) —
   union the three the order screen always merges (`Not Yet`, `Done`, `Cancelled`). Anything else is
   refused with `invalid-argument` naming the allowed values, and the stored value is the workspace's own
   spelling, not the model's. Rationale: `nvChatGPTUpdateOrderStatus` accepts any free text today
   (`nvCleanString(args.status, 160)`), and a workspace that opted into `everyStatusChange` gets that
   text copied verbatim into a customer SMS by `portalGenericStatusMessage`. That is a prompt-injection
   path from a chat message to a buyer's phone, through a tool annotated workspace-only. The gate closes
   the free-text half; the annotation in §1.3 covers the half that remains, because a legitimate status
   like "Ready to Collect" is *supposed* to notify. Behaviour change to a frozen tool: flag-gated, parity
   test first (§5.3), listed in the release notes as a hardening item.

   **Rejected alternative, recorded because it looks attractive:** suppressing the trigger for
   assistant-originated writes (a `lastWriteSource` marker the trigger skips). It would let
   `openWorldHint:false` stand — and it would mean a status change made from ChatGPT silently does not
   do what the same status change does from the app, which breaks the rule the WhatsApp channel is built
   on (WA §69–§70, "same handler, same semantics") and withholds a notification the workspace
   configured. Parity is the product behaviour; the annotation follows it, not the other way round.

10. **URL fetch guard** (new in revision 2, and why §7 no longer says "SSRF-guarded"). Today
    `nvAssertPublicHttpsUrl` (index.js:24865) is dead code on every path that matters:

    ```js
    const source = chatFileUrl && /^https:\/\//i.test(chatFileUrl) ? chatFileUrl : nvAssertPublicHttpsUrl(linkUrl);   // 24931
    const source = /^https:\/\//i.test(photoUrl) ? photoUrl : nvAssertPublicHttpsUrl(photoUrl);                        // ~24631
    ```

    An `https` URL skips the guard; a non-`https` URL fails the guard on protocol. So the guard never
    blocks a request that would otherwise be made, and `receipt.download_url` / `photo.download_url` are
    plain model-supplied arguments, not a verified file host. `fetch` uses `redirect: "follow"`, and the
    guard itself is hostname-only — no DNS resolution, no IPv6 literals, no re-check after a redirect.
    The fix, in this order:

    - run the guard on **every** URL, whatever its protocol, before any fetch;
    - extend it: reject IPv6 literals and IPv4-mapped forms, resolve the hostname (all addresses) and
      reject any private, loopback, link-local or unique-local result;
    - `redirect: "manual"`, re-running the whole check on each `Location` hop, capped at three;
    - allowlist the ChatGPT file host for `receipt.download_url` / `photo.download_url` so those two
      arguments cannot point anywhere else. **The allowlist entry is not written into code from this
      document**: the exact host is whatever OpenAI's `download_url` resolves to, and inventing it would
      produce a guard that either blocks the feature or admits everything. The operator captures one real
      `download_url` host from a review-workspace call log (§8); until then the first three items are the
      shipping fix and the allowlist is a pending, skipped test rather than a claim.

    e2e coverage in §5.4. Whichever subset ships, §7 states exactly what the guard does — the phrase
    "SSRF-guarded fetch" does not appear again until the guard runs on the request it is named for.

11. **`privacy/accessLog.ACCESS_SOURCES` gains `rest` and `whatsapp`** (`["web","ios","android","mcp",
    "rest","whatsapp","portal","server","unknown"]`), and the actorRole vocabulary is fixed and
    documented in the same file: `chatgpt_connection` (MCP), `rest_client` (`chatgptWorkspaceAction`),
    `whatsapp_binding` (CH-2+), alongside the existing app roles. Without this,
    `pick(input.source, ACCESS_SOURCES, "unknown")` (accessLog.js:113) files a WhatsApp or REST read as
    `unknown` and spec §85.12 ("audit records the source channel") is unmet for two of the three channels
    the orchestrator serves. `chatgptWorkspaceAction` (index.js:26889) stamps `source:"mcp"` today and
    moves to `rest` in the same change.

12. **One shared accounting reader predicate.** `requireReader` (accountingFunctions.js:134) is a closure
    over a callable `request`, not an export, and it is *stricter* than the area predicate:
    `uidIsCompanyOwner || companyData.memberAccess?.[uid]?.bankFeed === true` — the root map only,
    default-deny — whereas `nvRequireBankFeedAccess` (index.js:24669) uses
    `uidCanAccessWorkspaceArea(..., "bankFeed")`, which merges role defaults, inline grants and custom
    roles and passes on `!== false`. Revision 1 said the exported predicate would be reused "so it cannot
    be looser"; there is no export, and the looser one is what the attention summary would have used. The
    fix is a pure function lifted into `functions/accounting/core/access.js`:

    ```js
    function accountingReaderCanRead(companyData, uid) { … }   // the exact expression above, no request
    ```

    `createAccountingFunctions.requireReader` calls it, and so does every accounting-sourced item in the
    orchestrator — `get_accounting_sync_status` in full, and the accounting section of
    `get_business_attention_summary`, which must not fall back to the bankFeed area. Parity test §5.5.

## 2. The orchestrator

### 2.1 Layout

```
functions/orchestrator/
  index.js            createOrchestrator(deps) → { resolveContext, listCapabilities, run, attention, render }
  registry.js         capability table (§1.4); MCP tools/list is a projection of it
  context.js          resolveContext / assertCapability over injected predicates (pure given companyData)
  envelope.js         ok/data/freshness/partial/warnings/entityRefs/suggestedActions/state builder
  freshness.js        per-source thresholds from commerceHealth + connection docs + bank/accounting fields
  channel.js          channelOf(order), CHANNELS, channelAvailability(...)
  money.js            currencyOf(order), per-currency buckets, workspace-currency headline rule
  loaders.js          the ONLY impure module: Firestore reads → snapshot; applies redactForChannel
  attention.js        deterministic detectors → §40 items; severity map; dedupe + batching
  commerce.js         commerceOverview, searchCommerceOrders, channelPerformance
  inventoryMetrics.js summarize(items) lifted from inventory.js closures (callables call it too)
  payouts.js          payout reconciliation, pure, over payout docs + pre-fetched bank windows
  integrationHealth.js rows from connection docs + healthView + cursors + DLQ/review counts
  accountingStatus.js primary writer, phase, honest postings, readiness reasons
  bankAttention.js    §12 rules (uses functions/bank/insights.js, ported from the web client)
  render.js           §13-ordered text; styles "chat" (ChatGPT) and "compact" (WhatsApp)
functions/bank/insights.js           pure port of studioflow-web/lib/studioflow/bankInsights.ts rules
functions/accounting/core/access.js  accountingReaderCanRead(companyData, uid)  (§1.4.12)
```

Rules for the modules:

- **Pure by construction.** Every module except `loaders.js` is `snapshot in → data out` with `nowMs`
  passed explicitly (the style of `commerce/settlements.js`, `commerce/health.js`,
  `bank/classification.js`). Tests build snapshots by hand; no fake Firestore, no `where()`.
- **No module outside `loaders.js` touches Firestore, and no module writes at all.** Two helpers
  revision 1 named break that rule and are replaced:
  - `accounting/core/store.openAttention` is a **writer** — `r.attention.doc(id).set({ status:"open",
    occurrences: (item.occurrences||0)+1, … }, { merge:true })` (store.js:109). Calling it from
    `get_business_attention_summary` or `get_accounting_sync_status` would create or bump an attention
    document on every read, from tools annotated `readOnlyHint:true` — which is exactly the mismatch
    OpenAI rejected 1.1.1 over. The reader is
    `refs(db, cid).attention.where("status","==","open").limit(100)` in `loaders.js`, projected to
    `{ id, connectionId, provider, kind, severity, message, entityRefs, firstSeenAtMs, lastSeenAtMs }`.
  - `settlementMatch.createSettlementMatcher().suggestForPayout` **reads Firestore** per payout
    (settlementMatch.js:127 → `rowsInWindow`). Calling it for 25 payouts from `payouts.js` is 25+
    queries out of a module this design declares pure. Instead `loaders.js` fetches the bank rows
    covering the union of the settlement windows of at most 25 unmatched payouts — one pass over a
    collection it already reads — and `payouts.js` scores them with the pure
    `commerce/settlements.scoreSettlementCandidate`, the same scorer `suggestForPayout` uses, so the two
    agree by construction.
  §5.6 fails the build if any orchestrator file imports `openAttention`, `resolveAttention`,
  `recordAudit` or `settlementMatch`, or if any file but `loaders.js` imports `firebase-admin`.
- **No `require("../index")`.** Predicates that live in index.js (`uidHasCompanyAccess`,
  `uidIsCompanyOwner`, `uidCanAccessWorkspaceArea`, `workspaceMemberRole`, `normalizeWorkspaceRole`,
  `billingEntitlementsForCompany`, `nvRoleCanAccessFinancialInfo`, `recordPiiAccess`) are injected through
  `createOrchestrator(deps)`, the way `createInventoryFunctions` is wired. index.js builds one instance at
  load; the WhatsApp gateway (a later function in the same codebase) builds it with the same deps.
- **Money is always recomputed; the stamp is a cross-check, never the answer.** `finance/engine.js`
  (`ENGINE_VERSION 4`) is pure and the capability already loads `companySettings`, so every capability
  calls `computeOrderFinance(order, settings)` and uses `order.finance` only to compare. Revision 1's
  rule — trust the stamp unless `computedAtMs` is missing or `engineVersion` is behind — serves stale
  money after a settings change: the stamp is rewritten only by the order-write trigger
  (`finance/stamp.js:126`), `financeSweep` refuses to re-run for the same engine version (stamp.js:261,
  `already_swept_for_this_version`), and although `COMPARED` (stamp.js:76-95) includes settings-derived
  outputs (`method`, `taxRate`, `pricesIncludeVat`, `vatRegistered`, `platformFee`, `vatDue`,
  `netProfit`), `settings.feePercentage` itself is stored nowhere on the stamp. So after the owner
  changes the fee percentage or a VAT setting, every order not written since carries the old
  `platformFee`/`vatDue`/`netProfit` and the revision-1 rule would have accepted all of it. The legacy
  `nvChatGPTOrderFinancialsFromData` math is never used (it ignores refunds and `platformFeeKnown`).
  §5.5 pins it: change `feePercentage` in the fixture without touching the stamp, and the capability's
  fee and profit figures must move.
- **Existing helpers, not re-implementations**: classification = `bank/classification.js`; health =
  `commerce/health.healthView(doc, provider, { now, staleAfterMs })`; cursors =
  `commerce/cursors.readCursor`; availability = `commerce/capabilities.getCapabilities/listProviders` +
  `commerce/connectionCapabilities`; settlement scoring = `commerce/settlements.js`; production stage =
  `production.resolveProductionStage`; Pandle readiness = `pandle.js resolveMapping`; accounting reader
  gate = `accounting/core/access.accountingReaderCanRead`; redaction = `privacy/outbound.redactForChannel`.
- **Firestore reads stay single-field** (`where("companyId","==",cid)` on root collections, plain
  subcollection reads, at most one equality on a subcollection) with in-memory filtering;
  `firestore.indexes.json` has no composite index for `siparisler`, `bankTransactions` or
  `inventoryItems`, and a composite `where` returns nothing silently (index.js:29468 comment). Caps:
  orders 1000, bank rows 3000, inventory 2000, payouts 500 per provider, review 200, accounting
  attention 100, receipt inbox 100; hitting a cap sets `<name>Capped` on the snapshot, which becomes
  a `loader_cap_reached` warning (`envelope.capWarnings`) and `partial:true`
  (`envelope.finish`).

### 2.2 Context (input to every capability)

```js
resolveContext({ uid, companyId, authType, scope, channel })
→ {
    uid, companyId, companyRef, companyData,   // companyData is READ HERE, not accepted from the caller
    role,                      // normalizeWorkspaceRole(workspaceMemberRole(...)) — custom roles included
    isOwner,
    areas: { orders, dashboard, customers, financialInfo, bankFeed },   // uidCanAccessWorkspaceArea per area
    accountingReader,                                                   // accountingReaderCanRead(companyData, uid)
    entitlements: billingEntitlementsForCompany(companyData),           // advancedFinanceEnabled, bankFeedEnabled, chatgptAppEnabled, …
    workflowOnly, assignedOnly,                                         // workflowOnly → only assignedToUid === uid
    scope,                                                              // OAuth scopes actually granted; enforced per tool in run()
    settings,                                                           // companySettings: currency, feePercentage, VAT, activeStatuses
    channel: { type: "mcp"|"rest"|"whatsapp"|"app", bindingId, isGroup, profile }  // §65 capability contract
  }
assertCapability(ctx, registryEntry) → void | throws HttpsError("permission-denied" | "failed-precondition")
```

Three corrections to revision 1's version of this block:

1. **`companyData` is read inside `resolveContext`, per run, and a caller-supplied snapshot is ignored
   for authorization.** Revision 1 took `companyData` as an input, which means a gateway that caches the
   company document keeps serving a member whose access was revoked — and WA §13, scenario 3 and §85.11
   all require the revocation to bite on the next request. `resolveContext` takes no caller-supplied
   snapshot at all: injected `loadCompany` must return a document read DURING this request (a caller
   that already read one for the same request may return it, which is what the MCP adapter does), and
   every gate reads that document. A test asserts that a snapshot passed in by the caller reaches no
   gate. There was a `snapshot.companyDataHint` with a confusingly similar name —
   `loaders.snapshotFor` put `ctx.companyData` there "for the handlers to display" — and it is gone:
   no handler ever read it, and what it actually did was carry `members`, `memberAccess`,
   `suspendedMembers` and the billing fields into every pure capability, one careless `...snapshot`
   away from being emitted. A snapshot is what the capability's declared domains read, and nothing
   else.
2. **`companyId` is the caller's resolved authority when the caller has one, and is membership-checked in
   every other case.** Revision 1 said it "never comes from tool arguments". That is overstated:
   `nvRequireChatGPTWorkspaceAccessWithOAuth` uses `oauth.companyId || companyId` (index.js:25448), so a
   token minted without a workspace falls back to the argument, and `chatgptWorkspaceAction`
   (index.js:26889) always takes it from the request body. What is actually true, and what this design
   relies on, is narrower and worth stating precisely: **a supplied `companyId` is a lookup key, never a
   grant** — `uidHasCompanyAccess(companyData, uid)` runs on the resolved document before any read, and
   it honours `suspendedMembers`. Where the token does carry a workspace, the argument is ignored.
3. **`entitlements.chatgptAppEnabled` is carried and checked.** It exists as a plan entitlement (true on
   every plan today, index.js:2074/2105/2138/2175) and is read nowhere. `assertCapability` refuses MCP and
   REST calls when it is false, so a future plan change is honoured without a second code change. The
   WhatsApp channel gets its own entitlement key when CH-2 defines one; until then it is not gated by
   this flag.

`assertCapability` also enforces the registry's `scopes` against `ctx.scope` (§1.4.4) and the channel
profile's assurance level against `entry.minAssurance`.

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
    ordersLastSync: "2026-09-06T09:40:11.000Z" | null,   // oldest successful orders sync across sources that CONTRIBUTED rows;
                                                         // null ONLY when every contributing source is NivaDesk-native
    inventoryLastSync: null,                             // inventory has no sync today (state "unsupported")
    financeLastSync: "2026-09-06T04:02:00.000Z" | null,
    sources: [ { provider, connectionId, entity: "orders"|"inventory"|"finance", lastSuccessAt,
                 staleAfterMs,                           // per source, see the table below
                 state: "fresh"|"stale"|"never"|"unsupported"|"not_visible",
                 contributed: true|false } ]
  },
  partial: false,                          // true when a contributing source was excluded, unreadable, or a loader cap was hit
  warnings: [ { code, message, channel?, connectionId? } ],
  entityRefs: [ { type: "order"|"bankTransaction"|"payout"|"inventoryItem"|"connection"|"note", id, label, url } ],
  suggestedActions: [ { capability, args, label, riskClass, requiresApproval } ],   // references only; nothing executed
  summary: { lines: [ { slot: "result"|"breakdown"|"finance"|"attention"|"next", text } ] }   // §13 order, numbers copied from data
}
```

**Staleness is per source, not one number.** Revision 1's single `staleAfterMs: 21600000` would report an
on-schedule bank feed as behind: `scheduledBankSync` runs `every 8 hours` with a 6-hour minimum interval
(bankFeed.js:55, 826), so anything under ~10h is on time. Each `sources[]` row carries its own:

| source | staleAfterMs | why |
|--------|--------------|-----|
| commerce connection (orders/finance via `healthView`) | 6h | `healthView`'s own default (health.js:60) |
| bank feed (`bankConnections`, `bankTransactions`) | 10h | 8h schedule + 6h minimum interval |
| provider payouts (Square/PayPal settlements) | 10h | they ride the bank sync |
| accounting (QuickBooks/Xero/Pandle) | 24h | own cadence, ledger-day granularity |
| inventory | — | no sync exists; state is `unsupported`, never `stale` |

**`null` means "nothing syncing contributed", not "unknown".** Revision 1 defined `ordersLastSync: null`
as "no syncing channel (NivaDesk-native data is live)", which reads identically to the dangerous case: an
Amazon source whose status is `not_visible` from this surface but whose orders *are* in the answer. The
rule now: a source that contributed rows and cannot report a sync time (`never`, `not_visible`, or an
unreadable status document) sets `partial: true` and a warning naming it, and the top-level `*LastSync`
stays `null` only when every contributing source is NivaDesk-native.

Warning codes (closed list, tested): `channel_not_connected`, `channel_adapter_only` (adapter code
exists, no runtime, and no orders — eBay today), `channel_not_supported` (faire), `channel_excluded_auth`
(needs reconnect), `channel_stale` (older than that source's `staleAfterMs`),
`status_not_visible_from_this_surface` (Amazon zone project), `loader_cap_reached`, `plan_limited`
(basic finance shape / bankFeed plan off), `section_not_permitted` (role lacks the area; the section is
named, its contents are not), `unsupported_metric` (no data model for it, e.g. discounts, listing
mappings), `estimated` (fee or profit figure is an estimate), `mixed_currency` (orders in the range
resolve to more than one currency — §2.5), `tax_needs_review` (at least one order's tax responsibility is
unknown), `needs_review_truncated` (payout candidate scoring stopped at the cap), `source_state_unknown`
(a contributing source's freshness could not be read).

Freshness rule for the renderer (§14): any `sources[]` row with `state: "stale"` produces a `finance` or
`breakdown` line of the form "Amazon finance sync is 8 hours behind, so today's payout total may be
incomplete"; `partial:true` produces a line naming what was excluded and why ("eBay is excluded because
the connection needs reauthorization", WA §67). Nothing in `summary.lines` may contain a number that is
not present in `data` (tested in §5).

**Existing 19 tools, flag-on.** With `NV_MCP_ORCHESTRATOR` off, their results are byte-identical. With it
on, the dispatcher merges `freshness`, `partial` and `warnings` as additional top-level keys onto their
existing flat result (never overriding an existing key). Two consequences revision 1 did not state, and
both go in the release notes:

- `nvMcpToolResult` puts the whole result in `structuredContent` (index.js:25973), so **the reviewed 19
  do change shape flag-on.** §7's "the 19 stay identical" claim is true flag-off and only flag-off.
- The merge is **per-tool, from the registry's `domainNeeds`**, not blanket. `search_notes`,
  `get_note_detail`, `create_note`, `append_note`, `update_note`, `pin_note` and `archive_note` declare
  no synced domain, so they receive `freshness: { generatedAt }` and nothing else, and load nothing extra.
  Order and bank tools receive the sources their own domain touches. Revision 1's blanket merge would
  have added a `commerceHealth` read plus four connection collections to every `search_orders` call —
  latency and cost on a tool under review, for metadata that tool's answer does not depend on.

### 2.4 `run()`

```js
run({ capability, args, ctx, request: { requestId, channelType, providerMessageId, providerConversationId, idempotencyKey } })
```

1. `registry.get(capability)`; refuse unknown names, names whose flag is off, and names whose `scopes`
   are not all in `ctx.scope` (the dispatcher's existing rule, plus the scope check §1.4.4 adds).
2. `assertCapability(ctx, entry)` — before any read (§38 "permission check BEFORE tool call").
3. If `entry.pii.length`, `recordPiiAccess({ actorRole, action: "assistant", source: ctx.channel.type,
   categories: entry.pii, … })` (fire-and-forget, as today), with `actorRole` from the fixed vocabulary in
   §1.4.11 and `source` from the extended `ACCESS_SOURCES`. **This is the only PII-logging mechanism.**
   The dispatcher's hand-written `MCP_ACTIONS_READING_PII` set is gone (September 2026): it named six of
   the 19 by hand and declared a fixed `["name","email","phone","address"]` regardless of what the call
   returns. The set is now derived from `piiAccessLogged`, and each row's `categories` and `subject.kind`
   come from that entry's `pii` and `piiSubject`. Two mechanisms disagreeing about which tools release
   personal data is worse than either alone.

   The MCP surface keeps writing that row in the DISPATCHER rather than in
   `run()` — `recordPiiAccess` is not injected there — so one call cannot file two rows. What IS injected
   is `recordPiiBlock`, for the other half of privacy/outbound.js's third rule: `loaders` applies
   `redactForChannel` to every order and hands each audited decision back (it stays pure and writes
   nothing), `run()` files one row per provider and reason with `recordCount`, rather than one per order
   over a thousand-order read. Without it a marketplace block made by these ten capabilities left no
   trace while the same block made by `search_orders` left one.
4. `loaders.snapshotFor(entry.domainNeeds, ctx)` — reads only what the capability declares; orders are
   redacted at the choke point (`redactForChannel(order, "assistant")`) before any pure module sees them.
5. `handler(snapshot, args, ctx, { nowMs })` → `data`, plus per-capability warnings/refs/suggestions.
6. `freshness.build(snapshot)`, `envelope.finish(...)`, `render.summary(...)`.
7. Emit the audit record (§86) through the injected `audit` sink.

**The audit sink, specified** (revision 1 named none, which left collection, retention and rules open):

- Collection `companies/{companyId}/assistantAudit`, one document per `run()`, id `requestId`.
- Fields: `{ requestId, channelType, providerMessageId, providerConversationId, bindingId, workspaceId,
  userId, groupId, receivedAtMs, intent, orchestratorRoute, toolCalls: [capability], proposalId: null,
  approvalId: null, executionId: null, resultState, responseMessageId, recordsRead: { collection: count },
  factsUsed: [ "…" ] }`.
- `recordsRead` and `factsUsed` are what §54 actually asks for ("what records were read / what facts were
  used"); revision 1 cited §54 as the reason to omit them, which inverts it — §54 forbids **secrets and
  raw credentials**, not provenance. Arguments and result bodies stay out because they carry buyer text
  (§3), and `factsUsed` holds short rule names (`"order_overdue"`, `"stamp_recomputed"`), never values.
- Retention 400 days, swept by the existing retention job, so it outlives a review cycle and a VAT
  quarter without becoming a second copy of the workspace.
- **`firestore.rules`: closed in all three places** (memory "firestore-rules-deny-list") — added to the
  `companies/{cid}` wildcard deny-list, given its own owner-only `match` block, and named in the rules
  test. A new sensitive subcollection closed in only two of the three is readable by every member,
  because the rule set ORs.

Reads carry no `idempotencyKey` behaviour; the parameter is part of the contract so that the CH-4 write
path (WA §43) plugs in without changing signatures.

### 2.5 Capabilities

All ten new tools (see the correction in §0) plus the extended `search_inventory` are risk class A, assurance L1, annotations
true/false/true/false, scope as in §1.2. `companyId` is accepted on every input for consistency with the
schema style of the 19 (`"Optional. Usually omit this…"`) and, per §2.2, is a lookup key that is
membership-checked, never a grant.

#### Shared rules: currency, tax, fees, dates, channels, availability

These are stated once because three of them were undefined in revision 1 and each one silently changes a
headline number.

**Currency (`money.js`, `currencyOf(order)`).** Imported orders keep raw provider-currency amounts —
"currency is recorded for reference only" (index.js:19453), "amounts import as raw numbers, never
converted" (32311) — and the web dashboard's rule is that foreign-currency orders are *shown in their own
rows, never silently converted* (`dashboardOrderCurrency`, dashboard/page.tsx:248-267). Summing raw
numbers across currencies is therefore wrong, and revision 1's single `sales.gross` did exactly that.
Resolution order, matching the dashboard's field lookup exactly:

1. `order.commerce.currency`;
2. `customFields["<Source> Currency"]`, where `<Source>` is matched case-folded against the channel table
   (so `"etsy"` and `"Etsy"` both find `"Etsy Currency"`);
3. `customFields["Currency"]` (what the generic inbound webhook writes);
4. the workspace currency — `companySettings.seciliParaBirimi`, a display symbol defaulting to `"£"`,
   mapped to ISO through the same symbol table the dashboard uses. This step is a **default, not a
   reading**: orders resolved this way are counted in `assumedCurrencyOrders` so a reader can see how
   many.

Rules that follow:

- `sales.gross/refunds/net`, `fees.*`, `profit`, `aov` and every other headline are **workspace currency
  only**, `sales.currency` names it, and `sales.excludedByCurrency: { orders, currencies: [...] }` says
  what was left out.
- `warnings` gains `mixed_currency` whenever any in-range order resolves to a different currency, and the
  renderer must say it: "£12,400 across 96 GBP orders; 4 USD orders are listed separately."
- `sales.currencies: [ { currency, orders, gross, refunds, net } ]` carries **every** currency including
  the workspace one, so nothing is hidden and the rows add up to the order count.
- Channel rows carry `amounts: [ { currency, gross, refunds, feesKnown, feesEstimated } ]` rather than a
  single `gross`; `get_channel_performance` puts `aov` and `profit` inside those per-currency entries.
- Grouped attention amounts are per currency: `facts: [ { key:"amount", value:1842, currency:"GBP" },
  { key:"amount", value:210, currency:"USD" } ]`, and the title reads "8 transactions missing receipts —
  £1,842 and $210". A single summed `facts.amount` is never emitted.
- `unusual_charge` (§12) compares within one currency: the 3× vendor-median rule uses only that vendor's
  rows in the same currency, and the absolute floor is 100 units of that row's own currency. No FX, as a
  deliberate, stated simplification.
- No conversion anywhere. Spec §11 lists currencies and §89 scenario 12 forbids totals differing between
  surfaces; the dashboard does not convert, so neither does this.

**Tax (Engine v4).** `finance/engine.js` computes `taxResponsibility` (`merchant`|`platform`|`unknown`,
lines 370-372), `platformCollectedTax` (388), `taxNeedsReview` (389, true for an Etsy `unknown`), and
separates `revenue` from `customerTotal` (451: `revenue + vatDue + platformCollectedTax` when tax sits on
top). Revision 1 said only "sales.gross sums revenue", which left three questions open and one of them is
a double count. Fixed:

- `sales.gross` = Σ engine `revenue` — **the studio's own revenue**, exclusive of marketplace-collected
  tax, and exclusive of VAT where VAT is added on top rather than included.
- `sales.customerTotal` = Σ `customerTotal` is reported beside it, so "what buyers paid" is available and
  never confused with the studio's take.
- A new `tax` block, on the overview and on each channel row: `{ vatRegistered, vatBase, vatDue,
  platformCollected, needsReview: { count, orderIds ≤20 }, basis: "engine_v4" }`, on both the overview
  and the channel rows only when `entitlements.advancedFinanceEnabled` — the channel row is the same
  figure by another door, and a plan gate that only guards the headline is not a gate. `platformCollected` is
  marketplace tax the platform remits itself — real money the buyer paid, never part of the merchant's
  gross, fees or VAT.
- `needsReview.count > 0` raises warning `tax_needs_review`, and the renderer says which channel ("2 Etsy
  orders do not say who is responsible for the tax").
- Attention detector `order_tax_unknown` (detector table below).
- `search_commerce_orders` row `totals` gains `customerTotal`, and — on a plan with
  `advancedFinanceEnabled` — `vatDue`, `platformCollectedTax`, `taxResponsibility`, `taxNeedsReview`.
  Without it the row keeps what the order took, what is paid and what is left, and the answer carries
  `plan_limited`: `get_order_financials` refuses the same workspace the same figures, and two reads of
  one workspace must not disagree about what its plan includes.

**Fees are never added twice.** `fees.known` (order-level `platformFee` where `platformFeeKnown` — Square
today) and `settlements.<provider>.fee` (the payout's own `totals.fee`) are the same Square money seen at
two different events (§26). No output ever sums them, no renderer line adds them, and the §5.5 fixture
pins it: an order carrying a £5 fee and a payout carrying a £5 fee must not produce "fees £10" anywhere.

**Date basis.** Per order: `paymentDate` when present and parseable, else `createdAt` — the provider's own
placement time for engine orders (`envelopeToOrder.js:119` writes
`paymentDate: new Date(envelope.order.placed_at)`) and the creation time for manual ones. `data.range`
carries `basis` and `basisCounts: { paymentDate, createdAt }`, so a reader sees the mix rather than
guessing. Settlements and payouts use `arrivalDate`, exposed as `data.settlementBasis: "arrivalDate"`.
Without both stated, order counts and settlement totals cover different windows and the 100/95/290
fixture cannot be pinned to a range.

**Channel (`channel.js`, `channelOf(order)`) — one resolver, two surfaces.** Revision 1 mapped
`orderSource === "inbound"` to its own channel and added `inbound` to the source enum, then claimed the
vocabulary matched `test/qa/dashboard-channels.test.js`. It does not: `dashboardOrderChannel`
(dashboard/page.tsx:270-275) knows only shopify/woocommerce/etsy/square/amazon/ebay by
`customFields["Source"]` and files **every** generic-webhook label — Website, Wix, Squarespace, Zapier,
Make — under `manual`; the test pins that at lines 138-145. Two vocabularies means "Manual: N" differs
between ChatGPT and the dashboard for the same range, which is §89 scenario 12 exactly. Resolution:

- `channelOf` returns the dashboard's vocabulary and nothing else:
  `shopify | woocommerce | etsy | square | amazon | ebay | manual`.
- Inbound is a **sub-label under manual**, not a channel: `{ channel: "manual", manualSource: "inbound" |
  "website" | "wix" | "squarespace" | "zapier" | "make" | "chatgpt" | "app" }`. The `source` filter
  accepts `manual` with an optional `manualSource` refinement; `inbound` is removed from the top-level
  enum.
- Precedence: `commerce.provider` (engine-applied: woocommerce, square, amazon) → `etsySource` →
  `customFields["Source"]` matched case-folded against the channel table → `manual` (with `manualSource`
  from `orderSource` / `createdFrom`).
- Returns `{ channel, manualSource, provider, connectionId, externalId, externalUpdatedAt,
  identitySource: "engine"|"legacy"|"manual" }`; the §7/§27 identity fields are carried, never merged,
  never remapped (eBay stays eBay).
- `channel.js` and `dashboardOrderChannel`/`dashboardOrderCurrency` are pinned to **one shared fixture**,
  the way `bank/classification.js` mirrors its client copies: `dashboard-channels.test.js` is extended to
  run both rule sets over the same order list and assert identical output. If they ever need to differ,
  they change in the same commit.

**Channel availability is derived from data, never from a static registry.** Revision 1 defined
`channel_not_available` as "adapter exists, no runtime — amazon, ebay" and said such rows "carry no
numbers". That is wrong for Amazon and would produce a breakdown that does not sum to its own total:
`exports.ingestAmazonEnvelope` (index.js:34228-34252) is live and `commerce/amazon/ingest.js:121` calls
`applyEnvelope(db, envelope, { source: "amazon", mode: "apply" })`, so orders carrying
`commerce.provider: "amazon"` land in this project's `siparisler`. `channelOf` counts them in
`orders.count` and `sales.gross`; a static "not available, no figures" Amazon row hides real data, which
§8/§33.15 forbid as firmly as they forbid fabricated rows. The vocabulary is now:

| value | meaning | carries numbers |
|-------|---------|-----------------|
| `connected` | a connection document exists and its auth status is ok | yes |
| `connected_needs_reconnect` | connection exists, auth needs attention | yes |
| `data_only` | orders with this channel exist in range, but no connection is visible from this surface (Amazon today; also a shop disconnected after its orders arrived) | **yes**, with `freshness.state: "not_visible"` or `"never"`, `partial: true`, and warning `status_not_visible_from_this_surface` (Amazon) or `channel_not_connected` |
| `supported_not_connected` | provider has a runtime, no connection, no orders in range | no |
| `adapter_only` | adapter code exists, no runtime, no orders in range (eBay today) | no |
| `not_supported` | no adapter at all (faire) | no |

The invariant, tested (§5.5): `Σ channels[].orders === orders.count`, and for every currency
`Σ channels[].amounts[currency].gross === sales.currencies[currency].gross`. A channel row exists
whenever orders exist, whatever the connection state. `source: "amazon"` and `source: "ebay"` on
`get_commerce_overview` / `search_commerce_orders` / `get_channel_performance` therefore mean what they
say — filter to the orders that exist — rather than being undefined.

#### get_business_attention_summary (§11, §40, §51) — status: **spec-only today**, no implementation exists (§58.22)

Input: `{ horizonDays?: 1..30 (default 7), domains?: ["orders","shipping","payments","inventory","banking","payouts","accounting","integrations"], limit?: 1..50 (default 20) }`.

Output `data`: `{ counts: { critical, high, medium, low }, sections: [ { id, status: "ok"|"not_permitted"|"not_requested", itemCount } ], items: AttentionItem[] }` where

```js
AttentionItem = { attentionId, contentHash, type, severity: "critical"|"high"|"medium"|"low", title, reason,
                  reasons: [type...],          // merged detector types for the same entity
                  entityRefs: [...], facts: [ { key, value, currency? } ],
                  freshness: { source, lastSuccessAt, state }, suggestedActions: [...],
                  requiresApproval: false, createdAt, resolvedAt: null }
```

Detectors (pure, `attention.js`, each `detect(snapshot, ctx, opts) → items`), with their sources,
severity and escalation. The map is fixed here so the §5.5 severity test has a contract and the WhatsApp
briefing (WA §27–§28) and the Phase 4 engine cannot drift from it:

| type | rule | severity → escalation | source helpers | permission |
|------|------|----------------------|----------------|------------|
| order_overdue | due < now, not completed/cancelled, not dispatched | high → **critical** past 7 days overdue | due-date rule below | orders |
| order_due_soon | due within `horizonDays` | medium → **high** within 72h (spec §40) | same | orders |
| payment_outstanding | remainingAmount > 0 and (dispatched or due ≤ horizon) | high → **critical** when dispatched and > 14 days past due | computeOrderFinance | financialInfo |
| approval_waiting | estimateStatus sent/viewed, or stage blocker `waiting_for_customer_approval` | medium → **high** at 5+ days waiting (spec §40) | production.js, estimates[] | orders |
| shipping_waiting | stage kind `shipready` && !isDispatched | medium → **high** within 72h of due, **critical** past due | production.js + `productionStagesFromSettings` | orders |
| platform_fulfilment_mismatch | commerce.fulfillmentStatus === "fulfilled" && !isDispatched | high | order.commerce | orders |
| provider_state_conflict | commerce.paymentStatus in refunded/partially_refunded/voided while the NivaDesk order is open and shows money received (spec §40 "refund/provider status conflicts with NivaDesk state") | high → **critical** when also undispatched and paid in full | order.commerce + computeOrderFinance | orders + financialInfo |
| shipped_without_tracking | isDispatched && !trackingNumber | low → **medium** after 48h | order | orders |
| order_review_required | commerce.reviewRequired, a row in `commerceReviewQueue`, or `heldIntegrationOrders` | high | commerce/engine REVIEW_COLLECTION | orders |
| order_tax_unknown | engine `taxNeedsReview` (taxResponsibility unknown) | medium | finance/engine | financialInfo |
| stock_low | trackingType quantity, lowStockAt > 0, onHand ≤ lowStockAt | medium → **high** at onHand 0 | inventoryMetrics | orders (inventory gate) |
| stock_reserved_conflict | reservations reference an open order and onHand < reserved | high | inventoryMetrics + orders | orders |
| receipt_missing | spend row, !receiptPath, !receiptNotNeeded | low → **medium** when the oldest row in the group is > 60 days | bank/classification + extended loader | bankFeed |
| transaction_uncategorised | spend row and (!category or categoryAuto) | low, no escalation — nothing in the data distinguishes an urgent uncategorised row, and inventing a count threshold would be a fabricated signal | same | bankFeed |
| receipts_waiting | bankReceiptInbox status "waiting" | low | loader | bankFeed |
| payout_unmatched | payouts.js unmatched | medium → **high** when the oldest is > 14 days | payouts.js | bankFeed |
| bank_connection_attention | bankConnections.syncState in error/needs_reconsent/disconnected | high → **critical** for needs_reconsent/disconnected | loader | bankFeed |
| accounting_attention | open docs in `accountingAttention` | mapped from the stored `severity`: error→high, warning→medium, else low | **reader** on `refs(db,cid).attention` (never `openAttention`) | accountingReader (§1.4.12) |
| accounting_not_ready | pandle mapping errors uncategorised/split/needs_info | low | pandle.js resolveMapping | accountingReader |
| integration_reconnect | connection status needs_reconnect / reconnect_required / uninstalled / needsReauth | critical | integrationHealth.js | orders |
| integration_stale | healthView state stale for orders/finance | medium → **high** beyond 24h | integrationHealth.js | orders |

Spec §40 signals with no data model are declared, not faked: "customer follow-up SLA aşıldı" has no SLA
field anywhere, so the `orders` section reports it as `unsupported` with an `unsupported_metric` warning
rather than inventing a threshold.

**Due date, exactly.** Revision 1's shorthand ("dueDate/deliveryDueDate/deliveryDate else createdAt +
deliveryTime days") makes every dateless order overdue the moment it is created. The rule, matching
`nvChatGPTDueDateMillis` (index.js:23363) and the memory rule that `deliveryTime: 0` means *no date*:

1. explicit `dueDate` → `deliveryDueDate` → `deliveryDate`, the first that parses;
2. otherwise `start = paymentDate ?? createdAt`, and only when `deliveryTime > 0`:
   `start + deliveryTime × 86 400 000`;
3. otherwise **no due date** — the order is neither overdue nor due-soon and appears in neither detector.

**`createdAt` on a detector item** (spec §40 requires it; revision 1 left it undefined) is the time of the
fact that made the item true, never the request time — an item stamped `now` cannot answer "how long has
this been true" and breaks WA §51's "changed since last notification":

- overdue / due-soon → the due date;
- approval_waiting → the estimate's sent-at;
- shipping_waiting → when the order entered the ship-ready stage, else the order's `updatedAt`;
- platform mismatch / provider conflict → `commerce.lastSyncAt` or `externalUpdatedAt`;
- sync, connection and accounting items → the stored `firstSeenAtMs` or the failure time;
- anything else → the entity's own `createdAt`;
- grouped items → the **oldest** member's `createdAt`.

Deterministic first, AI second (§40): no LLM anywhere in this module. Dedupe/batching (§51, §59.6):
order-level detectors merge by `entityRef` into ONE item per order with `reasons[]` and the highest
severity (an overdue order that is also shipping-waiting is one item, not three); row-level detectors
(receipts, uncategorised, payouts, stock) produce ONE grouped item per type with `facts.count`,
per-currency `facts.amount` and up to 20 `entityRefs`.

**`attentionId` is content-stable.** Entity items: `sha1(type + entityType + entityId)`. Grouped items:
`sha1(type + companyId)` — **not** `+ day`, which was revision 1's rule and would have minted a new id for
the same "8 transactions missing receipts" every morning, leaving WA §30 alert deduplication, WA §51
("already notified? / changed since last notification?"), §59.19 (do not reopen an unchanged dismissed
item) and scenario 9 with nothing to key on. What changed is carried separately:
`contentHash = sha1(sorted entity ids)`, so an unchanged group keeps both id and hash, a changed group
keeps its id and moves its hash, and a dismissal can be honoured while a new member is still noticed.

Sections the role cannot see appear as `status: "not_permitted"` with no items (the renderer says
"Banking items are not included for your role", nothing more); a section the CALLER left out of `domains`
is `not_requested`, which is a different sentence — "you did not ask" rather than "we could not tell you"
— and `domains` gates the detectors themselves, so no unrequested section can hand over an item.
`itemCount` counts every item carrying a reason in that section, so a merged overdue-and-unpaid order is
counted under orders and under payments; the counts may therefore sum past `totalItems`, which counts
things to look at rather than section rows. workflowOnly contexts see only orders
assigned to them and no money/banking sections. The server-side Attention Engine (Phase 4) reuses
`attention.collect(snapshot, ctx)` unchanged; only the loader trigger differs.

#### get_commerce_overview (§11, §26)

Input: `{ source?: "all"|"manual"|"shopify"|"etsy"|"woocommerce"|"square"|"amazon"|"ebay"|"faire" (default "all"), manualSource?, fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }` — dates are inclusive UTC calendar days (the legacy `nvChatGPTScopeDateRange` uses server-local time; the new capability does not).

Output `data`:

```js
{ range: { fromDate, toDate, basis: "paymentDate|createdAt", basisCounts: { paymentDate, createdAt } },
  orders: { count },
  sales: { gross, refunds, net, customerTotal, currency,          // workspace currency only
           currencies: [ { currency, orders, gross, refunds, net } ],
           excludedByCurrency: { orders, currencies: [...] }, assumedCurrencyOrders,
           discounts: { available: false, reason: "not_persisted_on_order" },
           shippingIncome: { available: false, reason: "not_persisted_on_order" } },
  tax: { vatRegistered, vatBase, vatDue, platformCollected, needsReview: { count, orderIds }, basis: "engine_v4" },
  fees: { known, knownOrders, estimated, estimatedOrders, unknownOrders, basis: "platformFeeKnown|settings.feePercentage" },
  settlements: { square: { count, gross, fee, net, currency }, paypal: {...}, others: [ { provider, available: false, reason } ] },
  settlementBasis: "arrivalDate",
  fulfilment: { unfulfilled, partial, fulfilled, unknown, dispatched, delivered },
  channels: [ { channel, availability, orders,
                amounts: [ { currency, gross, refunds, feesKnown, feesEstimated } ],
                tax: {...}, freshness } ] }
```

Rules: per-order money always comes from `computeOrderFinance(order, settings)` with `order.finance` used
only as a cross-check (§2.1); currency, tax, fee and date rules as above; `settlements` are reported
separately and never added to `sales` (§26 — sale, payment, fee, refund, payout, bank deposit and
accounting posting are distinct events; the §5.5 fixture has order £100 + payout £95 + bank deposit £95
and asserts gross 100, settlement 95, and that 290 appears nowhere). Discounts and shipping income are
not persisted on orders (`envelopeToOrder.shopOwnedFields` drops them) → `available:false`, warning
`unsupported_metric`, never zero. Fees: `platformFeeKnown` orders (Square) count as known; others use the
workspace's `feePercentage` and are labelled `estimated`. Channel rows follow the availability table —
numbers whenever orders exist. When a connected channel is excluded (needs reconnect, or stale beyond its
own threshold with `source:"all"`), `partial:true` and a warning naming it. Plan: basic plans get
`plan_limited` and only `orders.count`, `sales.gross/refunds`, `fulfilment` (mirrors
`nvChatGPTBasicFinanceLimitation`); advanced plans get fees, tax and settlements.

#### search_commerce_orders (§10, §33.6)

Input:

```js
{ source?, manualSource?, query?,
  workflowStatus?,                        // NivaDesk's own status — matched against the workspace vocabulary
  platformStatus?,                        // the provider's word, matched raw
  fromDate?, toDate?,
  paymentStatus?: "unpaid"|"pending"|"authorized"|"paid"|"partially_paid"|"partially_refunded"|"refunded"|"voided"|"unknown",
  fulfillmentStatus?: "unfulfilled"|"partial"|"fulfilled"|"unknown",
  needsAttention?: boolean, limit?: 1..50 (default 20) }
```

The payment and fulfilment enums are **pinned to the canonical vocabularies** — `commerce/envelope.js:17`
`PAYMENT_STATUSES` and `FULFILLMENT_STATUSES` — not invented. Revision 1 offered `"partial"` as a payment
status, which does not exist, and had no mapping for `pending`, `authorized`, `partially_paid`,
`partially_refunded` or `voided`. And its `status` filter was ambiguous between NivaDesk's workflow status
and the provider's platform status, which §33.6 requires to stay separate; the filter is now two named
fields.

**Manual and legacy orders**, which revision 1 left undefined, derive their provider-shaped statuses
rather than reporting a hole:

- an order with a `commerce` block uses it verbatim;
- an order without one derives `paymentStatus` from money: `remaining <= 0 && paid > 0` → `paid`;
  `paid > 0 && remaining > 0` → `partially_paid`; `paid === 0` → `unpaid`;
  `refunded >= paid && paid > 0` → `refunded`; anything else → `unknown`;
- `fulfillmentStatus` derives from `isDelivered || isDispatched` → `fulfilled`, else `unfulfilled`;
- `platformStatus` is `null` for manual orders — it is the provider's word and there is no provider.
  `null` is not `"unknown"`, and the row says which with `platformStatusSource: "none"`.

Output row (every field separate, §33.6):

```js
{ orderId, orderNumber, projectNumber,
  channel, manualSource, provider, connectionId, connectionName, externalOrderId, externalAdminUrl,
  platformStatus, platformStatusSource,   // provider's word, or null / "none"
  paymentStatus, fulfillmentStatus,
  workflow: { status, designStatus, stage, isDispatched, isDelivered, dueDate },   // NivaDesk's word
  totals: { grandTotal, paid, remaining, refunded, customerTotal, currency,      // only with Financial permission
            vatDue, platformCollectedTax, taxResponsibility, taxNeedsReview },    // and only on advancedFinanceEnabled
  customer: { name, email } | { restricted: true, reason: "provider_pii_policy" },
  needsAttention: { reviewRequired, reasons: [] },
  lastSyncAt, freshness: { state } }
```

Reads the same `siparisler` query as `search_orders` (companyId only, cap 1000, workflowOnly →
assignedToUid), filters in memory. `query` matches the same fields as `search_orders` plus
`externalOrderId` / `commerce.orderNumber` / `etsySource.receiptId` — and, per §3, **not** the free-text
fields (`notes`, `historyLog`) whose contents are buyer-authored. PII: rows pass through
`redactForChannel(order, "assistant")` in the loader; `pii: ["name","email"]` → `recordPiiAccess`.

**Multiple matches are not a problem state.** Revision 1 returned `state: "needs_attention"` with
`data.choices[]` whenever more than one entity matched, which would render every ordinary multi-row search
as something needing human intervention — `needs_attention` is the §25/§45 lifecycle state for exactly
that. A search that finds twelve orders returns `state: "completed"` and twelve rows. Ambiguity is
reported only on **single-entity resolution paths** ("how much does the Cousins order still owe", WA §65)
through a dedicated field:

```js
data.resolution = { ambiguous: true, choices: [ { entityType, id, label } ] }   // state stays "completed"
```

#### get_channel_performance (§11)

Input: `{ fromDate, toDate, channels?: [...] }`. Output per channel:

```js
{ channel, availability, orders,
  amounts: [ { currency, gross, refunds, aov,
               fees: { known, estimated },
               profit: { value, basis: "known"|"estimated"|"unavailable", costCoverage: 0..1 } } ],
  tax: {...}, settlement: { available, matched, unmatched }, fulfilment: {...}, freshness }
```

`profit.value` is a definite number only when `costCoverage === 1` (every order in that currency bucket
has `directCost` from `watchPurchasePrice` or line items); otherwise `basis:"estimated"` with the coverage
figure and warning `estimated`, or `unavailable` at zero coverage (§11: "with missing cost data profit
must not be given as a definite number"). Settlement state only for square/paypal; others
`available:false`. Faire is not a provider anywhere in the code (`commerce/envelope.js PROVIDERS` =
shopify, etsy, woocommerce, inbound, square, amazon, ebay) → `not_supported`.

#### get_inventory_overview (§11)

Input: `{ location?, category? }`. Output: `{ counts: { items, matched, offShelf, lowStock, reserved,
incoming, available, customerOwned }, value: { cost, currency }, lowStock: [ { itemId, name, onHand, lowStockAt, supplierName } ]
(≤25), reservedForOpenOrders: [...], channelAllocation: { supported: false, reason: "no_listing_mapping" },
syncMismatch: { supported: false, … }, oversellRisk: { supported: false, … }, multiChannelListings: {
supported: false, … }, sourceOfTruth: "nivadesk" }`. The numbers come from
`inventoryMetrics.summarize(items, { nowMs })`, lifted from the `getInventorySummary` (inventory.js:546)
and `getInventoryReport` (1033) closures; ONE population per heading — `items` is the workshop's own stock
(on the shelf or incoming), `matched` is every row the filters selected whatever its status, and
`matched = items + offShelf + customerOwned`. "Low stock" has one definition (`inventoryMetrics.isLowStock`)
used by the count, the list and the `stock_low` attention item, so a customer's own item can never be in
the list while being absent from the count beside it; those callables are changed to call the pure module so the app
and the assistant cannot drift (parity test). No product↔listing mapping collection exists, so the four
channel keys are `supported:false` with one `unsupported_metric` warning, not zeros. Inventory has no
sync, so its freshness row is `state: "unsupported"` and `inventoryLastSync` is `null`.

#### search_inventory (existing hidden tool, extended)

Adds `status`, `lowStock`, `reserved`, `location` and `category` to the input schema. The `status` enum is
the runtime's own `ITEM_STATUSES` (inventory.js:43): `available`, `partiallyReserved`, `reserved`,
`incoming`, `used`, `sold`, `removed`, `archived` — not a paraphrase. SKU stays a search field, not an
identity (§27). Gate unchanged.

**As shipped, with two deliberate differences from the paragraph above.** The extension rides
`NV_MCP_ORCHESTRATOR`, not `NV_MCP_INVENTORY`, because everything new on this branch does and the
inventory-only listing has to stay byte-identical to what it already publishes; with that flag on, the
tool IS the orchestrator capability. And `channel` / `mappingIssue` are **not** declared on the schema:
the handler still answers them with `unsupported_metric` for any caller that sends them, but advertising
two inputs that can only ever return nothing invites a model to use them. This is also where the
implementation had drifted furthest from the plan — the extension had been built as a *second* tool,
`search_inventory_items`, rather than as an extension of this one. It is one tool again;
`docs/mcp-inventory-search-decision.md` has the comparison and the decision.

#### get_payout_reconciliation_overview (§11)

Input: `{ provider?: "all"|"square"|"paypal"|…, fromDate?, toDate? }`. Output: `{ totals: { matched,
partial, unmatched, notMatchable, needsReview }, settlementBasis: "arrivalDate", providers: [ { provider,
available, inRange, matched, partial, unmatched, notMatchable, needsReview, unmatchedAmount, currency,
oldestUnmatchedAt, freshness } ],
unmatched: [ { payoutId, provider, amount, currency, arrivalDate, candidateCount } ] (≤25) }`.

Sources: `companies/{cid}/squarePayouts` and `paypalPayouts` (`status`, `amount`, `currency`,
`arrivalDate`, `totals{gross,fee,refunds,net}`, `bankMatch{transactionId,confidence,method,amountDelta}`).
`matched` = `bankMatch.transactionId` set and `amountDelta === 0`; `partial` = matched with
`amountDelta ≠ 0`; `unmatched` = status in `MATCHABLE_STATUSES` and no match; `notMatchable` = any other
status, money that has not left the processor and therefore cannot be on a statement. Excluding those from
the MATCH counts is right; dropping them from every counter was not, because
`matched + partial + unmatched` then did not add up to the payouts in range and nothing said why.
`inRange` is the total they account for, and the renderer says how many have not been sent yet.

`needsReview` is not persisted today (the audit counter in `settlementMatch.matchProviderPayouts` is
discarded), so it is computed here — but **not** by calling `suggestForPayout`, which reads Firestore per
payout and would put 25 queries inside a module this design declares pure (§2.1). `loaders.js` fetches the
bank rows covering the union of the settlement windows of at most 25 unmatched payouts, and `payouts.js`
scores them with `commerce/settlements.scoreSettlementCandidate` — the same scorer `suggestForPayout`
uses. **`needsReview` is defined as ambiguity, precisely**: more than one candidate scores as an exact
match for the same payout, which is what `matchProviderPayouts` itself treats as ambiguous and refuses to
auto-match. One exact candidate is a match waiting to be confirmed, not a review. Beyond the 25-payout
cap, `needsReview: null` with warning `needs_review_truncated` (now in the §2.3 closed list, which
revision 1 omitted).

Phase 2 follow-up (separate commit, e2e-tested): persist `matchState` on the payout doc during sync, at
which point this recomputation goes away. Amazon settlements, eBay/Faire/Shopify payouts and Etsy finance
→ `available:false` with the registry reason (Etsy `financial_ledger.read` is false). An operational match
is never described as the accounting provider's reconciliation (§6.2) — the renderer's wording is "matched
with a bank line", never "reconciled".

#### get_integration_health (§11)

Input: `{ provider? }`. Output rows:

```js
{ provider, connectionId, account,                          // shop domain / store name / account label, never a token
  authStatus: "ok"|"reconnect_required"|"pending"|"disconnected"|"not_visible",
  ordersFreshness, inventoryFreshness, financeFreshness,    // { state, lastSuccessAt, lagMs, staleAfterMs }
  retries, deadLetters, reviewCount,                        // §11 asks for retries AND a DLQ/review count
  lastSuccessfulSync, reconnectRequired,
  mode: "read_only"|"limited"|"full",                       // commerce/capabilities + connectionCapabilities
  connectionKnown,                                          // does this row stand for a connection that exists?
  availability }                                            // the §2.5 availability vocabulary
```

Beside the rows: `{ count, considered, needsReconnect }`. `count` is connections this workspace actually
has — rows with a connection document, plus Amazon when its own orders prove the connection exists, since
its status is deliberately unreadable from here. `considered` is how many channels the answer looked at,
which is what a row-count measures: an unconnected channel still gets a row so the reader can see it was
checked. Reporting the second number as the first told an empty workspace it had six connections.

`reviewCount` (missing from revision 1, required by §11) counts the root `commerceReviewQueue`
(`commerce/engine.js:18` `REVIEW_COLLECTION`) `where("companyId","==",cid)`, grouped by
`provider`/`connectionId`, plus `companies/{cid}/heldIntegrationOrders`, attributed by the `provider`
`holdIntegrationOrder` writes on each held document, reported as `reviewCount: { queue, held }`. Held
orders belonging to no connection row — the generic inbound path — appear in `heldForReview:
{ total, unattributed }` beside the rows, and the renderer says how many orders are waiting: they are
unimported sales, not error rows, and reading the collection without reporting it is a read paid for and
thrown away. Those documents carry `customerName` (engine.js:147) — the
loader projects it away before anything else sees the row (§3).

Loaders: `shopifyStores`, `etsyConnections`, `wooConnections`, `squareConnections` (root, where companyId;
only the fields their `publicView` helpers expose), `companies/{cid}/bankConnections` (banks + PayPal;
`syncState`, `lastSyncedAt`, `consentExpiresAt`), `accountingConnections` + Pandle, root `commerceHealth`
(`healthView(doc, provider, { now, staleAfterMs: 6h })`), `commerceCursors` (Shopify reconcile only),
`commerceEvents` dead/retrying counts. Etsy never writes `commerceHealth`, so its freshness comes from
`etsyConnections.lastSuccessAt` — pairing healthView with the connection doc is mandatory or Etsy reports
a false "never". Amazon: connection status lives in the `nivadesk-amazon` project and is only readable as
`amazon-caller@`, which `chatgptMcp` is not → row `authStatus:"not_visible"` with warning
`status_not_visible_from_this_surface`; if Amazon orders exist in the workspace the *commerce* row for
Amazon is nonetheless `data_only` and carries figures (§2.5), because a status being invisible does not
make the sales invisible. eBay: adapter and registry only, no runtime → `adapter_only` while no eBay
orders exist, `data_only` the moment any do. Bank rows need the bankFeed area, accounting rows the
`accountingReaderCanRead` predicate, commerce rows the orders area.

#### get_accounting_sync_status (§11)

Input: `{}`. Output: `{ phase: "read_only", primaryWriter: { provider, connectionId } | null,
conflict: boolean, connections: [ { provider, mode, health, writeBoundaryDate, lastSyncAt } ],
postings: { prepared, approved, queued, synced, failed, conflict } each `{ value: 0, available: false,
reason: "postings_not_implemented" }` while `accountingPostings` is never written (Faz 3–7),
attention: [ { id, kind, severity, message, entityRefs } ], readiness: { ready, notReady: { uncategorised,
split, needsInfo, unreviewed }, mappingSource: "workspace"|"default" } }`. Attention rows come from the **reader** on `refs(db,cid).attention`
filtered `status == "open"` (§2.1), never from `store.openAttention`. Readiness is per bank transaction
using `pandle.js resolveMapping` rules and `BANK_REVIEW_STATUSES`, against the workspace's own
NivaDesk-category → ledger-account map — `companies/{cid}/pandleConnection/main.mappings`, the one
document that map lives in. It is NOT on the accounting connection, and the QuickBooks/Xero
`accountingMappings/{connId}` document is keyed by semantic account ("product_sales", "cogs") rather
than by bank category, so it cannot answer this question. A workspace that has confirmed no map of its
own is measured against `DEFAULT_MAPPINGS`, and `readiness.mappingSource` says which of the two answered
— "ready to be prepared" is a claim about one specific map. Gate:
`accountingReaderCanRead(companyData, uid)` (§1.4.12), the same predicate the accounting callables use —
stricter than the bankFeed area and never substituted for it. The `phase` flag is what stops "0 failed"
from reading as "all synced"; the renderer says "Ledger posting is not switched on yet; NivaDesk is
preparing records only". The AI never acts as the accountant (§39.7): no wording implies a filing or a
formal reconciliation.

#### get_banking_attention_summary (§12)

Input: `{ fromDate?, toDate?, limit? }`. Output: `{ items: AttentionItem[] (grouped per type), counts:
{...}, connection: { syncState, lastSyncedAt, consentExpiresAt } }` with types `transaction_uncategorised`,
`receipt_missing`, `possible_duplicate`, `unusual_charge`, `recurring_price_changed`,
`possible_cancelled_subscription`, `possible_transfer`, `payout_unmatched`, `order_link_suggestion`.
The last two are NOT implemented on this capability today and are declared as `unsupported_metric`
warnings rather than omitted silently: it reads bank rows only (declared domains settings, bank,
receiptInbox, connections) and cannot reach the payout collections, while `suggestOrderLink` /
`rankOrdersForTransaction` were never ported into `functions/bank/insights.js`. `payout_unmatched` IS
reported by get_business_attention_summary, so without the warning the banking-specific question returned
strictly less than the general one and said nothing about it — a finding nobody looked for reads exactly
like one that came back clean.
Rules in `functions/bank/insights.js`, a pure port of `studioflow-web/lib/studioflow/bankInsights.ts`
(`detectPossibleDuplicates`, `detectRecurringSpends` with price change/active, `suggestOrderLink` /
`rankOrdersForTransaction`, `suggestCategory`) with a shared fixture test so the two copies agree, the way
`bank/classification.js` mirrors its client copies. Two rules have no source anywhere and are defined here
deterministically: `unusual_charge` = spend > 3× the vendor's median over its last 12 rows **in the same
currency** and > 100 units of that currency; `possible_transfer` = an outgoing and an incoming row with
equal absolute amount within 2 days on different `accountId`s and no `incomingKind` already set to
transfer. `nvLoadBankTransactions`'s projection is extended (additively) with `receiptNotNeeded`,
`categoryAuto`, `reviewStatus`, `accountId`, `provider`, `settlement`, `linkedOrderId`, `splits`, and the
loader additionally reads `companies/{cid}/bankReceiptInbox` for `receipts_waiting` — a read the existing
bank tools do not perform. `receiptNotNeeded` also fixes the known over-count in `spendingWithoutReceipt`.

PII: this capability's registry `pii` is `["name"]`, not empty. Bank rows carry `counterparty`, which on a
person-to-person payment is a person, and `linkedOrderLabel`, which can be a customer's name — the
existing `search_bank_transactions` returns it today, outside `redactForChannel`, which only covers order
documents. Both are treated as person-bearing: `order_link_suggestion` items carry the order id and the
order's number, never `linkedOrderLabel`, and `counterparty` is emitted only to contexts with the bankFeed
area and is recorded in the access log.

### 2.6 Renderer (§13)

`render.summary(envelope, { style })` produces `summary.lines` in fixed slot order — result → breakdown →
finance/banking status → attention → next action — omitting empty slots. Style `chat` joins them into the
`content[0].text` of the MCP result (replacing the JSON dump that `nvMcpToolContentFromResult` emits for
the tools it has no summary for, but only for the new tools; existing tools' text is unchanged flag-off).
Style `compact` numbers items and truncates to the channel's `rendering.long_text` limit (WA §38) — the
same data, a different presentation; totals cannot differ between styles (§89 scenario 12, tested). Every
number in a line is copied from `data` (the test extracts numerals and checks membership), and no line may
contain provider- or buyer-authored free text (§3).

## 3. Permission and PII rules per capability

Gates are the existing predicates, injected; the orchestrator never reads a role from arguments and never
loosens an app gate. A `companyId` from the model or the channel is a lookup key, never authorization
(§23, §2.2).

| Capability | Membership | Area / role gate | Plan | workflowOnly | PII emitted | Notes |
|------------|-----------|------------------|------|--------------|-------------|-------|
| get_business_attention_summary | uidHasCompanyAccess on a freshly read company doc | orders area for order/shipping/inventory/integration sections; financialInfo for payments; bankFeed area for banking/payouts; **accountingReaderCanRead for accounting** | none refused; `plan_limited` warning when bankFeedEnabled is false | only assigned orders; no money/banking sections | none (titles use order number/design/channel, never the customer, never buyer text) | sections not permitted are named, not filled |
| get_commerce_overview | same | `nvRoleCanAccessFinancialInfo` (owner true; custom roles by access.financialInfo; viewOnly/workflowOnly false) | basic vs advanced shape (`nvChatGPTHasAdvancedFinance`) | refused (no financial access) | none | |
| search_commerce_orders | same | `nvRequireOrdersArea`; money fields only with financialInfo | — | assignedToUid filter | name, email via `redactForChannel(order,"assistant")`; `pii: ["name","email"]` | Amazon/eBay/unknown provider rows return `customer.restricted:true`; no reveal grant on this surface |
| get_channel_performance | same | financialInfo | advanced only; basic → `plan_limited` with counts/gross only | refused | none | |
| get_inventory_overview, search_inventory | same | `nvRequireInventoryAccess` (owner, or orders area + canFullyEditOrder) — kept as the existing MCP gate; it is stricter than the app's read gate and is documented as such; loosening is an owner decision, not a side effect | — | refused unless canFullyEditOrder | none (supplierName is a business) | |
| get_payout_reconciliation_overview | same | `nvRequireBankFeedAccess` (owner or bankFeed area) | no refusal for reads; `plan_limited` warning | refused | none | confirm/unlink stay owner-only and are not exposed |
| get_integration_health | same | orders area for commerce rows; bankFeed area for bank rows; accountingReaderCanRead for accounting rows; owner all | — | commerce rows only | none; `account` is a shop domain/store label; tokens never loaded (loaders read `publicView` fields only); `commerceReviewQueue.customerName` projected away | |
| get_accounting_sync_status | same | `accountingReaderCanRead(companyData, uid)` — the lifted predicate the accounting callables use (owner OR `memberAccess[uid].bankFeed === true`), **not** the looser `bankFeed` area | — | refused | none | |
| get_banking_attention_summary | same | `nvRequireBankFeedAccess` | `plan_limited` warning | refused | `pii: ["name"]` — counterparty on P2P rows, linkedOrderLabel | order_link_suggestion refs carry order ids and numbers, never the order's label |

Why bank reads are not plan-refused: the plan gates live sync and connection (`bankFeed.js requireOwner`),
the existing three bank tools gate on role only, and the OpenAI review workspace has `bankFeedEnabled:false`
with seeded demo rows; refusing reads would break the reviewer's banking test cases and diverge from the
19. The plan state is surfaced as a warning instead.

PII rules (§22, memory "amazon-pii-isolation-layer", "told which order, asks before who"):

1. Redaction happens once, in `loaders.js`, at the read of `siparisler`, with
   `privacy/outbound.redactForChannel(order, "assistant")`; pure modules never see raw buyer fields.
   `loaders.js` is the only file under `functions/orchestrator/` allowed to read `siparisler`, and a test
   enforces both facts (§5.6).
2. **`redactForChannel` covers the labelled PII fields only, and buyer-authored free text is not among
   them.** `PII_FIELD_CATEGORIES` (outbound.js:174) lists `customerName`, `shippingName`, `emailAddress`,
   phones and address fields — it does not touch `notes`, `designName`, `historyLog` or `customFields`.
   Engine orders carry `notes: envelope.order.buyer_note` (`envelopeToOrder.js:136`), `designName` from
   provider line-item names, `historyLog` entries including "Special Notes", and arbitrary `customFields`;
   the existing projection (`nvSafeOrderForChatGPT`, index.js:23200-23222) returns `notes` and
   `historyLog` for every provider. So a restricted eBay or unknown-provider row can still name the buyer
   through the buyer's own note, and the §5.6 call-graph guard — which keys on
   `customerName|emailAddress|phone|address|customer` — would not catch it. This design declares those
   fields **provider- and buyer-authored untrusted text** and treats them accordingly:
   - never in `summary.lines`, `entityRefs.label` or `suggestedActions.label`;
   - where a capability must show one (an order row's design name), it is length-capped at 120 characters
     and quote-fenced by the renderer, so it reads as quoted data rather than instruction;
   - `notes` and `historyLog` are **stripped entirely** on rows `redactForChannel` marked restricted — a
     row that will not name the buyer must not carry the buyer's own sentence either;
   - `query` in `search_commerce_orders` does not search them (§2.5);
   - the §5.6 guard regex is extended to `notes|buyerNote|buyer_note|historyLog|designName|customFields`
     alongside the person fields.
   This is the same surface twice over: it is where a buyer's name leaks, and it is where a prompt
   injection would arrive.
3. `companies/{cid}/restrictedCustomer` is never read by any orchestrator module (grep-enforced), and no
   reveal-grant callable is on the MCP path in this phase; the row says `restricted:true` and the renderer
   says "the buyer details for this Amazon order are held separately" — it names the order, not the
   person.
4. Attention items, overviews, health rows and payout rows contain no person fields by construction; the
   outbound-pii call-graph guard is extended from `function nvChatGPT*` bodies to
   `functions/orchestrator/**` so any module that emits a person field or an untrusted-text field fails
   the test unless the value came through the loader.
5. Channel profile redaction (§65, §72, WA §93.22–23): `ctx.channel.profile.security.pii_level:"none"`
   strips `customer` even for allowed providers; `financial_data_allowed:false` strips `totals`, money
   facts and the whole finance/banking sections (group chats default to both). Applied inside
   `envelope.finish`, so a channel cannot forget it.
6. `recordPiiAccess` source is the channel type, never a phone number or display name (§68, §85.1).
   `mcp` and `rest` are in `ACCESS_SOURCES`; `whatsapp` is NOT (see the correction above), so a WhatsApp
   row normalises to `unknown` and the channel survives in `note` as `channel=whatsapp`. `actorRole` is
   derived from the channel type through `orchestrator.ACTOR_ROLES` — the field is free text in
   `accessLog.js` and there is no enforced vocabulary behind it, so the derivation is the control. The
   audit record (§2.4) carries provenance but never arguments, result bodies or tokens.
7. No secrets in any argument or result (§22): loaders read connection docs through the same field
   projections as the app's `publicView` helpers; a test asserts no orchestrator output key or string
   matches `/token|secret|refresh|access_key|password/i`.

## 4. WhatsApp reuse contract (what the gateway needs, §62–§92, WA §7–§47)

The WhatsApp gateway is a later function (spec §88 Phase CH-2+). It must be writable without touching any
module in this document except to call it. What `functions/orchestrator/index.js` guarantees:

1. **Registry as the capability source** (WA §14, §81): `listCapabilities({ flags, channelProfile })`
   returns the registry projection filtered by flag and by the profile's `capabilities` (read /
   internal_write / external_write / file_upload / …) and `security.assurance_level ≥ minAssurance`. MCP
   tools/list is the `mcp` projection of the same table; WhatsApp gets the `whatsapp` projection. No
   WhatsApp-specific tool set exists (§81). `update_order_status`'s class D / L3 registration is what
   keeps it out of a low-assurance binding and behind approval in a high-assurance one.
2. **Context resolution per request** (§69, WA §13): the gateway resolves binding → user, then calls
   `resolveContext({ uid, companyId, channel })`. **The orchestrator reads `companies/{cid}` itself on
   every run and ignores any snapshot the gateway is holding** (§2.2) — membership, role, areas,
   entitlements and `suspendedMembers` are re-derived per call, so a revoked permission bites on the next
   request (WA scenario 3, §85.11) even when the gateway caches.
3. **Same handler, same semantics** (WA §69–§70, and the shared-semantics rule in orchestration spec §87):
   `run("update_order_status", …)` from WhatsApp executes the same transition logic, validation, status
   vocabulary gate, permission check, audit, idempotency **and customer notification** as from ChatGPT.
   The registry's annotations describe that shared handler, so a tool cannot be read-only on MCP and
   mutate from WhatsApp — and the notification effect that makes `openWorldHint` true on MCP is
   inherited, not re-litigated. Existing write handlers are adapted behind `run()` in CH-4, not
   duplicated.
4. **Envelope, not presentation** (§65, §82, §89): `run()` returns the §2.3 envelope; the gateway renders
   `summary.lines` with `render.summary(envelope, { style: "compact" })` (numbered list, WA §38) or its own
   renderer over `data`. Totals and states come from `data` and cannot differ from ChatGPT's answer.
5. **Attention Engine as shared source** (WA §27–§28, §68): the daily briefing and the on-demand summary
   call `attention.collect(snapshot, ctx, { horizonDays: 2 })`; integration health calls
   `run("get_integration_health")`. Same ids, same severities, same dedupe — and because grouped
   `attentionId`s are content-stable rather than day-scoped (§2.5), "already notified" and "changed since
   last notification" have something to key on.
6. **Request metadata and idempotency hooks** (WA §42–§43, §85.7–8): `run()` accepts `request.{requestId,
   channelType, providerMessageId, providerConversationId, idempotencyKey}`; the gateway dedupes inbound
   events on `provider + providerMessageId` before calling; write capabilities (CH-4) use
   `idempotencyKey` so a duplicate delivery yields no second note/status/attachment — and, for a status,
   no second customer message.
7. **Audit sink** (§86): every `run()` emits the §2.4 record to `companies/{cid}/assistantAudit`; the
   gateway supplies `binding_id`, `group_id`, `provider_*` and later `response_message_id`. The channel
   type is recorded honestly because `ACCESS_SOURCES` and the actorRole vocabulary include `whatsapp`
   (§1.4.11).
8. **Ambiguity is a result, not a guess** (WA §65, §89 scenario 2): single-entity resolution paths return
   `data.resolution = { ambiguous: true, choices: [...] }` with `state: "completed"`; the gateway shows the
   choices. A multi-row search is not ambiguity and is not marked `needs_attention` (§2.5).
   Cross-workspace ambiguity is never resolved silently (context carries one `companyId`).
9. **Reserved interfaces (not implemented in this phase; signatures fixed so CH-3/CH-4 do not change the
   contract):**
   - `continuation.get/set(ctx, { activeWorkspaceId, lastSearchResultIds[], lastOpenedEntity,
     pendingProposalId, pendingFileMatchId, paginationCursor, expiresAt })` — UX state, never truth (WA §40–§41).
   - `pendingFileMatch.create/select(ctx, { id, workspaceId, userId, channelBindingId, fileAssetId,
     documentType, extractedMerchant, extractedAmount, extractedDate, candidateTransactionIds[], confidence,
     state, expiresAt })` — the channel-agnostic continuation of `attach_bank_receipt`'s candidates step:
     the file already stored under `bank_receipts/_inbox` is the `fileAssetId`, "2" or "the Cousins one"
     selects a candidate, the candidate is re-read before `assignInboxReceipt`, and the user is never
     asked to upload again (§6.1, §74, WA §22–§23).
   - `proposals.prepare/approve/revalidate/execute(ctx, ActionProposal)` with the WA §45 fields and the
     WA §44 state machine; allowlisted typed `actionType`s only (§48); revalidation on approval invalidates
     a proposal whose `beforeState` no longer matches (WA §47); an ambiguous "yes" never approves a
     class-D/E action (§85.15) — which now includes `update_order_status`.
10. **No double counting across channels** (WA §90): the same `commerce.js`, `money.js` and `payouts.js`
    produce the figures; there is no WhatsApp-side arithmetic.

If adding WhatsApp requires changing anything in `commerce.js`, `attention.js`, `payouts.js` or the gates,
the abstraction is wrong (WA §71) and the fix goes into the orchestrator, not the channel.

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
  `minAssurance` ∈ 1–3; `permission` and `domainNeeds` present.
- **`openWorldHint` and `effects` agree**: any entry with a non-empty `effects` has `openWorldHint: true`,
  and any entry with `openWorldHint: true` names at least one effect. This is the check that would have
  caught `update_order_status`.
- **`readOnlyHint` and `pii` agree**: any entry with `readOnlyHint: true` and a non-empty `pii` has a
  `readOnlyHint` justification line mentioning the access log (§1.1's carve-out is stated on the tool, not
  only in prose).
- **`idempotentHint` and its guard agree**: any entry with `requiresBehaviourGuard` set has
  `idempotentHint: true` **and** the named guard present in the handler source; a write tool with
  `idempotentHint: true` must declare a guard. Flipping either alone fails.
- `assertRegistry()` throws on a mutated copy with `readOnlyHint: null`, a missing justification, an
  unknown scope, an effect without openWorld, or a guard-less idempotent write.
- No entry named like an internal/test action; every published name has a `case` in the dispatcher (kept
  from `mcp-permissions`); no name outside the registry appears in `nvMcpOrderToolSchemas()`.
- The served `annotations` for every tool deep-equal `annotationsFor(name, flags)`.

### 5.2 tools/list snapshot (§20)

`test/qa/mcp-tools-list-snapshot.test.js` with fixtures under `test/fixtures/mcp/`:
- `tools-list.1.1.1.json` = the exact `nvMcpToolsWithSecuritySchemes()` output **with every flag off** (19
  tools, names, order, descriptions, input schemas, annotations, `securitySchemes`, `_meta`), recorded
  from the current code before any change and compared with `JSON.stringify` equality, so the list serving
  the live review connection cannot drift by a character.
- `tools-list.1.2.0.json` = the flag-on projection, and **it is the reviewed list**. It differs from 1.1.1
  by more than nine appended tools, and the diff is release-notes content: two annotation values
  (`create_order`, `update_order_status` openWorldHint false→true), the `attach_bank_receipt` description
  string (which `NV_MCP_INVENTORY` already rewrites at index.js ~26615-26652 by appending the "use
  create_inventory_item instead" sentence, and which `NV_MCP_EMAIL_RECEIPTS` rewrites again along with its
  input schema), `serverInfo.version`, and `instructions`.
- `tools-list.inventory.json`, `tools-list.orchestrator.json` for the intermediate projections (order: 19,
  then inventory, then orchestrator).
- `initialize.instructions` mentions every domain present in the served list for that flag state, and the
  flag-on string contains the notification sentence (§1.4.6).
- Flags are read in-process through `publishedNames(flags)`, so `mcp-inventory.test.js` is rewritten to
  the same mechanism and its source-slicing of `nvMcpOrderToolSchemas` is dropped in the same commit.

### 5.3 Parity for the existing 19 (§2, §29)

`test/qa/mcp-parity.test.js` — with the flag off, the dispatcher's results for each of the 19 over the
existing fake-Firestore harness (`mcp-permissions.test.js` style) equal fixtures recorded before this
change; with the flag on, results are a strict superset, and only by the per-tool `freshness`/`partial`/
`warnings` the tool's `domainNeeds` justify — a notes tool gains `freshness.generatedAt` and nothing else,
and loads nothing extra. Role matrix (owner / admin / member without bankFeed / viewOnly / workflowOnly /
custom role with financialInfo) for the finance stripping and the Orders switch, kept from
`mcp-permissions`. Plus, for the three behaviour changes:
- no-op guard: a first call is unchanged in every field; an exact repeat writes nothing;
- status vocabulary gate: a status in the workspace list is accepted and stored in the workspace's
  spelling; a status outside it is refused with `invalid-argument`; a workspace with no
  `activeStatusesJSON` accepts the five defaults;
- scope enforcement: a token without `orders.write` cannot call `create_inventory_item`.

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
- **Notification parity, replacing revision 1's "no outbound document is created" test.** That test would
  have passed for two reasons that have nothing to do with the truth: the functions emulator is not in the
  `--only` list, so the trigger never runs, and the fixture carried no `portalAutoUpdates`/`emailAddress`,
  which is one of the few cases the trigger skips. It is a test that asserts the bug (memory rule), and it
  would have been quoted at a reviewer. What is tested instead is the decision function —
  `notifyCustomerOnStatusChange`'s gate logic lifted into a pure helper and called directly:
  - order with `portalAutoUpdates: { enabled: false }` → no send, from either channel;
  - order with no `portalAutoUpdates` block and an `emailAddress` → **send** (the default), and the
    decision is byte-identical whether the status was written by the app or by
    `nvChatGPTUpdateOrderStatus`;
  - the same order with `everyStatusChange` on → the generic message body, asserting its text contains
    only a status drawn from the workspace vocabulary (the §1.4.9 gate), never arbitrary input.
  The contract asserted is **channel parity**, not absence: a status change from ChatGPT does exactly what
  a status change from the app does, and the annotation says so.
- URL guard (§1.4.10): `http://`, an IP literal, `localhost`, `169.254.169.254`,
  `metadata.google.internal`, an IPv6 literal, and a public host that redirects to a private one are all
  refused before any body is read; a plain public https document is fetched. The ChatGPT-file-host
  allowlist case is written and `skip`ped until the operator supplies the real host (§8), so it shows as
  pending rather than passing vacuously.

### 5.5 Orchestrator units (one file per capability, fake snapshots)

- `orchestrator-context.test.js` — permission matrix (role × capability) using the predicates exported
  from index.js; a supplied `companyId` is membership-checked and never a grant; suspended member refused;
  **a stale caller-supplied `companyData` is ignored and the freshly read document decides**;
  `chatgptAppEnabled:false` refuses; scope enforcement per tool; workflowOnly sees only assigned orders;
  channel profile group mode strips money and customer; `recordPiiAccess` is called with
  `source: "whatsapp"` and `source: "rest"` and those values survive `accessEntry` (they would be
  `unknown` without §1.4.11).
- `accounting-reader-parity.test.js` — `accountingReaderCanRead` and the accounting callables' own gate
  admit exactly the same (companyData, uid) pairs, including the cases where the bankFeed *area* predicate
  would admit and the accounting reader must not (inline grant, custom role, role default).
- `orchestrator-envelope.test.js` — required keys; state vocabulary closed; `queued`/`executing` never
  rendered as completed; warning codes closed list (including `mixed_currency`, `tax_needs_review`,
  `needs_review_truncated`, `source_state_unknown`); per-source `staleAfterMs` (a bank feed 7h old is
  `fresh`, a commerce connection 7h old is `stale`); a `not_visible` source that contributed rows sets
  `partial:true` and never leaves `ordersLastSync: null` reading as live.
- `orchestrator-channel.test.js` — `channelOf` precedence and identity preservation (amazon/ebay never
  remapped; Shopify legacy `customFields.Source` resolved; chatgpt-created → `manual` with
  `manualSource:"chatgpt"`; Website/Wix/Squarespace/Zapier/Make → `manual`); **shared fixture with
  `dashboard-channels.test.js`: the server resolver and `dashboardOrderChannel` produce identical channel
  counts, and `currencyOf` matches `dashboardOrderCurrency`, over the same order list.**
- `orchestrator-money.test.js` — GBP + USD orders: headline totals are GBP only, `currencies[]` carries
  both, `excludedByCurrency` names USD, `mixed_currency` is warned, and no line anywhere adds the two;
  `assumedCurrencyOrders` counts the orders that fell through to the workspace default; per-currency AOV
  and per-currency grouped attention amounts.
- `orchestrator-attention.test.js` — each detector on a fixture; an order that is overdue + shipping
  waiting + unpaid is ONE item with three reasons; 8 missing receipts are ONE item with count 8 and
  per-currency amounts; **the full severity/escalation table asserted row by row**; `createdAt` is the
  fact's time, never `now`, and a grouped item takes the oldest member's; **a group whose members are
  unchanged keeps its `attentionId` and `contentHash` across two days, and adding a member moves the hash
  but not the id**; a dateless order (`deliveryTime: 0`, no explicit date) appears in neither overdue nor
  due-soon; approval waiting 5 days escalates; a delivery 48h away escalates; a provider `refunded`
  against an open paid order raises `provider_state_conflict`; sections not permitted are named and empty;
  horizon parameter.
- `orchestrator-commerce.test.js` — the triple-count fixture (order £100, payout £95, bank deposit £95 →
  gross 100, settlement 95, 290 absent); **the fee fixture (order fee £5 + payout fee £5 → "fees £10"
  appears nowhere)**; refunds separate from gross; known vs estimated fees; discounts `available:false`;
  **`Σ channels[].orders === orders.count` and per-currency channel sums equal `sales.currencies`**; an
  Amazon order present with no visible connection produces a `data_only` row **with figures** plus
  `status_not_visible_from_this_surface`, and eBay with no orders produces `adapter_only` with none; UTC
  inclusive range and `basisCounts`; basic vs advanced shape; **a `feePercentage` change with an untouched
  stamp moves the fee and profit figures** (the stamp is a cross-check, not the answer); tax: gross
  excludes `platformCollectedTax`, `customerTotal` is reported separately, an Etsy `unknown` raises
  `tax_needs_review`.
- `orchestrator-search-commerce.test.js` — every §33.6 field separate; provider status ≠ workflow status
  and the two filters are distinct; the payment/fulfilment enums equal `commerce/envelope.js`'s sets
  exactly (the test imports them, so a vocabulary change breaks the test rather than the product);
  manual-order derivation of paymentStatus/fulfillmentStatus and `platformStatus: null`; Amazon row
  `restricted:true` **with `notes` and `historyLog` absent**; a multi-row result is `state:"completed"`,
  and only a single-entity lookup sets `data.resolution.ambiguous`; limit.
- `orchestrator-channel-performance.test.js` — profit definite only at full cost coverage, estimated with
  coverage, unavailable at zero, per currency; AOV per currency; faire `not_supported`.
- `orchestrator-inventory.test.js` — `inventoryMetrics.summarize` equals the numbers the existing
  `getInventorySummary`/`getInventoryReport` closures produce on the same fixture (parity before the
  callables switch to the module); unsupported channel keys; `search_inventory` new filters and the
  `ITEM_STATUSES` enum; SKU is not identity (two items, same SKU, both returned).
- `orchestrator-payouts.test.js` — matched/partial/unmatched; **`needsReview` is exactly "more than one
  exact-amount candidate", matching what `matchProviderPayouts` calls ambiguous, and one exact candidate
  is not a review**; truncation sets `needs_review_truncated`; unmatched amounts never appear in any
  revenue figure; provider rows for absent providers; **`payouts.js` is called with pre-fetched bank rows
  and performs no Firestore access** (the module is required with a `db` that throws).
- `orchestrator-integration-health.test.js` — Etsy freshness from the connection doc, not from healthView
  "never"; Amazon `not_visible` status beside a `data_only` commerce row; eBay `adapter_only`;
  `reviewCount` from `commerceReviewQueue` + `heldIntegrationOrders`, grouped by connection, with
  `customerName` absent from every row; reconnect flags per provider status vocabulary; per-source stale
  thresholds; no token-like keys in any row.
- `orchestrator-accounting.test.js` — `phase:"read_only"`, postings `available:false`; primary writer and
  conflict; readiness reasons from Pandle mapping rules; open attention items **read, not opened** (the
  test runs with a `db` whose `set` throws, so an accidental write fails the test).
- `bank-insights.test.js` — duplicates, recurring price change, cancelled subscription, transfer, unusual
  charge thresholds **scoped per currency**, order link ranking; shared fixture with the web copy
  (`studioflow-web/lib/studioflow/bankInsights.ts`) so the two implementations agree.
- `orchestrator-render.test.js` — slot order; every numeral in `summary.lines` exists in `data`; **no line
  contains `notes`, `historyLog`, `designName` or `customFields` text**; stale/partial wording; chat vs
  compact styles give identical totals.

### 5.6 PII, purity and secrets guards

- Extend `test/qa/outbound-pii-policy.test.js`: the call-graph scan covers `functions/orchestrator/**`;
  any function emitting `customerName|emailAddress|phone|address|customer|notes|buyerNote|buyer_note|
  historyLog|designName|customFields` must be fed by `loaders.js`; `loaders.js` is the only orchestrator
  file reading `siparisler` and calls `redactForChannel` before returning; restricted rows carry no
  `notes`/`historyLog`; no orchestrator file mentions `restrictedCustomer`.
- **New purity guard**: no file under `functions/orchestrator/` other than `loaders.js` imports
  `firebase-admin`, and **no orchestrator file at all** imports `openAttention`, `resolveAttention`,
  `recordAudit` or `settlementMatch`. This is the check that would have stopped a `readOnlyHint:true`
  capability from bumping attention documents on every read.
- Extend `test/qa/access-control-policy.test.js`: `functions/orchestrator/**` never requires
  `commerce/adapters/amazon` or `functions-amazon`.
- `orchestrator-no-secrets.test.js`: run every capability on a snapshot whose connection docs contain
  token-like fields; assert no output key or string value matches `/token|secret|refresh|password/i`.
- `firestore.rules` test: a non-owner member cannot read `companies/{cid}/assistantAudit`, and the
  collection is present in the wildcard deny-list (all three places, memory rule).

### 5.7 Guide

`guide-corpus-fresh.test.js` (unchanged: rebuild must match), `guide-platform-tags.test.js`, and new
questions in `guide-retrieval.test.js` ("what can ChatGPT see", "ChatGPT'de neleri sorabilirim", "attach
receipt from ChatGPT", "does ChatGPT message my customers") that must retrieve the ChatGPT chapter. Plus a
string assertion that the corpus contains no sentence claiming the assistant does not contact customers
(§6).

### 5.8 Submission-time checks (§20, §30) — manual, operator

`node functions/scripts/mcp-tools-report.js --compare https://mcp.nivadesk.app/chatgptMcp` (read-only GET)
must print zero differences between the deployed list and the registry projection for the flag state that
was deployed; the markdown it prints is pasted into the release notes. `test/e2e/chatgpt-oauth-http.mjs`
stays manual (needs the functions emulator; not globbed by `run-e2e.sh`) and gains a tools/list assertion
against `tools-list.1.2.0.json`.

## 6. Guide entries (EN + TR)

Guide rule (memory "guide-bot-explain-rule"): `para` = what it is for (public), `bullets` = how (members),
in `studioflow-web/lib/publicSite/guide.ts` `TREE_EN` and `TREE_TR` with the same section id; then
`node functions/assistant/buildGuideCorpus.js`, commit `guideCorpus.json`, `guidePublicCorpus.json`,
`guideTree.json`; the seven assistant functions are deployed by the operator, followed by a live-bot probe.

**A correction that is not optional and is not gated by any flag:** revision 1's Step A told users the
assistant "does not send messages to your customers". That is false today, for the 19 tools that are live
right now, and the bot would repeat it to someone deciding whether to let an assistant touch their orders.
The replacement text below — a new "When your customer hears about it" section and a rewritten "What it
will not do" — lands with the next guide rebuild whether or not the orchestrator flag is ever flipped.

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
  { kind: "sub", text: "When your customer hears about it" },
  { kind: "bullets", items: [
    "Changing an order's status from ChatGPT is the same action as changing it in the app, and it can reach your customer the same way: if the order has automatic updates on — which is the default for orders that carry an email address — NivaDesk emails them about the new status, and sends an SMS too where you have SMS switched on. ChatGPT can only choose from the statuses your workspace already uses, and it should tell you before it changes one.",
    "You control this per order with the customer updates switch, and for the whole workspace under Settings ▸ Notifications. Turning automatic updates off for an order means no message goes out however the status is changed."
  ] },
  { kind: "sub", text: "What it will not do" },
  { kind: "bullets", items: [
    "It does not change anything in Shopify, Etsy, WooCommerce, Square, Amazon or eBay, and it does not write to your bank or your accounting software. It cannot write a message of its own to a customer either — the only thing that reaches them is your workspace's own status update, in your workspace's own words.",
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
  { kind: "sub", text: "Müşteriniz ne zaman haber alır" },
  { kind: "bullets", items: [
    "Bir siparişin durumunu ChatGPT'den değiştirmek, uygulamadan değiştirmekle aynı işlemdir ve müşterinize aynı şekilde ulaşabilir: siparişte otomatik güncellemeler açıksa — e-posta adresi olan siparişlerde varsayılan olarak açıktır — NivaDesk yeni durumu e-postayla bildirir, SMS'i açtıysanız SMS de gönderir. ChatGPT yalnızca çalışma alanınızın hâlihazırda kullandığı durumlardan birini seçebilir ve bir durumu değiştirmeden önce size söylemelidir.",
    "Bunu sipariş bazında müşteri güncellemeleri anahtarından, çalışma alanı genelinde Settings ▸ Notifications altından yönetirsiniz. Bir siparişte otomatik güncellemeleri kapatmak, durum nasıl değiştirilirse değiştirilsin mesaj gitmemesi demektir."
  ] },
  { kind: "sub", text: "Yapmayacakları" },
  { kind: "bullets", items: [
    "Shopify, Etsy, WooCommerce, Square, Amazon ya da eBay'de hiçbir şeyi değiştirmez; bankanıza veya muhasebe yazılımınıza yazmaz. Müşterinize kendi cümlesiyle bir mesaj da yazamaz — müşteriye ulaşan tek şey çalışma alanınızın kendi durum bildirimidir, kendi kelimelerinizle.",
    "Bir rakam geride kalmış bir mağaza ya da banka senkronuna bağlıysa yanıt bunu söyler; eski sayıları canlıymış gibi sunmaz."
  ] }
] }
```

**Step B (lands in the same commit that flips `NIVADESK_MCP_ORCHESTRATOR` / `NIVADESK_MCP_INVENTORY`):**
add to `chatgpt-app` under "What you can ask":

EN
```
"Across your channels: how many orders this month and where they came from (Shopify, Etsy, WooCommerce, Square, Amazon, manual); the sales, refunds and known platform fees of each channel; payouts and whether they have been matched with a bank line; orders that need attention because a shop shows them shipped while NivaDesk is still waiting. Channels you have not connected are named as not connected rather than counted as zero — but if orders from a channel are in your workspace they are counted, even when NivaDesk cannot see that connection's status from here. Orders in another currency are listed in their own rows, never converted into your workspace currency.",
"What needs attention today: overdue and due-soon orders, approvals and shipments waiting, low stock, receipts missing, uncategorised bank lines, unmatched payouts, connections that need reconnecting — one list, each item once, with the sync time behind it.",
"Connections and bookkeeping: whether each shop, bank and accounting connection is healthy and when it last synced; what is prepared for Pandle, Xero or QuickBooks and why a record is not ready yet. NivaDesk prepares; your accountant decides.",
"Inventory: stock overview, low-stock items and reserved items; search by name, SKU, serial, location or status; add an item from a photo after you confirm what it is."
```

TR
```
"Kanallarınız genelinde: bu ay kaç sipariş geldi ve nereden (Shopify, Etsy, WooCommerce, Square, Amazon, elle); her kanalın satışı, iadeleri ve bilinen platform ücretleri; ödemeler (payout) ve banka satırıyla eşlenip eşlenmediği; mağaza gönderildi derken NivaDesk'in hâlâ beklediği siparişler. Bağlamadığınız kanallar sıfır sayılmaz, bağlı değil diye söylenir — ama bir kanalın siparişleri çalışma alanınızdaysa, NivaDesk o bağlantının durumunu buradan göremese bile o siparişler sayılır. Başka para birimindeki siparişler kendi satırlarında listelenir, çalışma alanı para birimine çevrilmez.",
"Bugün nelere bakılmalı: gecikmiş ve yaklaşan siparişler, bekleyen onaylar ve gönderiler, düşük stok, eksik fişler, kategorisiz banka satırları, eşlenmemiş ödemeler, yeniden bağlanması gereken bağlantılar — tek liste, her madde bir kez, arkasında senkron zamanıyla.",
"Bağlantılar ve defter: her mağaza, banka ve muhasebe bağlantısının sağlıklı olup olmadığı ve en son ne zaman senkronlandığı; Pandle, Xero ya da QuickBooks için nelerin hazırlandığı ve bir kaydın neden henüz hazır olmadığı. NivaDesk hazırlar; kararı muhasebeciniz verir.",
"Envanter: stok özeti, düşük stoklu ve rezerve ürünler; ad, SKU, seri, konum ya da duruma göre arama; ne olduğunu onayladıktan sonra fotoğraftan ürün ekleme."
```

Both steps: rebuild the corpus, run the three guide tests, and add retrieval questions (§5.7). The public
marketing copy (`translations.ts aiPage.*`) is not part of the guide rule and is left to the operator —
but it carries the same "does not message your customers" claim in places and must be checked against
this section's correction before the next marketing edit.

## 7. OpenAI submission 1.2.0

History: 1.0.0 published; 1.1.0 rejected (test-case customer name + annotations); 1.1.1 submitted 22 Aug
after commit 68222996 and rejected on the annotation/justification wording (§1). 1.2.0 is the next version
and the annotation justification is its release blocker.

### Tool descriptions for the new tools (§21, §30) — ten are published; the tenth is the inventory search, described with the extended `search_inventory` below (see §0)

On the wire, part of the catalogue freeze, and validated by CI — so they are written here rather than left
to implementation. Each follows §21: what it does, when to use it, the read/write boundary, the provider
boundary.

- **get_business_attention_summary** — "List everything in this NivaDesk workspace that needs a person's
  attention right now: overdue and upcoming orders, approvals and shipments waiting, low stock, missing
  receipts, uncategorised bank lines, unmatched payouts and connections that need reconnecting. Use it for
  'what should I look at today'. Read-only: it changes nothing and does not modify an external provider.
  Items the user's role cannot see are named as not included, never filled with zeros."
- **get_commerce_overview** — "Sales across every channel for a date range: order count, sales, refunds,
  platform fees, tax and settlement totals, broken down by channel and by currency. Use it for 'how did
  this month go' or 'how much came from Etsy'. Read-only over NivaDesk's own records; it does not call
  Shopify, Etsy, WooCommerce, Square, Amazon or eBay and does not modify an external provider. Channels
  that are not connected are named, not counted as zero; amounts in other currencies are listed separately
  and never converted."
- **search_commerce_orders** — "Find orders across every channel with the provider's own status and
  NivaDesk's workflow status side by side. Use it when the question involves where an order came from,
  what the shop says about it, or what it still owes. Read-only; it does not modify an external provider.
  Buyer details for marketplaces that restrict them are returned as restricted."
- **get_channel_performance** — "Compare channels over a date range: orders, sales, average order value,
  refunds, known and estimated fees, profit where cost data covers it, and settlement state. Use it for
  'which channel is actually worth it'. Read-only; it does not modify an external provider. Profit is
  given as a definite number only when every order in that group has a cost."
- **get_inventory_overview** — "Stock position for the workspace: item counts, low stock, reserved and
  incoming, and total stock value. Use it before ordering materials or promising a delivery date.
  Read-only; NivaDesk is the source of truth for stock and this tool does not read or modify a shop's
  listings."
- **get_payout_reconciliation_overview** — "Marketplace and processor payouts and whether each has been
  matched with a bank line: Square and PayPal today. Use it for 'has Square paid me' or 'what has not
  landed'. Read-only; it does not call the processor and does not modify an external provider. A match
  with a bank line is an operational match, not an accountant's reconciliation."
- **get_integration_health** — "The state of each connected shop, bank and accounting connection: whether
  it needs reconnecting, when it last synced each kind of data, and how many items are retrying, dead or
  waiting for review. Use it when figures look wrong or an order has not arrived. Read-only; it reports
  what the last sync recorded and does not modify an external provider. A connection whose status this
  surface cannot read is reported as not visible rather than as healthy."
- **get_accounting_sync_status** — "What NivaDesk has prepared for the workspace's accounting software
  (QuickBooks, Xero, Pandle), which connection is the primary writer, and what is not ready to post yet
  and why. Use it before a bookkeeping session. Read-only; ledger posting is not switched on, so nothing
  is written to the accounting provider and no filing or reconciliation is performed."
- **get_banking_attention_summary** — "Bank lines that need a person: uncategorised spending, missing
  receipts, possible duplicates, unusual charges, recurring costs whose price changed, likely transfers
  between the owner's own accounts, and unmatched payouts. Use it for 'what needs sorting in the bank
  feed'. Read-only over already-imported rows; it does not contact the bank and does not modify an
  external provider."

The extended `search_inventory` keeps its description and gains the filter list, with the `status` values
named explicitly (`available`, `partiallyReserved`, `reserved`, `incoming`, `used`, `sold`, `removed`,
`archived`).

### What changes

1. **Annotations**: the four hints now come from one registry with literal booleans, are asserted at load
   (no coercion), and every tool carries four "Because…" lines. **Two values change from what is live**,
   and that is the headline of the release notes rather than a footnote: `create_order` and
   `update_order_status` move `openWorldHint` from `false` to `true`, because a status a workspace has
   configured for automatic updates sends the customer an e-mail — and an SMS where SMS is enabled — via
   `notifyCustomerOnStatusChange`. The notes carry the §1.1 definitions, the full §1.3 text, and an
   explicit answer to the 1.1.1 message: "every hint is a literal boolean in source and on the wire; the
   deployed list was diffed against the registry with `mcp-tools-report.js --compare`; the two `verify`
   cases OpenAI could not see (`update_*` idempotency and `attach_bank_receipt` retry) are decided by the
   emulator behaviour tests in §5.4; and one hint we previously shipped as `false` was wrong, which we
   found by tracing the tool's effect rather than its handler."
2. **Runtime behaviour corrections**, each with a parity test: the `update_order_status` / `update_note` /
   `pin_note` / `archive_note` no-op guard (§1.4.8) so `idempotentHint:true` is true under the strict
   definition; the `update_order_status` status vocabulary gate (§1.4.9); the URL fetch guard (§1.4.10);
   OAuth scope enforcement per tool, which also corrects `create_inventory_item` from `orders.read` to
   `orders.write` (§1.4.4).
3. **Audit and access-log corrections**: `ACCESS_SOURCES` gains `rest` and `whatsapp`,
   `chatgptWorkspaceAction` stops stamping its REST reads as `mcp`, and the orchestrator audit record gets
   a named collection, retention and rules entry (§2.4). `MCP_ACTIONS_READING_PII` has already been
   replaced by the registry's `pii`/`piiSubject`, on the merged branch rather than at the flag flip,
   because it corrects what an audit row CLAIMS rather than adding one.
4. **Discovery text**: serverInfo `1.2.0` and the rewritten `instructions` — both flag-gated so the live
   1.1.1 connection is unaffected until the operator deploys the submission (§1.4.6).
5. **Nine new tools** with the descriptions above, plus the two inventory tools and the extended
   `search_inventory` filters.
6. **Tools exposed** — decided by the operator at flip time, and only via flags:
   `NIVADESK_MCP_EMAIL_RECEIPTS=1` (receiptUrl/emailReceipt inputs on `attach_bank_receipt`),
   `NIVADESK_MCP_INVENTORY=1` (2 tools), `NIVADESK_MCP_ORCHESTRATOR=1` (9 tools plus the discovery and
   annotation changes). The list OpenAI reviews is whichever projection was deployed, and
   `mcp-tools-report.js --compare` proves it. Recommended: all three on, one submission, so the reviewer
   sees the finished 30-tool surface once — and, more importantly, so the corrected annotations are what
   they review.
7. **Test cases**: the five 1.1.1 cases re-run on the review account (customer exactly "OpenAI Review Test
   Customer"; ESET row `demo-acc_demo006` reset to no receipt); new cases for
   `get_business_attention_summary`, `get_commerce_overview` and `get_integration_health` on the review
   workspace (manual orders only → channel rows named as not connected, health rows for the demo bank
   connection), so the reviewer sees honest degrade; and one case exercising `update_order_status` on an
   order with automatic updates **off**, so the reviewer can see the notification boundary without the
   review workspace mailing a test address.
8. **Guide** Step A (immediately, including the corrected customer-notification text) and Step B (with the
   flip), plus the corpus rebuild.

### What stays

- **Flag-off, the 19 tool names, order, input schemas, descriptions and annotation values are
  byte-identical** — pinned by `tools-list.1.1.1.json`. Flag-on they are not, and the release notes say so
  plainly: two annotation values change, `attach_bank_receipt`'s description is rewritten by
  `NV_MCP_INVENTORY` (index.js ~26615-26652) and its description and input schema again by
  `NV_MCP_EMAIL_RECEIPTS`, and every result gains `freshness`/`partial`/`warnings` inside
  `structuredContent`. `tools-list.1.2.0.json` is the reviewed artefact.
- The `attach_bank_receipt` flow (§6.1): single strong match attaches; several return candidates +
  `inboxPath`; second call with `transactionId` + `inboxPath` and no re-upload; no match with amount →
  queued; owner-only; `_meta["openai/fileParams"]:["receipt"]`. The download is guarded per §1.4.10 and is
  described by what the guard actually does — not as "SSRF-guarded", which was never true on the https
  path.
- Orders/Notes/Finance behaviour and gates (workflowOnly/viewOnly finance stripping, Orders switch, hidden
  tools not dispatchable).
- OAuth and discovery surface: `mcp.nivadesk.app`, `.well-known` routes, DCR-only, PKCE, redirect-URI
  registry, 401 challenge with `scope="orders.read notes.read finance.read"` (no new scope names), 405 on
  SSE GET, 202 on notifications, the `openai-apps-challenge` file.
- The review workspace, its connection/token and demo rows; the production flag values until the operator
  flips them.
- PII policy: no path returns customer fields outside `redactForChannel`; `restrictedCustomer` never
  serialised; Amazon/eBay only as canonical records with `order_source` preserved.
- No per-provider or per-agent tools (§10, §48); no generic action tool (§57); no external *provider*
  write from ChatGPT in this version (Phase 5 territory) — the customer notification is the workspace's
  own, not a provider mutation, and is annotated rather than added.

## 8. Open decisions for the operator

Everything that was a design question in revision 1 and that an annotation depends on has been decided in
the document, because a submission-blocking hint cannot wait on a decision. What is left needs the
operator's judgement or information the code does not hold:

1. **Accept the `readOnlyHint` audit carve-out as the position given to OpenAI** (§1.1): six live read
   tools and `search_commerce_orders` write one `piiAccessLog` row per call, and we call them read-only
   because that row records the read rather than changing workspace state. The alternative is flipping
   seven `readOnlyHint`s to `false`, which is defensible under a literal reading of spec §16 and would
   make every read tool look mutating to the model. Recommendation: keep the carve-out, stated on each
   tool.
2. **The ChatGPT file host for the fetch allowlist** (§1.4.10): supply one real `download_url` host from a
   review-workspace call log so `receipt`/`photo` can be pinned to it. Until then the guard ships without
   the allowlist and its test is pending rather than passing.
3. **Flip order for 1.2.0**: all three flags together (recommended — the corrected annotations only reach
   the wire with `NV_MCP_ORCHESTRATOR`) or inventory + email first, which leaves the two known-wrong
   `openWorldHint` values live for longer.
4. **Persist `matchState` on payout docs during settlement sync** (Phase 2) so `needsReview` is not
   recomputed per request and the 25-payout cap goes away.
5. **Mirror Amazon connection status into the main project** (`companies/{cid}/amazonStatus`, written by
   the zone) so `get_integration_health` can show it. Until then the status row says `not_visible` while
   the commerce row still carries Amazon's real numbers (§2.5).
6. **Whether `get_inventory_overview` should use the app's looser read gate** (orders area) instead of the
   MCP's existing `canFullyEditOrder` requirement.
7. **Moving the four ChatGPT bullets** out of `set-client-domain` into the new `chatgpt-app` section.
8. **Whether the workspace-wide default for `portalAutoUpdates` should stay `enabled: true`** now that an
   assistant can trigger it. This is a product question, not an MCP one — the default predates the
   connection and applies equally to the app — but it is the single setting that decides how often a
   ChatGPT status change reaches a buyer, so it belongs on this list.
