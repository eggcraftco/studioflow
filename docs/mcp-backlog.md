# MCP 1.2.0 — backlog

The non-blocking half of the final gate. The verdict is in `docs/mcp-final-gate-result.md`.

**That verdict is now PASS**, re-measured at `01e5ab6c` on 7 September 2026. B2–B9 — the nine findings
this file was first written beside, minus B1 — are closed and each closure was re-verified against the
code. B1, the SSRF finding on the assistant's file-fetch paths, is out of scope by operator instruction:
it is being assessed on its own branch in another worktree, and nothing here or in the gate result says
anything about its status.

Nothing here argues against that verdict. Six kinds of entry: what was verified and holds — recorded so
the negatives are not read as unchecked — the eight findings of §2, real but not refusing the branch, each
with what closing it would take, §4, what the money removal of 7 September walked past, §5, what the
documentation pass that followed it walked past, and §6, what the deterministic parity gate noticed and
did not act on. Read them as the list the next change is measured against.

- Repository: `/Users/gocmen/Developer/studioflow-mcp`, branch `mcp-orchestration`
- Commit: `3f68dc88` for §1–§3; §4 was added against the tree after the money removal, §5 after the
  documentation pass that closed the last of B2–B9, §6 at `01e5ab6c` after the parity gate
- Date: 7 September 2026

---

## 1. Invariant verification evidence — all four hold

Everything in this section was measured by running code, not by reading it. The tree was clean at
`3f68dc88` before and after; `cd functions && npm test` exits 0 with 1360 `PASS` (the `grep`-visible 1361
counts one `✅ PASSWORD POLICY GEÇTİ` line).

**What this pass re-measured, and what it carries forward.** The suites, the parity re-capture, the
flag-state tool and PII-log counts, and the registry projections were re-run in the final gate pass and
are reported with their exit codes in `docs/mcp-final-gate-result.md` §0. The permission matrix, the
poisoning walk and the guard deletions below are the invariant pass's own measurements, recorded here so
they survive the branch rather than living in a transcript. Anything re-derived cheaply in the final pass
is marked where it appears.

### Invariant 1 — the flags-off listing equals production

`node docs/evidence/capture-tools-list.js` re-run against the working tree: production `015d5792` and the
WORKING TREE both hash
`7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984` — BYTE-IDENTICAL, 19 tools.

The harness is honest. Inserting `MUTATED ` into the `search_orders` title
(`functions/index.js:26536`) made it report "functions/ dirty" and a different sha, and
`test/qa/mcp-tools-list-snapshot.test.js` went red on all four flags-off states.

The three surfaces the tools/list harness does **not** cover were checked separately, by `git archive`-ing
`015d5792` and diffing against the tree with every MCP environment variable deleted:

- `nvMcpInitializeResult` — `protocolVersion`, `serverInfo` 0.1.0, `capabilities` and the four-line
  `instructions` — identical;
- OAuth — identical: mint `"orders.read orders.write"`, challenge
  `"orders.read notes.read finance.read"`, registration default the six-scope string; both widen only
  under the orchestrator flag;
- every reachable `piiAccessLog` row — identical field for field (`source: "mcp"`, `subject.kind:
  "order"`, the four categories, `note: "action=<x>"`) for all six actions production logs, on both the
  `mcp` and `rest` surfaces, with and without an `orderId`.

### Invariant 2 — nothing higher-risk is reachable

The published surface was enumerated in all 8 flag states from `_nvMcpToolsWithSecuritySchemes()` and
`_nvMcpAvailableActions()`: **19 / 21 / 21 / 22**, and the listing equals the dispatcher list in every
state — no listed-but-undispatchable row, no dispatchable-but-unlisted one.

All 8 removed names, plus `search_customers` and `get_customer_detail`, were probed in all 8 states
through five doors — `registry.entryFor`, the tools/list bytes, `nvMcpAvailableActions`, `HANDLERS`, and
`orchestrator.run`. Every one is blocked in every state: `"Unknown action…"` from the dispatcher,
`invalid-argument Unknown capability "x"` from `run`. The one alias, `search_inventory_items`, resolves to
`search_inventory` **before** the flag check and is then refused with `failed-precondition The
search_inventory capability is not switched on` when neither flag is set — it is a spelling, not a door.
`listCapabilities()` with a maximum channel profile (all four kinds, assurance 3) returns the same two
names.

