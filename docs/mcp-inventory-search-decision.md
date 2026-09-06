# One inventory search: which tool is canonical, and why

> **The first question first: neither of them is public.** The operator's rule was "whichever tool is
> public in production 1.1.1 today is canonical". Production runs the MCP server with **every feature
> flag unset**, so the listing it serves is the nineteen reviewed tools and **carries no inventory search
> at all** — not `search_inventory`, not `search_inventory_items`. There was no incumbent to protect, so
> "canonical" could not be inherited and had to be decided on the merits. This document is that decision
> and the comparison behind it.

Measured 6 Sep 2026 on `mcp-orchestration`. Read-only: no deploy, no push, no authenticated call to
production.

---

## 1. Establishing that the answer is "neither"

Two independent routes, both re-runnable.

**From the deployed source.** `docs/mcp-production-parity.md` establishes the ground truth for this
branch: production is Cloud Run revision `chatgptmcp-00071-tir`, its service carries 32 environment
entries and **not one name contains `MCP`** (names only were listed, never values), and the deployed
`functions/` tree is identical to commit `015d5792`. Its `tools/list` and the flags-off listing of this
branch hash to the same 32 bytes. Nineteen tools.

**By driving the listing builder here.** `functions/index.js` gates both tools on flags read once at
require time (`NIVADESK_MCP_INVENTORY`, `NIVADESK_MCP_ORCHESTRATOR`, both `=== "1"`). Loading `index.js`
in a child process per flag state, before the change in §4:

| flag state | tools | inventory searches published |
|---|---|---|
| both unset — **this is production** | 19 | **0** |
| `NIVADESK_MCP_INVENTORY=1` | 21 | 1 (`search_inventory`) |
| `NIVADESK_MCP_ORCHESTRATOR=1` | 29 | 1 (`search_inventory_items`) |
| both `=1` | 31 | **2** |

So the duplicate exists in exactly one flag state, and it is a state nothing is deployed in. That is why
this was safe to fix as a merge rather than as a submission: nothing a live client can see moves.

**What it changes about "canonical".** With no incumbent, the two constraints that remain are the
operator's second sentence — *the registry must not show a user two inventory searches* — and the
branch's own rule that everything new stays behind `NIVADESK_MCP_ORCHESTRATOR`. Both are satisfiable
while choosing the better implementation, which is what §4 does.

---

## 2. The comparison, field by field

`search_inventory` — `functions/index.js`, handler `nvChatGPTSearchInventory`, published in the
`NV_MCP_INVENTORY` branch of `nvMcpOrderToolSchemas()`.
`search_inventory_items` — registry row at `functions/orchestrator/registry.js:782`, handler
`orchestrator/inventory.js` `searchInventoryItems`, dispatched at `functions/index.js:24640`.

Both read the same collection: `companies/{companyId}/inventoryItems`.

### 2.1 Input fields

| field | `search_inventory` | `search_inventory_items` |
|---|---|---|
| `companyId` | string, optional; a lookup key at most — the adapter uses the token's workspace | string, optional; same, and the orchestrator adapter does not even pass it on |
| `query` | string, optional. Cleaned to **120 chars** (`nvCleanString`), lower-cased, substring match | string, optional. Trimmed and lower-cased, **no length bound** |
| — matched against | name, sku, serialNumber, brand, model, category, location | name, sku, serialNumber, brand, model, category, location — **identical seven** |
| — described as | "name, SKU, serial number, brand or location" (omits model, category) | "name, SKU, serial number, brand, category or location" (omits model) |
| `status` | **absent** | string, optional, `enum` of 8: available, partiallyReserved, reserved, incoming, used, sold, removed, archived |
| `lowStock` | **absent** | boolean, optional. At or below `lowStockAt` |
| `reserved` | **absent** | boolean, optional. status ∈ {reserved, partiallyReserved} |
| `location` | **absent** | string, optional, exact case-insensitive match |
| `category` | **absent** | string, optional, exact case-insensitive match |
| `limit` | integer, **1–25, default 10** | integer, **1–50, default 20** |
| `channel`, `mappingIssue` | **absent** | read by the handler, **not declared in the schema** (`additionalProperties: false`), so an MCP client cannot send them; a non-MCP caller that does gets an `unsupported_metric` warning and an empty result rather than a guess |
| required | `[]` | `[]` |
| `additionalProperties` | false | false |

