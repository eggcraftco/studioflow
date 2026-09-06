# NivaDesk MCP — tool annotations and their justification

Status: 6 September 2026. Applies to `functions/index.js` `exports.chatgptMcp` at branch
`mcp-orchestration`. The values in this document come from `functions/orchestrator/registry.js`, which is
the only place they are written; `functions/test/qa/mcp-tool-annotations.test.js` fails the build if this
document and that table ever say different things.

## Why this document exists

OpenAI rejected NivaDesk 1.1.1 with: *"annotations do not appear to match the tool's behavior … explicitly
set to true or false (not null) for every tool … include a clear justification … based on the tool's actual
behavior."* Three things are owed, and this is where they are paid:

1. **Every hint on every published tool is a literal `true` or `false`.** Not null, not absent, not
   inferred. Before this change the four hints were literals scattered through the schema list and then
   re-coerced with `=== true`, so a `null` in source would have shipped silently as `false` and nothing
   would have said so. The coercion is gone: a hint that is not a boolean throws, and the MCP surface
   refuses to serve a listing with a hole in it rather than serving one.
2. **Each value has a written reason**, per hint, in the same table the runtime reads — reproduced below.
3. **Each reason is checked against the runtime**, not against the tool's name. Every claim below was read
   out of the handler in September 2026, and three of the values published in 1.1.1 did not survive that
   reading. They are listed in "Corrections" and they are the substance of the answer to the reviewer.

## The rule used to decide a value

**The unit being annotated is the observable effect of calling the tool, not the lines inside its
handler.** If a workspace-configured Firestore trigger turns the handler's write into an e-mail or an SMS,
that effect belongs to the tool. A hint that is true only because the code doing the thing lives in another
function is exactly the kind of claim 1.1.1 was rejected over — and it is what went wrong in `create_order`
and `update_order_status`.

| Hint | true when |
|------|-----------|
| `readOnlyHint` | The call makes no Firestore or Storage write of workspace state, no external call with a side effect, and fires no trigger. |
| `destructiveHint` | A call can overwrite, replace, move or delete something the workspace already had. Purely additive writes and reversible boolean flags are `false`. |
| `idempotentHint` | A second identical call produces no new document, no new sub-record (history entry, note line, stored file), no change to a user-visible field, and no outbound message. Server bookkeeping stamps (`updatedAt`, `source`) are excluded from the comparison. |
| `openWorldHint` | Calling the tool reaches outside NivaDesk — it fetches a URL, calls a third-party API, or mutates a provider — whether the handler does it, or a trigger the workspace configured does it in consequence. Writing a NivaDesk record that later feeds an *internal proposal* is not open-world; writing one that puts a message in a customer's inbox is. |

### One carve-out, stated rather than buried

Six read tools cause one write: `recordPiiAccess` files a row in `companies/{cid}/piiAccessLog` before the
call is dispatched, recording that a workspace's customer data was handed to an assistant. Those tools keep
`readOnlyHint: true`. The row is a record *of* the read, not a change to what the workspace holds, and
removing it to make the hint tidier would trade an audit trail for a word. This is a position, not a
deduction, so every tool that relies on it repeats it in its own `readOnlyHint` reason below — the reviewer
sees the carve-out on the tool, not in a footnote. The test enforces that: a tool that is `readOnlyHint:
true` and files an access-log row fails the build if its reason does not mention it.

## The table

`RO` / `D` / `I` / `OW` = readOnlyHint / destructiveHint / idempotentHint / openWorldHint. These are the
**verified** values. Two tools serve different values on the wire today; see "Corrections" below. Risk
class is the channel-policy grade (A lowest, E highest) the WhatsApp gateway will read from the same table.