The removed modules never enter the live require graph: after `require('./index.js')` in all four flag
states, `attention.js`, `payouts.js`, `integrationHealth.js` and `accountingStatus.js` are absent from
`require.cache`.

Risk classes the flags add are A, A and C (`create_inventory_item`) — nothing above the C production
already ships in `attach_bank_receipt`, and nothing at D.

### Invariant 3 — no caller reads past their permission

Both kept capabilities were driven through the deployment's own wiring
(`api._nvOrchestrator.resolveContext` with the app's real predicates) against 11 profiles — owner; a
member with each of `orders`, `dashboard`, `customers`, `bankFeed`, `notes`, `financialInfo` removed in
turn; a member with nothing; `workflowOnly`; `viewOnly` — against a fake Firestore that records every path
read.

- no `orders` area → refused before a single read (reads: none);
- no `financialInfo` → no `totals` key and a `section_not_permitted` warning. **Superseded on
  7 September 2026**, and the stronger statement replaces it: `totals` is gone for every caller, the
  warning with it, and neither kept capability reads `ctx.financialInfo` or
  `entitlements.advancedFinanceEnabled` at all. `financialInfo` no longer changes this surface's answer
  in any direction — `test/qa/mcp-no-money.test.js` asserts the three callers get byte-identical `data`;
- no `bankFeed` → `companies/c1/bankConnections` is not read at all;
- `workflowOnly` / `viewOnly` → inventory refused ("Inventory is not enabled for your role"), and
  `workflowOnly` sees only orders assigned to them (0 rows when the order is assigned to somebody else);
- a suspended member is refused at `resolveContext`.

Scope: an empty delegated grant is refused, a wrong grant is refused, an unknown `authType` is treated as
delegated and refused, and only `firebase_session` passes without one. `readableDomain` fails closed on
`'constructor'`, `'__proto__'` and an unnamed domain, and every entry in `DOMAINS` has a gate row.

Marketplace PII, end to end on `search_commerce_orders`: `amazon`, `ebay` and an undescribed provider
(`"temu"`) all return `{restricted: true, reason: "provider_pii_policy"}` with notes and `historyLog`
dropped; the workshop's own and `shopify` orders keep their customer; a legacy
`customFields.Source: "Instagram"` is correctly NOT treated as a marketplace; and three `recordPiiBlock`
rows are filed with provider, `recordCount` and reason.

`firestore.rules:113` `canReadBankFeed` is owner OR `memberAccess.bankFeed`, which is exactly what
`DOMAIN_GATES.payouts` asks for.

### Invariant 4 — no unbounded, multi-line or control-carrying attacker string

Every string source the two kept capabilities can reach was poisoned — order number, project number,
customer name / email / phone, design name, status, notes, `historyLog`, `identity.provider` /
`connectionId` / `externalId`, `provider_metadata.order_number`, channel, `manualSource`,
`platformStatus`, workspace settings currency and custom steps, all four commerce connection collections,
`commerceHealth` provider and `connectionId`, `bankConnections`, `accountingConnections` — with one
payload carrying a newline, U+202E, U+200B, U+0007, U+0000, U+2028, U+0085 and 300 trailing filler
characters. The WHOLE envelope was then walked at every depth: `data`, `warnings`, `freshness`,
`entityRefs`, `suggestedActions`, `action`, object **keys**, and `summary.lines`.

Zero findings: nothing over 200 characters outside summary lines, no key over 60, no control, bidi or
zero-width character anywhere, no key-collision overwrite. Link-shaped order numbers are refused rather
than truncated (`bit.ly/x`, `evil.co/pay`, `//evil.co/x`, `www.evil.co` all → `""`, while `2026/001`,
`INV/2026/014` and `1001.2` survive) and the row says `orderNumberWithheld: "not_an_order_number"`.
`boundStrings` does not pollute the prototype with a JSON `__proto__` key. Caller-supplied arguments echo
back bounded too: a 900-character multi-line `status` returns as a single-line 300-character
`unsupported_metric` message.

### Guards deleted, one at a time

Each restored with `git checkout`, tree verified clean after:

| guard removed | what went red |
|---|---|
| re-added `get_commerce_overview` to `HANDLERS` | `mcp-reduced-surface.test.js`, `orchestrator-contract.test.js` |
| `return boundStrings(envelope)` → `return envelope` in `envelope.finish` | `orchestrator-untrusted-envelope.test.js` |
| `readableDomain`'s no-row case → `return true` | `orchestrator-domain-gates.test.js` |
| restored the old `granted.size === 0 => allow` in `context.missingScopes` | `mcp-scope-enforcement.test.js` |
| deleted the `URL_SHAPE` / `LINK_SHAPE` refusal in `untrusted.safeReference` | `orchestrator-render.test.js` |
| let `nvMcpAvailableActions` push `search_inventory` under both flags | `mcp-one-inventory-search.test.js` |
| changed a flags-off tool title | the parity harness, `mcp-tools-list-snapshot.test.js` |

Every guard is load-bearing and every one is caught.

---

## 2. Findings

### F1 — [medium] `search_inventory` bounds its strings under one flag and returns them raw under another

With `NIVADESK_MCP_ORCHESTRATOR=1` the published `search_inventory` is the orchestrator capability: driven,
every field is bounded and stripped (name 80, `sku` / `category` / `location` 64, everything else 200
through `envelope.boundStrings`), control characters, bidi overrides and zero-width joiners removed, no
value able to span a line.

With `NIVADESK_MCP_INVENTORY=1` and the orchestrator flag off, the same published tool name dispatches to
the 1.1.1-era handler — `functions/index.js:24667-24670` chooses between them — whose projection at
`functions/index.js:24737-24746` is:

```js
name: String(data.name || ""),
category: String(data.category || ""),
location: String(data.location || ""),
status: String(data.status || ""),
unit: String((data.quantity || {}).unit || ""),
number: String(data.number || ""),
```

No bound, no stripping. `nvCleanString` (`String(value).trim().slice(0, max)`) does not remove control
characters either, so even the fields that pass through it on the write side keep newlines. Those rows go
straight into `structuredContent` and into the `JSON.stringify` for the text block.

**Not called an invariant break** because inventory item text is workspace- or model-authored, not
provider- or buyer-authored, which is the threat model `untrusted.js` was written against. The chain that
makes it attacker-influenced — a buyer note read by `search_orders`, then `create_inventory_item` —
requires `confirmed: true` and therefore a human confirmation. It is still the one place on the published
surface where a single tool name carries two different string-safety contracts.

**Closing it.** One line per field: route the projection through `orchestrator/untrusted.safeText`.

### F2 — [medium] `create_inventory_item` advertises a read scope for a write tool, and the orchestrator flag is what starts enforcing scopes

`functions/orchestrator/registry.js:637` declares `scopes: ["orders.read"]` while `:638` declares
`permission.write: true` and `:644` declares `effects: ["external_fetch"]`. The comment above it
(`registry.js:633-636`) says this is deliberate: the registry records what is on the wire, and correcting
it is an OAuth-surface change deferred to the 1.2.0 submission.

The consequence is worth stating because the two halves land on the same switch. `nvMcpAssertScope`
(`functions/index.js:24614`) only runs when `NIVADESK_MCP_ORCHESTRATOR` is on, and
`nvOAuthMintDefaultScope` (`functions/index.js:25471`) widens the default grant on the same flag. So the
first deployment that enforces scope at all is also the first one in which a connection granted only
`orders.read` can call a tool that writes an inventory item and fetches a model-supplied URL.

`registry.kindsFor` already answers this correctly for a channel binding — driven on the entry it returns
`["internal_write", "file_upload"]` with `minAssurance: 2` — so a WhatsApp read binding is refused. It is
only the MCP scope check that is loose. The state was verified: with both flags on,
`create_inventory_item` is published and its `securitySchemes` on the wire carry `scopes: ["orders.read"]`.

**Closing it.** Give the entry a write scope, and take the OAuth-surface change with the submission that
already owns it.

### F3 — [low] `entityRef` accepts any URL scheme without checking it

`functions/orchestrator/envelope.js:194` is `url: url ? String(url) : null`. The `type` is checked against
a closed list and the `label` is bounded to 80, but the url is passed through untouched.
`envelope.entityRef("order", "id", "label", "javascript:alert(1)")` returns that string verbatim;
`boundStrings` then caps it at 200 and strips control characters, but the scheme survives.

Latent today. Of the `entityRef` call sites in modules that are still reachable, only two belong to a
published capability — `functions/orchestrator/commerce.js:498` (`search_commerce_orders`) and
`functions/orchestrator/inventory.js:209` (`search_inventory`); `inventory.js:111` is inside the removed
`inventoryOverview`. None passes a fourth argument, so no published capability emits a url. It becomes
live the first time a capability wants to link a row — which is precisely the shape of change the boundary
was built to survive.

**Closing it.** An https-or-relative-path check beside the existing type check, before that happens.

### F4 — [low] `search_commerce_orders` reads `bankConnections` and `accountingConnections` it never uses

`search_commerce_orders` declares `domainNeeds` `[settings, orders, connections, commerceHealth]`.
`connections` is `open: true` (`functions/orchestrator/loaders.js:252`), and `loadConnections` then reads
`companies/{cid}/bankConnections` when `ctx.areas.bankFeed` (`loaders.js:415-416`) and
`companies/{cid}/accountingConnections` when `ctx.accountingReader` (`loaders.js:429-430`). Both reads were
confirmed to happen on every commerce order search for a member holding those grants, and confirmed to be
skipped for a member without them.

No permission is broken — the sub-reads carry their own gates, and the answer never emits them:
`commerceSources` (`commerce.js:112-168`) uses only `commerceHealth` and the four commerce connection
collections. But `loaders.js`'s own header argues that "a read nobody may see is a read that should not
happen … it puts data in a process that was refused it, one line away from an answer", and this is a read
nobody *needs*: two extra collection reads per search, holding bank and ledger connection state in the
same object the pure capability is handed.

**Closing it.** Split `connections` into a commerce half and a bank/accounting half, so the declaration
means what §8.1's table says it means.

### F5 — [low] The freshness section of the summary and the warning list are uncapped

`functions/orchestrator/render.js:79-84` emits one summary line per stale freshness source, and
`envelope.finish` dedupes warnings but does not cap them. Filling `commerceHealth` to its 50-document cap
(80 documents in the fixture) and running `search_commerce_orders` produced **102 summary lines, 102
warnings, 100 freshness sources, 11,612 characters of summary and a 61 KB envelope** — from a single
search, for one order.

Not an injection channel today: `commerceHealth.provider` is always a server literal (`health.touchHealth`
is called with `"woocommerce"`, `"shopify"`, `"square"` or a task provider the server enqueued), so the
repeated 40-character token is ours, not a shop's. It is a context-size amplifier now, and it becomes an
injection amplifier the day any provider- or shop-supplied string reaches a freshness row — the per-field
bound would still hold while the same payload appeared a hundred times in the model's context.

**Closing it.** A cap on `freshnessLines` — the worst 5 stale sources plus "and N more" — costs nothing and
removes both.

### F6 — [low] `search_inventory`'s `lowStock` filter compares a sanitised id against a raw one

`functions/orchestrator/inventory.js:148-149` builds `lowIds` from
`metrics.lowStockItems(...).map(row => row.itemId)`, and `inventoryMetrics.js:173` writes that field as
`label(item.id, 200)` = `untrusted.safeText`. The filter on the next line tests
`lowIds.has(String(item.id || ""))` — the raw id.

Any id that `safeText` alters (a control character, zero-width, bidi override, or over 200 characters)
would drop a genuinely low-stock row out of a `lowStock: true` search with nothing said. Unreachable with
Firestore auto-ids, which is why it is not blocking. `reserved` and every other figure in that handler do
come from the shared `inventoryMetrics` module, as `docs/mcp-inventory-search-decision.md:88` claims.

**Closing it.** Compare on the same side of the sanitiser — build the set from the raw ids, or test the
sanitised one.

### F7 — [low] Stale narration in orchestrator source comments after the reduction

Not false claims about behaviour, so recorded rather than pressed:

- `functions/orchestrator/inventory.js:200-201` says the paging condition is "one CONDITION for all four".
  Two capabilities page now, and contract §6.3 (`docs/orchestrator-contract.md:460-461`) says so correctly:
  "in this release `search_commerce_orders` and `search_inventory`; the two attention summaries that also
  paged are out of it."
- `functions/orchestrator/envelope.js:203` and `:232` reason from "the ten capabilities". `:232` is
  past-tense narration of the poisoning review and reads correctly; `:203` and `inventory.js:200-201` read
  as present-tense counts.

### F8 — [low] Stale line citations in the inventory-search decision document

`docs/mcp-inventory-search-decision.md:50-51` cites the pre-decision `search_inventory_items` as
"registry row at `functions/orchestrator/registry.js:782`" and "dispatched at `functions/index.js:24640`".
`registry.js:782` is now `const kinds = [];`, inside `kindsFor()`; `functions/index.js:24640` is now
`case "append_note":`.

The prose is describing the state before §4's change, so this is a dead pointer rather than a false claim
about today. It sits in the same document as two blocking count errors (B5), and both should be fixed in
one pass.

---

## 3. What was verified and holds

Recorded so the negatives above are not read as unchecked.

**Flags-off parity.** `node docs/evidence/capture-tools-list.js` re-run against the working tree — PASS on
both committed snapshots, production and candidate listings both sha256
`7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984`, BYTE-IDENTICAL, 19 tools.
`docs/mcp-production-parity.md` §3.1's full 19-row table (schema property counts, required lists, four
hints, advertised scopes) reproduces field for field from the evidence file with 0 differences; the seven
emitted keys are as claimed; `tools-list-full.json` `states.off.tools` is byte-identical to the production
listing, as `:190-195` claims.