### 2.2 Output fields

| field | `search_inventory` | `search_inventory_items` |
|---|---|---|
| `itemId` | ✓ raw document id | ✓ bounded to 200 |
| `number` | **✓ only here** | ✗ — **folded in**, see §4 |
| `unit` | **✓ only here** (`quantity.unit`) | ✗ — **folded in**, see §4 |
| `name` | ✓ unbounded `String(...)` | ✓ `untrusted.safeText`, 80 |
| `category` | ✓ unbounded | ✓ bounded 64 |
| `location` | ✓ unbounded | ✓ bounded 64 |
| `status` | ✓ | ✓ (defaults to `available`) |
| `trackingType` | ✓ | ✓ |
| `onHand` | ✓ | ✓ |
| `sku` | ✗ | ✓ bounded 64 |
| `serialNumber` | ✗ | ✓ bounded 64 |
| `reserved` | ✗ | ✓ — **but wrong for a one-off as merged.** It read `quantity.reserved`, which `inventory.js` never writes for a unique item (the reservation is `status: "reserved"` plus `reservedOrderIds`, and `quantity.reserved` is created 0 and left there), so an item the `reserved: true` filter had selected *because* it is held reported `reserved: 0`, while `get_inventory_overview` reported 1 for the same document. Both now call `inventoryMetrics.reservedUnits`, and `orchestrator-inventory.test.js` pins `search_inventory`'s answer against that shared module. (`get_inventory_overview` is out of this release — it counts and VALUES the shelf, and the 6 September 2026 reduction kept only the search — so the pin is now search-against-module rather than search-against-overview; the module is the thing both were meant to agree with.) |
| `lowStockAt` | ✗ | ✓ |
| `supplierName` | ✗ | ✓ bounded 80 (a business, not a person — the row carries no PII) |
| `customerOwned` | ✗ | ✓ — a customer's own item is flagged, never counted as the workshop's stock |
| `count` | ✓ | ✓ |
| `matched` (total before the page) | ✗ | ✓ |
| `statuses` (the vocabulary) | ✗ | ✓ — so the model can filter on the next call instead of guessing |
| envelope | `{ action, ok, count, items }` | `{ ok, action, state, data, freshness, partial, warnings, entityRefs, suggestedActions, summary }` |

### 2.3 Permission and plan gating

| | `search_inventory` | `search_inventory_items` |
|---|---|---|
| workspace predicate | `nvRequireInventoryAccess`: owner, **or** the `orders` area **and** an order role that can fully edit | the **same predicate**, asked as a question: `inventoryAccessAllowed` wraps `nvRequireInventoryAccess` and `assertCapability` refuses on `permission.inventory` |
| when it runs | inside the handler, after dispatch | **before any read** (§38), in `run()` step 2 |
| refusal message | "Inventory is not enabled for your role…" / "Your workspace role cannot add inventory items." | "Inventory is not enabled for your role. Ask the workspace owner to grant it in Team Access." — names the area, never its contents |
| advertised scope | `orders.read` | `orders.read` |
| scope **enforced** | only via `nvMcpAssertScope`, which is itself gated on `NV_MCP_ORCHESTRATOR` | twice: `nvMcpAssertScope` **and** `assertCapability` → `missingScopes` |
| plan entitlement | **not checked** | `entitlements.chatgptAppEnabled === false` → `failed-precondition` on the `mcp`/`rest` channels |
| PII | `pii: []`, no access-log row | `pii: []`, no access-log row — same, and correct: stock rows name no person |
| annotations | `true / false / true / false` | `true / false / true / false` — identical |

### 2.4 Freshness, truncation and warnings

| | `search_inventory` | `search_inventory_items` |
|---|---|---|
| documents read | `.limit(400)` on the collection | loader `CAPS.inventory` = **2000** |
| when the read is truncated | **silence**. A workshop with more than 400 items can be told an item is not on the shelf when it is | `inventoryCapped` → `loader_cap_reached` warning **and** `partial: true` |
| when the page is truncated | silence; stops at `limit` | `result_truncated` warning naming both numbers ("N items match; the first M are listed") |
| unknown `status` value | n/a | `unsupported_metric` warning + empty result, never a silent all-items answer |
| `channel` / `mappingIssue` asked for | n/a | `unsupported_metric`: "Inventory is not mapped to channel listings… returns nothing rather than a guess" |
| freshness block | **none** | `sources: [{ provider: nivadesk, entity: inventory, state: "unsupported" }]` — inventory has no connector, so it is `unsupported` rather than a lie about a sync time |
| `entityRefs` | none | up to 20 `inventoryItem` refs, labels bounded |
| rendered summary | none | one `§13` line: "N item(s) listed of M matching" |
| untrusted text | none — item names go out raw | every string through `untrusted.safeText`: control characters, bidi overrides and zero-width joiners stripped, whitespace collapsed, hard cap |