| Tool | RO | D | I | OW | Flag | OAuth scopes | Reaches outside | Risk |
|------|----|---|---|----|------|--------------|-----------------|------|
| `create_order` | false | false | false | true | — | orders.write | customer_message | D |
| `search_orders` | true | false | true | false | — | orders.read | — | A |
| `get_order_detail` | true | false | true | false | — | orders.read | — | A |
| `add_order_note` | false | false | false | false | — | orders.write, notes.write | — | B |
| `update_order_status` | false | true | false | true | — | orders.write | customer_message | D |
| `create_note` | false | false | false | false | — | notes.write | — | B |
| `search_notes` | true | false | true | false | — | notes.read | — | A |
| `get_note_detail` | true | false | true | false | — | notes.read | — | A |
| `append_note` | false | false | false | false | — | notes.write | — | B |
| `update_note` | false | true | true | false | — | notes.write | — | B |
| `pin_note` | false | false | true | false | — | notes.write | — | B |
| `archive_note` | false | false | true | false | — | notes.write | — | B |
| `get_order_financials` | true | false | true | false | — | finance.read | — | A |
| `get_dashboard_summary` | true | false | true | false | — | orders.read, finance.read | — | A |
| `get_extra_spending_overview` | true | false | true | false | — | finance.read | — | A |
| `get_financial_overview` | true | false | true | false | — | finance.read | — | A |
| `get_bank_spending_summary` | true | false | true | false | — | finance.read | — | A |
| `search_bank_transactions` | true | false | true | false | — | finance.read | — | A |
| `attach_bank_receipt` | false | true | false | true | — | finance.read, orders.write | external_fetch, ocr | C |
| `search_inventory` | true | false | true | false | inventory | orders.read | — | A |
| `create_inventory_item` | false | false | false | true | inventory | orders.read | external_fetch | C |
| `get_business_attention_summary` | true | false | true | false | orchestrator | orders.read, finance.read | — | A |
| `get_commerce_overview` | true | false | true | false | orchestrator | orders.read, finance.read | — | A |
| `search_commerce_orders` | true | false | true | false | orchestrator | orders.read | — | A |
| `get_channel_performance` | true | false | true | false | orchestrator | orders.read, finance.read | — | A |
| `get_inventory_overview` | true | false | true | false | orchestrator | orders.read | — | A |
| `search_inventory_items` | true | false | true | false | orchestrator | orders.read | — | A |
| `get_payout_reconciliation_overview` | true | false | true | false | orchestrator | finance.read | — | A |
| `get_integration_health` | true | false | true | false | orchestrator | orders.read | — | A |
| `get_accounting_sync_status` | true | false | true | false | orchestrator | finance.read | — | A |
| `get_banking_attention_summary` | true | false | true | false | orchestrator | finance.read | — | A |

Thirty-one tools, in three groups. Nineteen are published to the review connection. Two
(`search_inventory`, `create_inventory_item`) are dispatchable but hidden behind
`NIVADESK_MCP_INVENTORY`. Ten more — the cross-channel read capabilities of the orchestration design —
are hidden behind `NIVADESK_MCP_ORCHESTRATOR`, and each of them arrived in the same commit as the handler
behind it. A registry entry publishes a name into `tools/list`, and a name in the listing with no handler
behind it is the list-versus-dispatcher split all over again, so a name is never added here first.

The ten read capabilities all carry the same four values — `true / false / true / false` — and that is not
a copy-paste. They are pure functions over data NivaDesk already holds: they write nothing (the accounting
attention queue is READ, never opened through `store.openAttention`, which would create or bump a document
on every call), they overwrite nothing, the same question over the same data gives the same answer, and
none of them contacts a shop, a bank, a marketplace or an accounting provider. What differs between them is
which gate they sit behind and whether they hand over a person: `search_commerce_orders` and
`get_banking_attention_summary` do, and both declare `piiAccessLogged: true`, which is the one list the
dispatcher derives its PII set from, so each call files exactly one access-log row — carrying that
entry's own `pii` categories and its own `piiSubject`, not a fixed four and a guessed subject — the orchestrator itself is built without `recordPiiAccess` on
this surface so a single call cannot file two. `functions/test/qa/orchestrator-purity.test.js` is what
keeps the first half of that claim true: it fails the build if any module under `functions/orchestrator/`
other than `loaders.js` can reach Firestore, if any of them imports or calls a writer, or if any of them
reads `siparisler` outside the one place that redacts it.

## Corrections: three values 1.1.1 got wrong