**Registry projections**, `docs/orchestrator-contract.md` §4.2: 22 entries, 10 writes, and rows of
12 / 18 / 20 — every one reproduced from `registry.publishedForChannel`, and
`orchestrator-contract.test.js:143-180` parses those numbers out of the document rather than retyping
them.

**§5.4's "the two predicates select the same nine tools":** `piiAccessLogged === true` and `pii.length > 0`
both select the same nine. `ACCESS_SOURCES` has `rest` and not `whatsapp`; `bank_transaction` is used by
exactly the two production bank tools.

**§8.1's caps**, `envelope.STATES`, `envelope.WARNING_CODES`, `loaders.DOMAINS` and the six deliberately
open domain gates all match the code exactly.

**Enumeration from the registry**, rather than from a hand-written list: `mcp-reduced-surface.test.js`
derives the published set live and asserts disjointness with its one hand-written denylist in all eight
flag states, and asserts the served listing equals `registry.publishedNames(flags)` per state;
`orchestrator-untrusted-envelope.test.js:160-170` takes its capability list from `listCapabilities()` with
an explicit guard against a literal count; `orchestrator-contract.test.js:651` requires a paging snapshot
for every name in `CAPABILITY_NAMES`. `search_commerce_orders` is not dispatchable flags-off —
`nvChatGPTDispatchAction` (`index.js:24602`) refuses anything outside `nvMcpAvailableActions()`, which
gains the orchestrator names only under the flag.