### 2.5 Reach

| | `search_inventory` | `search_inventory_items` |
|---|---|---|
| channels | MCP and `chatgptWorkspaceAction` only | any channel over `run()` — the WhatsApp gateway reads the same table (WA §81) |
| audit row | none | `deps.audit` row with `recordsRead.inventoryItems` |
| testability | a Firestore-backed handler in a 27k-line file | pure function over a snapshot; covered by `orchestrator-render`, `-purity`, `-context`, `-contract` |

---

## 3. What is genuinely unique to each

**Only `search_inventory` had:**

1. `number` — the workshop's own item number, the one printed on the label and encoded in the item's QR
   link. Losing it means the model can only ever refer to an item by a Firestore id the user has never
   seen.
2. `unit` — what `onHand` counts. "12" is twelve grams or twelve clasps depending on the row, and the
   difference is not recoverable from anything else in the payload.
3. Reachability with `NIVADESK_MCP_INVENTORY` alone, without the orchestrator.

That is the whole list. Every other field, filter and behaviour of `search_inventory` is a strict subset
of the other tool's.

**Only `search_inventory_items` had:** five filters (`status`, `lowStock`, `reserved`, `location`,
`category`) and the closed status vocabulary; a page limit twice the size; `matched`; six more output
fields including `customerOwned`, which is the one that stops a customer's own property being reported as
sellable stock; a read cap five times higher **and honest about hitting it**; a truncation warning; a
freshness row; entity refs; a rendered summary line; injection-bounded strings; the plan gate; scope
enforcement; and a second channel.

**One thing neither has and neither should be assumed to have:** `search_inventory`'s description says
it searches "name, SKU, serial number, brand or location" and the other says "name, SKU, serial number,
brand, category or location", while both handlers in fact also match `model`. Both descriptions were
wrong about the same field. The merged tool's description names all seven.

---

## 4. The decision, and what moved

**One published tool: `search_inventory`. The orchestrator's implementation behind it.**

| | |
|---|---|
| published name | `search_inventory` — one registry row, gated by **both** flags (`flag: ["inventory", "orchestrator"]`) |
| implementation, orchestrator flag **on** | `orchestrator/inventory.js` `searchInventoryItems`, through `run()` |
| implementation, orchestrator flag **off** | the older `nvChatGPTSearchInventory`, unchanged |
| `search_inventory_items` | **no registry row.** An internal alias in `orchestrator/index.js` (`CAPABILITY_ALIASES`), resolved before the registry is consulted, so `run("search_inventory_items", …)` still answers — and answers with `action: "search_inventory"`, because that is the tool that answered |
| tool counts | 19 / 21 / 29 / **30** (was 31) |

**Why this name rather than the other.** The submission document's §5.1 recommended the opposite —
publish `search_inventory_items`, drop `search_inventory` — and that option has a defect that only shows
up in one flag state: with `NIVADESK_MCP_INVENTORY` on and the orchestrator off, it would publish
`create_inventory_item` with **no search beside it**. The search's own description is what tells the
model to look first: *"Use it before adding something, so an item the workshop already has gets topped up
instead of duplicated."* A create tool with no search next to it is a duplicate-maker. Publishing the
one search under both flags removes that state; keeping the shorter, older name costs nothing, because
the two tools already carried the identical user-visible title, "Search inventory".

**Why the flag-off path keeps the old handler.** Everything new on this branch ships behind
`NIVADESK_MCP_ORCHESTRATOR`, default off. Routing the inventory-only deployment to the orchestrator
would have been new behaviour reachable without that flag. So with the orchestrator off the tool is
byte-for-byte what the inventory flag has always published, answered by the handler that has always
answered it; with it on, the schema grows the five filters and the orchestrator answers. The same
pattern `attach_bank_receipt` already uses for `NIVADESK_MCP_EMAIL_RECEIPTS`.