Reading the handlers turned up three published hints that do not match what calling the tool does. All
three are corrected in the registry and all three are held behind `NIVADESK_MCP_ORCHESTRATOR`, the flag
that carries the 1.2.0 submission. **With the flag off — which is how the deployed function runs today —
`tools/list` is byte-identical to the listing the 1.1.1 review connection is served.** Moving a value a
reviewer has already looked at is a submission decision for the operator, not a side effect of merging a
branch. The fixture `functions/test/fixtures/mcp/tools-list-annotations.json` records both listings and the
test compares the served one against it.

| Tool | Hint | 1.1.1 serves | Verified | Why the published value is wrong |
|------|------|--------------|----------|----------------------------------|
| `create_order` | `openWorldHint` | false | **true** | `notifyCustomerOnStatusChange` is an `onDocumentWritten` trigger on `siparisler/{orderId}`. It runs on creation as well as update: `before` is null, so the "same status as before" early return does not fire. A new order carries a status (`"Not Yet"` by default) and can carry the customer's e-mail address, and `cleanPortalAutoUpdates` returns `{enabled: true, email: true}` for an order with no `portalAutoUpdates` block — which is every order this tool makes. The mail leaves through NivaDesk's SMTP provider. |
| `update_order_status` | `openWorldHint` | false | **true** | Same trigger, on the path it was written for. A status change sends the buyer an e-mail, and an SMS through Twilio where the workspace enabled it. The tool pushes nothing to Shopify, Etsy or any marketplace — but the effect of calling it reaches a third-party sender and the customer, and that is what the hint is about. |
| `update_order_status` | `idempotentHint` | true | **false** | A repeat with the same status appends a *second* history entry, for a reason nothing in the handler reveals: `nvHistoryItem` mints a fresh `crypto.randomUUID()` and `Timestamp.now()` on every call, so the `arrayUnion` can never dedupe. The order's history — which the user sees — grows on each call. |

The third row is a value we would rather have kept. It becomes `true` honestly the moment the tool grows a
no-op guard: read the document first, and when every requested field already equals the requested value,
return the current state without writing (no history entry, no document write, and therefore no second
customer notification). That guard is a behaviour change to a frozen tool and belongs with the rest of the
1.2.0 work, not with this document. Until then the registry names the guard it is waiting for
(`pendingGuard`), and the test fails the build in both directions: if the hint is flipped before the guard
exists, and if the guard appears while the hint is still `false`. The annotation and the behaviour ship
together or neither ships.

## Per-tool justification

These four lines per tool are the text the runtime stores and, from 1.2.0, the text the unauthenticated
discovery document exposes as `annotationJustification`.

### `create_order`

- **readOnlyHint false** — Because the call writes a new document in siparisler through nvOrderDefaults with createdFrom "chatgpt".
- **destructiveHint false** — Because it only adds a record: no existing order is changed, moved or removed.
- **idempotentHint false** — Because there is no request-level deduplication, so the same arguments called twice create two orders with different ids.
- **openWorldHint true** — Because creating an order that carries a status and a customer e-mail address can put a message in that customer's inbox: notifyCustomerOnStatusChange runs on document creation as well as update, and an order with no portalAutoUpdates block counts as enabled with e-mail on, so the mail leaves through NivaDesk's SMTP provider (and Twilio where the workspace enabled SMS).

### `search_orders`

- **readOnlyHint true** — Because it queries siparisler by companyId and filters in memory; the only write it makes is the piiAccessLog row recording the read, which records the read rather than changing what the workspace holds.
- **destructiveHint false** — Because no order is altered, moved or removed by a search.
- **idempotentHint true** — Because repeating the same query returns the same rows and creates nothing.
- **openWorldHint false** — Because it reads NivaDesk's own order records only and never contacts a shop, marketplace or any other outside system.

### `get_order_detail`

- **readOnlyHint true** — Because it reads one order document and the cross-workspace and workflow-assignment checks are reads too; the only write it makes is the piiAccessLog row recording the read.
- **destructiveHint false** — Because reading an order changes nothing on it.
- **idempotentHint true** — Because the same orderId returns the same document and creates nothing.
- **openWorldHint false** — Because the order is read from NivaDesk's own collection and no outside system is contacted.