**Suites.** `npm test` exit 0 (1360 PASS / 0 FAIL); ports 8080 and 9199 polled free, then
`firebase emulators:exec --only firestore,storage` with `JAVA_HOME` set — `npm run test:rules` exit 0
(127 PASS) and `test/run-e2e.sh` exit 0 (155 PASS). Full table in
`docs/mcp-final-gate-result.md` §0.

---

## 4. Noticed while removing the money (7 September 2026)

The decision that day was narrow — take every monetary field out of the two kept capabilities, close the
documentation findings, and nothing else. These are what that pass walked past. None of them is a
refusal; each is a line so the next change is measured against it rather than rediscovering it.

- **`commerce.js` is on the live require graph and still carries the money half of two removed
  capabilities.** `orchestrator/index.js` requires it for `searchCommerceOrders`, and the same module
  holds `commerceOverview`, `channelPerformance`, `channelRows`, `settlementTotals`, `finishTax`,
  `advancedFinance` and `PLAN_LIMITED_DETAIL`. That is unlike `attention.js`, `payouts.js`,
  `integrationHealth.js` and `accountingStatus.js`, which §1 proves are absent from `require.cache`
  in all four flag states. Nothing can call them — no registry row, no dispatcher case,
  `mcp-reduced-surface.test.js` — so this is not a reachability finding; it is that the money
  arithmetic now sits in the same file as the capability that must never do it, which is the shape a
  future edit reintroduces it from. Closing it: move `commerceOverview` and `channelPerformance` into a
  module nothing on the live path requires, the way the other four already are.