**What moved rather than being dropped.** The two fields only the older handler returned are now
returned by the canonical tool:

- `number` — added to every row, through `untrusted.safeReference` rather than `safeText`, for the
  reason the module header gives: a reference that does not look like a reference is refused outright,
  never truncated into a shorter injection.
- `unit` — added beside `onHand`, bounded to 24 characters.

Nothing else was folded, because nothing else existed to fold: §3's list is exhaustive.

**What was deliberately not carried over:** the 400-document read cap, the 25/10 limits, the silence on
truncation, and the unbounded output strings. Each is the older tool being worse, not different.

---

## 5. What pins it

`functions/test/qa/mcp-one-inventory-search.test.js`. It drives the real listing builder in a child
process for **all eight** combinations of the three review flags and asserts that no state publishes,
and no state dispatches, more than one inventory search; that the registry holds exactly one such row;
that a channel is offered exactly one; that with every flag off there is none at all; and that the alias
is resolvable but published nowhere.

The predicate is written against the **shape** of the defect, not the two names — a published tool counts
as an inventory search when its name or title carries both a search word and a stock word, because that
is the pair a user reads in a client's tool picker. The test proves the predicate discriminates
(`get_inventory_overview` and `create_inventory_item` do not trip it; a hypothetical `find_stock_rows`
does) so that "exactly one" is a constraint rather than a tautology.

**It was verified to fail.** Reintroducing the old `search_inventory_items` registry row and schema block
turns four of its eight checks red and the process exits 1; the files were restored from a checksummed
backup afterwards.

Two neighbouring tests were corrected in the same change, and both were wrong in the same way:

- `mcp-tools-list-snapshot.test.js` asserted the two flag states **concatenate**
  (`[...inventoryOnly, ...orchestratorOnly.slice(19)]`). A concatenation cannot notice that a name is in
  both lists, which is precisely why it went on passing while `tools/list` carried two "Search inventory"
  tools. It now asserts a set union with no duplicate in it.
- `orchestrator-purity.test.js` filtered out anything the inventory flag also publishes. That filter was
  a no-op when written and became wrong the moment one capability was published by either flag.

The four flag states without the orchestrator flag are still compared byte-for-byte against
`test/fixtures/mcp/tools-list-full.json`, and they still match. Stronger than that: the flags-off listing
built from the working tree after this change hashes to
`7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984`, which is the hash
`docs/evidence/tools-list-production-015d5792.json` carries for the deployed listing — so **the surface
OpenAI is reviewing did not move by a single byte.**

Two fixtures record the orchestrator states, and only one of them was re-recorded at the time:
`test/fixtures/mcp/tools-list-annotations.json`, whose note says so. `tools-list-full.json` was left
alone — and nothing compared its two orchestrator states, so it went on shipping the defect this section
describes: 29 tools with `search_inventory_items` and no `search_inventory`, and an
`inventory+orchestrator` state of **31** tools carrying both. That is the exact listing this decision
removed, sitting in the repository as a recording of it, one `--write` away from coming back. Both states
were re-recorded on 6 Sep 2026 (29 and 30 tools), `mcp-tools-list-snapshot.test.js` now compares them
like the other four, and a check asserts neither offers two inventory searches. A fixture nothing reads
is not evidence.

---

## 6. A footnote worth having: this was the original plan

`docs/mcp-orchestration-design.md` §7 specifies "**search_inventory** (existing hidden tool, **extended**)
— adds `status`, `lowStock`, `reserved`, `location` … to the input schema". The design never asked for a
second tool; the implementation drifted into one, and §0 of that document was corrected in September to
record that the drift had shipped as a published duplicate. What §4 does is not a new direction, it is
the specified one, arrived at independently from the comparison and then found to agree.

Two small departures from that paragraph, both deliberate and both now written into it: the extension
rides `NIVADESK_MCP_ORCHESTRATOR` rather than `NIVADESK_MCP_INVENTORY`, because every behaviour change on
this branch does; and `channel` / `mappingIssue` are not declared on the schema, because advertising two
inputs that can only ever return an empty result with a warning invites a model to use them. The handler
still answers them honestly for any caller that sends them anyway.