### `add_order_note`

- **readOnlyHint false** — Because it appends to the order's notes field and adds a historyLog entry.
- **destructiveHint false** — Because the existing note text is kept and the new line is concatenated onto it.
- **idempotentHint false** — Because each repeat appends the same line again and mints another history entry.
- **openWorldHint false** — Because the workspace's customer notification keys on status, which this tool does not touch, so nothing leaves the workspace.

### `update_order_status`

- **readOnlyHint false** — Because the call sets status and/or designStatus on the order document.
- **destructiveHint true** — Because the previous status value is overwritten and is not recoverable from the field.
- **idempotentHint false** — Because a repeat with the same status appends a second historyLog entry (nvHistoryItem mints a new id and timestamp per call, so arrayUnion cannot dedupe), which the order's history shows the user.
- **openWorldHint true** — Because a status change is what the workspace's own customer notification listens for: notifyCustomerOnStatusChange sends an e-mail through NivaDesk's mail provider, and an SMS through Twilio where the workspace enabled SMS, to the address and number on the order — and it is on by default for an order with no portalAutoUpdates block.

### `create_note`

- **readOnlyHint false** — Because it creates a note document under the connected user's own personal_notes collection.
- **destructiveHint false** — Because it only adds a note; no existing note is changed or removed.
- **idempotentHint false** — Because there is no deduplication, so the same text called twice creates two notes.
- **openWorldHint false** — Because the note is written to NivaDesk only and no trigger sends it anywhere.

### `search_notes`

- **readOnlyHint true** — Because it reads the connected user's own notes and filters them in memory; it writes nothing at all, not even an access-log row, because the notes are the caller's own.
- **destructiveHint false** — Because no note is altered by a search.
- **idempotentHint true** — Because the same query returns the same notes and creates nothing.
- **openWorldHint false** — Because the notes are read from NivaDesk and no outside system is contacted.

### `get_note_detail`

- **readOnlyHint true** — Because it reads one of the connected user's own note documents and writes nothing.
- **destructiveHint false** — Because reading a note changes nothing on it.
- **idempotentHint true** — Because the same noteId returns the same note and creates nothing.
- **openWorldHint false** — Because the note is read from NivaDesk and no outside system is contacted.

### `append_note`

- **readOnlyHint false** — Because it writes the note's text field with the appended paragraph.
- **destructiveHint false** — Because the previous text is kept and the new text is concatenated onto it.
- **idempotentHint false** — Because each repeat appends the same paragraph again, so the note grows on every call.
- **openWorldHint false** — Because the note is written to NivaDesk only and no trigger sends it anywhere.

### `update_note`

- **readOnlyHint false** — Because it sets the note's title, text, labels, links or colour.
- **destructiveHint true** — Because the supplied fields replace the previous values, which are not recoverable from the note.
- **idempotentHint true** — Because it sets an explicit end state: a repeat with the same fields writes the same values, adds no note line and no history entry, and differs only in the server's updatedAt and source stamps.
- **openWorldHint false** — Because the note is written to NivaDesk only and no trigger sends it anywhere.

### `pin_note`

- **readOnlyHint false** — Because it sets isPinned on the note document.
- **destructiveHint false** — Because the flag is reversible by the same tool and no content is lost when it changes.
- **idempotentHint true** — Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument pins rather than toggles.
- **openWorldHint false** — Because the note is written to NivaDesk only and no trigger sends it anywhere.

### `archive_note`

- **readOnlyHint false** — Because it sets isArchived on the note document.
- **destructiveHint false** — Because archiving hides the note without deleting it and the same tool puts it back.
- **idempotentHint true** — Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument archives rather than toggles.
- **openWorldHint false** — Because the note is written to NivaDesk only and no trigger sends it anywhere.

### `get_order_financials`

- **readOnlyHint true** — Because it computes totals over the workspace's own order documents; the only write it makes is the piiAccessLog row recording the read.
- **destructiveHint false** — Because no order or payment record is altered by the calculation.
- **idempotentHint true** — Because the same order returns the same figures and creates nothing.
- **openWorldHint false** — Because every figure comes from NivaDesk's own records; no bank, payment or accounting provider is called.