- **`orderView.buildOrderView` still computes the full finance engine for every order the search
  reads**, and nothing emits any of it. `loaders.js`'s own header argues that "a read nobody may see is a
  read that should not happen … it puts data in a process that was refused it, one line away from an
  answer" — this is the same sentence about a computation rather than a read: `finance.revenue`,
  `vatDue`, `platformFee` and the rest are built for a caller who may not have the financial grant, then
  dropped. It is also the one derivation `paymentStatus` genuinely needs (`derivedPaymentStatus` reads
  `finance.refunded`), so it cannot simply be deleted. Closing it: a flag on `buildOrderView` that
  computes only what a money-free caller needs, and the status derivation reading that.
- **`envelope.MONEY_BLOCK_KEYS`, `MONEY_NAME` and `MONEY_IN_TEXT` now have no published producer.** The
  channel-profile redaction they drive is still correct and still tested directly, but with both kept
  capabilities money-free nothing on the published surface feeds them, so a regression in
  `applyChannelProfile` would be caught only by its own unit checks. `orchestrator-render.test.js` was
  changed on 7 September to exercise the detector explicitly for that reason. Worth knowing before the
  WhatsApp channel publishes a capability that does carry money.
- ~~**The submission's §7 release-note block is prose that nothing parses for money claims.**~~
  **Mostly closed, 7 September 2026.** `mcp-tool-annotations.test.js` now slices every blockquote line
  under the §7 heading and reads it: the annotation-correction count must equal
  `registry.correctionsPending()`, every pending hint must be named there, and the "both report how
  fresh their data is" promise is refused by measuring what the two capabilities actually return on a
  manual-only snapshot. With the check B3's closure added — a capability name no flag publishes, and a
  behaviour claim whose producer is unreachable — the block is parsed for its counts, its tool names,
  its freshness promise and its one producer-backed behaviour claim. What a person still reads alone is
  a NEW claim about a field, invented in prose no existing pattern matches; giving that the treatment
  `mcp-no-money.test.js` gives the code — a shape rather than a list — means writing a money detector
  for English, which is a bigger thing than it looks and was not attempted.

