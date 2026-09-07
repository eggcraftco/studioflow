# MCP 1.2.0 — backlog

The non-blocking half of the final gate. The verdict, and the nine issues that produced it, are in
`docs/mcp-final-gate-result.md`.

Nothing here argues against that verdict. Three kinds of entry: what was verified and holds — recorded so
the negatives are not read as unchecked — the eight findings of §2, real but not refusing the branch, each
with what closing it would take, and §4, what the money removal of 7 September walked past. Read them as
the list the next change is measured against.

- Repository: `/Users/gocmen/Developer/studioflow-mcp`, branch `mcp-orchestration`
- Commit: `3f68dc88` for §1–§3; §4 was added against the tree after the money removal
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
- **The submission's §7 release-note block is prose that nothing parses for money claims.**
  `mcp-tool-annotations.test.js` parses the annotation numbers out of `docs/mcp-tool-annotations.md`, and
  `mcp-reduced-surface.test.js` reads the guide chapter out of the built corpus and checks the names
  against the registry — but the paste-to-OpenAI paragraph is checked by a person. Two of the three false
  claims closed on 6 and 7 September lived there. Closing it: extend the annotations test to assert the
  §7 block names no field the published capabilities do not emit, the way B3's closure already suggests
  for behaviours.