### `get_dashboard_summary`

- **readOnlyHint true** — Because it aggregates the workspace's own orders in memory; the only write it makes is the piiAccessLog row recording the read.
- **destructiveHint false** — Because summarising records does not change them.
- **idempotentHint true** — Because the same workspace state returns the same summary and creates nothing.
- **openWorldHint false** — Because the summary is computed from NivaDesk's own records and no outside system is contacted.

### `get_extra_spending_overview`

- **readOnlyHint true** — Because it reads the workspace's spending documents and groups them in memory; the only write it makes is the piiAccessLog row recording the read.
- **destructiveHint false** — Because no spending record is altered by the calculation.
- **idempotentHint true** — Because the same period returns the same overview and creates nothing.
- **openWorldHint false** — Because the spending rows are already in NivaDesk; no bank or provider is called to produce them.

### `get_financial_overview`

- **readOnlyHint true** — Because it computes revenue, cost and profit from the workspace's own orders and spending; the only write it makes is the piiAccessLog row recording the read.
- **destructiveHint false** — Because no record behind the figures is altered.
- **idempotentHint true** — Because the same period returns the same figures and creates nothing.
- **openWorldHint false** — Because every figure comes from NivaDesk's own records; no bank or accounting provider is called.

### `get_bank_spending_summary`

- **readOnlyHint true** — Because it reads the workspace's already-imported bankTransactions rows and classifies them in process; it writes nothing.
- **destructiveHint false** — Because no transaction row is altered by the summary.
- **idempotentHint true** — Because the same rows produce the same summary and nothing is created.
- **openWorldHint false** — Because the rows were imported by the bank feed beforehand: this call contacts no bank, no TrueLayer and no PayPal endpoint.

### `search_bank_transactions`

- **readOnlyHint true** — Because it reads the workspace's already-imported bankTransactions rows and filters them in memory; it writes nothing.
- **destructiveHint false** — Because searching does not change a transaction row.
- **idempotentHint true** — Because the same query returns the same rows and creates nothing.
- **openWorldHint false** — Because the rows were imported by the bank feed beforehand: this call contacts no bank or payment provider.

### `attach_bank_receipt`

- **readOnlyHint false** — Because it stores the file under companies/{cid}/bank_receipts and then either assigns it to a transaction, returns candidates, or queues it as waiting.
- **destructiveHint true** — Because assigning to a transaction that already has a receipt replaces it: assignInboxReceipt overwrites receiptPath and deletes the previous file.
- **idempotentHint false** — Because a repeat with the same file stores and scores a second copy, and a repeat with the same inboxPath fails, since the first assignment moved the inbox file.
- **openWorldHint true** — Because the handler downloads the document from a model-supplied https URL and sends it to Google Vision for OCR, so the call reaches systems outside NivaDesk even though it mutates no sales provider.

### `search_inventory`

- **readOnlyHint true** — Because it reads the workspace's inventoryItems and filters them in memory; it writes nothing, and stock rows carry no person fields.
- **destructiveHint false** — Because no item is altered by a search.
- **idempotentHint true** — Because the same query returns the same items and creates nothing.
- **openWorldHint false** — Because the items are read from NivaDesk and no outside system is contacted.

### `create_inventory_item`

- **readOnlyHint false** — Because it writes an item through inventoryInternal.saveItemForWorkspace and stores the photo in Storage.
- **destructiveHint false** — Because it only adds an item; no existing stock row is changed or removed.
- **idempotentHint false** — Because a repeat creates a second item: the confirmed:true requirement is a guard against accidental creation, not deduplication.
- **openWorldHint true** — Because the handler downloads the photo from a model-supplied https URL before storing it.

## Open items

Three things this pass found and deliberately did not change, because each is a behaviour change rather
than an annotation, and the surface under review must not move on its own:

1. **The two bank tools hand over a person's name without an access-log row.** `get_bank_spending_summary`
   and `search_bank_transactions` are honest `readOnlyHint: true` — they write nothing at all — but a
   person-to-person payment carries a person in `counterparty`, and `linkedOrderLabel` can carry a
   customer's name. Both declare `piiAccessLogged: false`, so these two reads are not recorded. The
   registry declares `pii: ["name"], piiAccessLogged: false` so the gap is written down rather than
   implied, and the test pins which tools log so neither the gap nor its closing can happen silently.
   Closing it means flipping two flags — a new write on a read path, which is a decision for the same
   submission.

   The 1.2.0 reads do not widen this gap. `get_banking_attention_summary` declares `pii: ["name"]`
   **and** `piiAccessLogged: true`, so its counterparty labels are recorded — as `categories: ["name"]`
   against `subject.kind: "bank_transaction"`, which is what the row now says rather than claiming a
   phone number and a postal address on an order.
   `get_business_attention_summary` runs the same detectors with `revealCounterparty: false`: the
   grouped rows carry transaction ids and no merchant label, so the broad read declares no PII because
   it emits none. A test over the runtime pins it (`orchestrator-attention.test.js`), because
   `assertRegistry` cannot: `pii: []` with `piiAccessLogged: false` is internally consistent, and its
   PII check only fires when `piiAccessLogged` is true.
2. **`create_inventory_item` advertises `orders.read`.** `nvMcpOAuthScopesForTool` has no case for it, so
   it falls to the default — a write tool advertising a read scope. The registry records what is on the
   wire rather than what it should be, because correcting it changes the OAuth surface.

   This item used to end "nothing enforces scope at call time today either: `context.scope` is captured
   and never checked", and that is no longer true. `context.missingScopes` is one rule over the
   registry's `scopes` — a delegated grant is the whole of what that caller may do, and an empty grant
   permits nothing — applied to the ten capabilities by `assertCapability` and to the other 19 by
   `nvMcpAssertScope`, both gated on `NIVADESK_MCP_ORCHESTRATOR` so the reviewed surface is unmoved.
   That makes the mis-advertised scope worse rather than harmless once the flag flips: a connection
   granted only `orders.read` could call this write tool, because the scope the tool demands is the read
   one it advertises. See `docs/mcp-submission-1.2.0.md` §5.4.
3. **The URL guard does not run on the fetches it is named for.** `nvAssertPublicHttpsUrl` is called only
   when the URL is *not* `https`, and the guard's first act is to reject anything that is not `https` — so
   on both paths that fetch a model-supplied URL (`attach_bank_receipt`, `create_inventory_item`) it never
   blocks a request that would otherwise be made. The annotation is `openWorldHint: true` either way, and
   is correct either way; the guard itself is tracked in the orchestration design document (§1.4.10). Until
   it is fixed, no NivaDesk document should describe these fetches as "SSRF-guarded".

### `get_business_attention_summary`

- **readOnlyHint true** — Because every detector runs over documents the loader read and writes nothing back: the accounting queue is read through its own reader, never through store.openAttention, which would create or bump an attention document on each call.
- **destructiveHint false** — Because nothing is overwritten, moved or deleted; the answer is assembled in memory and discarded.
- **idempotentHint true** — Because the detectors are deterministic over the same data, and a grouped item keeps its attentionId across days so a repeat call does not mint new items.
- **openWorldHint false** — Because it reads NivaDesk's own collections only: no provider API is called, no URL is fetched and no message leaves the workspace.

### `get_commerce_overview`

- **readOnlyHint true** — Because it totals orders and payouts in memory through finance/engine.js and writes nothing: the money is recomputed on every call rather than stamped back onto the order.
- **destructiveHint false** — Because no order, payout or setting is changed by reading them.
- **idempotentHint true** — Because the same range over the same orders produces the same totals; only generatedAt moves, and that is metadata about the read.
- **openWorldHint false** — Because the figures come from orders and payouts already stored in NivaDesk; no shop, marketplace or bank is contacted to answer it.

### `search_commerce_orders`

- **readOnlyHint true** — Because it filters orders the loader already read and returns rows; the only write on the path is the piiAccessLog row recording that an assistant was shown customer names, which is a record of the read rather than a change to the workspace.
- **destructiveHint false** — Because searching cannot alter an order: no field is written and no row is removed.
- **idempotentHint true** — Because the same filters over the same orders return the same rows in the same order.
- **openWorldHint false** — Because it searches NivaDesk's own order collection; the provider is never queried, even for an order that came from one.