---

## 5. Noticed while finishing the documents (7 September 2026)

The pass that closed the remaining documentation findings. Same rule as §4: a line, not a refusal.

- **The design document's §1.2 runtime tool table still has eight rows whose Flag column is false.** The
  correction now stands under the table and `mcp-reduced-surface.test.js` requires it to, but the rows
  themselves still read `NV_MCP_ORCHESTRATOR` over `get_business_attention_summary`,
  `get_commerce_overview`, `get_channel_performance`, `get_inventory_overview`,
  `get_payout_reconciliation_overview`, `get_integration_health`, `get_accounting_sync_status` and
  `get_banking_attention_summary`. They were left because the table carries the annotation reasoning for
  the rows that DID ship, and cutting eight rows out of a 30-row table is a bigger edit than the
  documentation pass was asked for. Closing it: either delete the eight rows and renumber, or move them
  under a heading that says they are the design's proposal rather than the runtime's table.
- **§6 step 8's probe list names two capabilities where the recommended flip publishes three tools.**
  The step says "one question per published capability: `search_commerce_orders` and `search_inventory`",
  and with §5.8's recommended all-three-flags flip `create_inventory_item` is published too — its
  photo-add is described in the same guide bullet the step tells the operator to move. It is consistent
  with this repository's use of "capability" (the two `CAPABILITY_NAMES`), so it is not false; it is a
  gap in a flip-day instruction. Closing it: name the third tool, or say why a write tool is not probed.
- **`docs/evidence/tools-list-candidate-flags-off.json`'s `meta` block is stale by nine commits.** It
  records `commit: 75fa8ff4…` and that day's `functions/index.js` sha256. The harness rewrites `meta`
  only under `--write`, and its verification compares the `tools` array — which still matches, hash
  unchanged — so nothing is wrong about the evidence; the provenance stamp beside it is simply old.
  Closing it: regenerate on a clean tree, which is the one condition a pass that is itself editing
  `functions/index.js` cannot meet.