### `get_channel_performance`

- **readOnlyHint true** — Because it groups the same recomputed order figures by channel and writes nothing back to any order or connection.
- **destructiveHint false** — Because comparing channels changes none of them.
- **idempotentHint true** — Because the same range produces the same per-channel figures, including the cost-coverage ratio that decides whether profit is reported as a definite number.
- **openWorldHint false** — Because every figure comes from stored orders and payouts; no channel API is called to build the comparison.

### `get_inventory_overview`

- **readOnlyHint true** — Because it counts stock through the same pure summarize() the Inventory screen uses and writes no item, movement or ledger row.
- **destructiveHint false** — Because counting stock cannot change it: no quantity, reservation or valuation is touched.
- **idempotentHint true** — Because the same shelf produces the same counts and value on every call.
- **openWorldHint false** — Because inventory has no external connector at all: the numbers come from NivaDesk's own items and nothing is fetched.

### `search_inventory_items`

- **readOnlyHint true** — Because it filters items in memory and returns rows; no item is created, reserved or written.
- **destructiveHint false** — Because a search does not touch the stock it finds.
- **idempotentHint true** — Because the same filters return the same items, including two items that share a SKU, which is a search key here and never an identity.
- **openWorldHint false** — Because there is no listing or channel data to consult: the search runs entirely over NivaDesk's own inventory.

### `get_payout_reconciliation_overview`

- **readOnlyHint true** — Because it scores candidate bank rows with the pure settlements scorer and reports the result: it never calls the matcher that writes bankMatch onto a payout and settlement onto a transaction.
- **destructiveHint false** — Because no payout is matched, unmatched or relabelled by asking about it.
- **idempotentHint true** — Because scoring the same payouts against the same bank rows yields the same counts, and a second call still writes no match.
- **openWorldHint false** — Because payouts and bank rows are already in NivaDesk; neither the processor nor the bank is contacted to answer the question.

### `get_integration_health`

- **readOnlyHint true** — Because it reads connection documents and health records and writes nothing: reporting that a connection needs reauthorisation does not attempt the reauthorisation.
- **destructiveHint false** — Because no connection is disconnected, retried or reset by reporting its state.
- **idempotentHint true** — Because the same stored health records produce the same rows, and no counter is incremented by the read.
- **openWorldHint false** — Because freshness is read from NivaDesk's own health documents rather than by pinging each provider, which is also why an Amazon connection this project cannot see is reported as not visible instead of as broken.

### `get_accounting_sync_status`

- **readOnlyHint true** — Because the open accounting items are read from the attention collection rather than opened through store.openAttention, which would write a document and bump an occurrence counter on every call.
- **destructiveHint false** — Because nothing in the accounting state is resolved, ignored or retried by reading it.
- **idempotentHint true** — Because the same connections and attention rows produce the same status, and the read cannot advance a posting through its state machine.
- **openWorldHint false** — Because QuickBooks, Xero and Pandle are not called: the answer is the state NivaDesk already stored, which is why it says posting is not switched on rather than reporting zero failures.

### `get_banking_attention_summary`

- **readOnlyHint true** — Because the duplicate, recurring, transfer and unusual-charge rules are pure functions over rows the loader read; the only write on the path is the piiAccessLog row, recording that a counterparty name was shown to an assistant.
- **destructiveHint false** — Because no transaction is categorised, linked, dismissed or marked reviewed by reporting it.
- **idempotentHint true** — Because the same rows produce the same grouped items with the same attentionId, so a second call does not create a second alert for the same eight receipts.
- **openWorldHint false** — Because it reads bank rows already imported into NivaDesk; the bank is not contacted and no sync is triggered.

## How to check this against a deployment

`GET /chatgptMcp` returns the discovery document unauthenticated. Comparing its `tools[].annotations`
against the `off` projection in `functions/test/fixtures/mcp/tools-list-annotations.json` tells the
operator whether the deployed function is serving the reviewed listing. Do this before and after any
`chatgptMcp` deploy; the values must not move until the flag is deliberately turned on.