---

## 6. Noticed by the deterministic parity gate (7 September 2026, `01e5ab6c`)

The gate passed on all five checks. Nothing below is a disagreement between the registry, the listing,
the dispatcher and the documents about the two new capabilities, and nothing below touches the flags-off
byte-identity, the money invariant or the customer-search invariant. Each was measured, not read.

- **The design still tells the reviewer that 1.2.0 corrects `create_inventory_item`'s advertised scope,
  and it does not.** `docs/mcp-orchestration-design.md:1902-1904` lists, among the runtime corrections
  the submission ships, "OAuth scope enforcement per tool, which also corrects `create_inventory_item`
  from `orders.read` to `orders.write` (§1.4.4)". The registry deliberately keeps the read scope —
  `functions/orchestrator/registry.js:637-641`, whose own comment says "a write tool advertising a read
  scope … correcting it is a change to the OAuth surface and belongs with the 1.2.0 submission, not
  here" — and the builder emits `["orders.read"]` for that tool in all eight flag states, verified by
  running `registry.scopesFor("create_inventory_item")` and by reading the emitted `securitySchemes`.
  `:221` (design table row 21) states the same intent as a proposal, "(default orders.read, wrong) →
  orders.write", which is honest; `:1904` states it as something the release does. `:1560` compounds it
  by naming a test case that does not exist — "scope enforcement: a token without `orders.write` cannot
  call `create_inventory_item`" — while `functions/test/qa/mcp-scope-enforcement.test.js` has no
  `create_inventory_item` case at all. Not a gate failure: `create_inventory_item` is not one of the two
  new capabilities, and it is a pre-existing hidden tool. Closing it: either make the correction and add
  the test `:1560` promises, or move `:1904` into the design's proposal voice and say the wire keeps
  `orders.read` for this release.
- **The §7 release-note text says "two read-only tools" while §5.8 recommends a flip that puts three
  new tools on the wire, one of them a write tool.** `docs/mcp-submission-1.2.0.md:600` opens the
  paste-to-OpenAI block with "**New in this version:** two read-only tools", which is exactly right for
  `NIVADESK_MCP_ORCHESTRATOR` on its own. `:524-526` (§5.8) recommends "all three flags together, one
  submission, so the reviewer sees the finished surface once", and under that flip the reviewer also
  receives `create_inventory_item` — never published before, `readOnlyHint: false`, `openWorldHint:
  true` — for the first time. The document is not inconsistent with itself: §3's table at `:203` names
  that tool under its own flag, §2.5 at `:164-167` names it in the guide bullet, and the design at
  `:1914-1915` explains that it is pre-existing rather than new. But the block that is actually pasted
  to the reviewer describes two of the three tools that would appear. This is the same root as the §6
  step 8 item in §5 above. Closing it: either name the third tool in the §7 block with a sentence
  saying it is a pre-existing hidden tool now being published, or make §5.8 recommend flipping the
  orchestrator flag alone, so what §7 describes is what the wire carries.
- **`docs/evidence/tools-list-candidate-flags-off.json`'s `meta` block is still stale, and the one
  condition for closing it is now met.** The entry in §5 above records the staleness and says "Closing
  it: regenerate on a clean tree, which is the one condition a pass that is itself editing
  `functions/index.js` cannot meet." The gate run changed no code, so the tree was clean throughout:
  `meta.commit` reads `75fa8ff4…` and `meta["functions/index.js sha256 …"]` reads `f2ca4b98…` while the
  tree is at `01e5ab6c` with `functions/index.js` at `1e329911…`. The evidence itself is sound — the
  harness re-derives and compares the `tools` array, which matches, and the listing hash
  `7c838fb68a5b6e97…` is unchanged — so this is a provenance stamp, not a wrong measurement. It was
  deliberately left alone here because the gate's instruction was to change no code unless a suite is
  red, and regenerating is a change rather than a report. Closing it: `node
  docs/evidence/capture-tools-list.js --write` on a clean tree, then confirm the diff touches only
  `meta` and that both `listingSha256` values still read `7c838fb68a5b6e97…`.
