# OpenAI Resubmission Readiness Report — NivaDesk for ChatGPT

Date: 9 September 2026. Branch `openai-resubmission` (worktree `/Users/gocmen/Developer/studioflow-openai-review`),
cut from `mcp-orchestration` at `c61057b1`, the commit the final gate passed on. Nothing in this branch is
deployed, no flag is set, and nothing has been submitted: the last submission is the operator's separate
approval.

This report answers four questions — which rejection items are closed, which are open, what changes for
a resubmission, and whether we are ready — and it rests on a tool-by-tool audit (§4) done by reading each
handler, not by re-reading the registry that describes it.

**Short answer: the code is ready; the submission is not.** Every hint on every published tool is an
explicit boolean with a written reason, the tests are green (1,382 `PASS`, 0 `FAIL`, re-run today), and the
flags-off listing is still byte-identical to production 1.1.1. But the three annotation values the audit
corrected exist only *behind* `NIVADESK_MCP_ORCHESTRATOR`; the wire OpenAI's reviewer would scan today is the
same 1.1.1 bytes they rejected. Resubmitting before the flag is flipped and `chatgptMcp` redeployed would
present the same two wrong `openWorldHint` values a third time. Four operator decisions stand in front of the
flip (§7).

---

## 1. The rejection notices, verbatim

Read first-hand from the `contact@eggcraft.co.uk` mailbox on 9 September 2026 (sender
`openai-review@tm.openai.com`, addressed to `eggcraftco`).

**NivaDesk v1.1.0 — 21 August 2026, 22:46**

> After careful review, NivaDesk (v1.1.0) was not approved. Please see the details below:
>
> One or more of your test cases did not produce correct results. Please re-run all submitted test cases and
> align tool behavior/output with the documented expected outcomes. Ensure the same test cases pass
> consistently on both ChatGPT web and mobile.
>
> One or more of your tool's annotations do not appear to match the tool's behavior. Please confirm
> annotations are explicitly set to true or false (not null) for every tool. Include a clear justification for
> why the hint is set that way based on the tool's actual behavior.

**NivaDesk v1.1.1 — 3 September 2026, 19:44**

> After careful review, NivaDesk (v1.1.1) was not approved. Please see the details below:
>
> One or more of your tool's annotations do not appear to match the tool's behavior. Please confirm
> annotations are explicitly set to true or false (not null) for every tool. Include a clear justification for
> why the hint is set that way based on the tool's actual behavior.

Both end with the same boilerplate (review the guidelines, resubmit from the dashboard, reply to appeal).
The test-case item disappeared between the two; the annotation item is repeated word for word.

Platform state on 9 September (platform.openai.com/plugins, org EGGCRAFT LIMITED, app
`asdk_app_6a39221273d88191b7d51b4b81b65819`): **1.1.1 Rejected**, **1.0.0 Published** (in Directory). The
rejected version is view-only; a resubmission is a new draft version.

## 2. The 1.1.1 submission metadata, verbatim

Read from the rejected version's form (`/plugins/edit/asdk_app_…/asdk_app_v_6a8875b253ac819191348f6026bb4b64`),
section by section: Info, MCP Server, Testing, Submit.

| Field | Submitted value |
|---|---|
| Name | NivaDesk |
| Version | 1.1.1 |
| Subtitle | Manage custom orders |
| Category | productivity |
| Developer identity / author | business — EGGCRAFT LIMITED |
| Website / support / privacy / terms | `https://nivadesk.app`, `/contact`, `/privacy`, `/terms` |
| Demo recording | `https://nivadesk.app/demo/nivadesk-chatgpt-demo.mp4` |
| Commerce | "links or directs users out of ChatGPT to make purchases": false |
| Test credentials | the review account `review@nivadesk.app` (the password is on the form and is **not** reproduced anywhere in this repository) |

**MCP Server section (as recorded on the rejected version).** Server URL `https://mcp.nivadesk.app/chatgptMcp`,
authentication OAuth (metadata auto-discovered). Under "Tool justification" the form lists the 19 tools with
the annotation values the platform **scanned from the server** — three hints per tool, Read Only / Open World /
Destructive, each marked "Explicitly provided by your MCP server" (the platform does not ask about
`idempotentHint`) — and a justification text per hint. The values it holds, against what production 1.1.1
serves:

| Tool | Platform form RO / OW / D | Production 1.1.1 serves RO / OW / D | Same? |
|---|---|---|---|
| `create_order` | F / F / F | F / F / F | yes |
| `search_orders` | T / F / F | T / F / F | yes |
| `get_order_detail` | T / F / F | T / F / F | yes |
| `add_order_note` | F / F / F | F / F / F | yes |
| `update_order_status` | F / F / T | F / F / T | yes |
| `create_note` | F / F / F | F / F / F | yes |
| `search_notes` | T / F / F | T / F / F | yes |
| `get_note_detail` | T / F / F | T / F / F | yes |
| `append_note` | F / F / F | F / F / F | yes |
| `update_note` | F / F / T | F / F / T | yes |
| `pin_note` | F / F / **T** | F / F / **F** | **no** |
| `archive_note` | F / F / **T** | F / F / **F** | **no** |
| `get_order_financials` … `search_bank_transactions` (six reads) | T / F / F | T / F / F | yes |
| `attach_bank_receipt` | F / **F** / **F** | F / **T** / **T** | **no** |

**Four values on the form are the pre-1.1.1 ones.** The 1.1.1 release notes on the same form say those exact
values were corrected ("pin_note, archive_note … Corrected in 1.1.1 - both were previously destructive true";
"attach_bank_receipt … Corrected in 1.1.1 - previously destructive false / openWorld false"), and the
deployed server (`015d5792`) serves the corrected ones. So the version OpenAI reviewed carried a tool scan
that was not re-run — or was run against an earlier revision — after the corrected server went live on 22
August, together with justification texts written for the old values.

The justification texts are seven boilerplate sentences reused across tools. The ones that matter:

> *(every read tool, Read Only: True)* This tool only reads and returns existing workspace data. It performs
> no writes and cannot create, modify, or delete any record.
>
> *(every tool, Open World: False)* This tool only accesses the authenticated user's own NivaDesk workspace.
> It does not browse the internet or any external data source. — *variant on `update_order_status` and the
> note writes:* … It does not browse the internet, call external services, or access data outside the
> connected workspace.
>
> *(`update_note`, `pin_note`, `archive_note`, Destructive: True)* This tool changes the state or stored content
> of an existing personal note in the authenticated user's NivaDesk workspace. It does not access external
> systems, but it modifies existing stored data, so destructiveHint is set to true.
>
> *(`attach_bank_receipt`, Read Only: False)* This tool writes to the user's own workspace: it stores the
> invoice/receipt file the user shared in the chat and links it to one bank transaction (sets the
> transaction's receipt reference). It is only available to the workspace owner and only acts after the user
> asks to attach the document.
>
> *(`attach_bank_receipt`, Open World: False)* This tool only downloads the file the user attached in ChatGPT
> (via the Apps SDK file parameter) and stores it in the user's own NivaDesk workspace. It does not browse the
> internet or send data to any third party.

(The `attach_bank_receipt` Destructive justification could not be read through the browser extension's data
filter.) The form also shows, per tool, "Recommended: Add an outputSchema so models can better understand
this tool's results" — a recommendation, not a requirement.

**Description (as submitted):**

> NivaDesk helps custom-order studios manage orders, customers, personal notes, tasks, schedules and
> financial summaries from ChatGPT. After connecting a NivaDesk workspace, users can search orders, view
> dashboard summaries, check permitted financial information, create personal notes and update order
> statuses.
>
> New in this version: business bank spending. Workspace owners (and members they grant access to) can ask
> for monthly or yearly spending summaries, category breakdowns, recurring subscriptions and incoming payments
> from their connected Open Banking feed, search individual bank transactions, and attach an invoice or
> receipt shared in the chat to the matching bank transaction.
>
> It is designed for small teams and studios that work on made-to-order projects, including bespoke art,
> handmade products, repairs, photography, tailoring, jewellery and other client-based workflows.

**Test cases (five positive, three negative):**

| # | Scenario | Tool(s) | Expected output (abridged) |
|---|---|---|---|
| 1 | Get dashboard summary | `get_dashboard_summary` | 21 orders (4 active, 16 completed, 1 cancelled, 1 overdue), total GBP 70,534, paid 64,874, outstanding 5,660, cost 21,173.60, profit 49,360.40, largest balances named |
| 2 | Search review order | `search_orders` | exactly one match, "OpenAI Review Test Order" for "OpenAI Review Test Customer" (`22uckzfA8lGXYjj1JxCM`), In Progress / Done, paid 5,300, remaining 900, due 19 July 2026 |
| 3 | Read order financial information | `get_order_financials` | price 6,200, paid 5,300, remaining 900, base cost 430, fee 186, delivery 0, VAT 1,240, total cost 1,856, profit 4,344 |
| 4 | Bank spending summary and transaction search | `get_bank_spending_summary`, `search_bank_transactions` | (expected-output field not readable through the extension's data filter; the case is the monthly total, top categories and the receipt-less rows) |
| 5 | Attach an invoice image to the matching bank transaction | `attach_bank_receipt` | download the sample ESET invoice, attach; ChatGPT shows its own confirmation prompt ("Allow once"); NivaDesk reads ESET UK 53.99 / 13 Aug 2026, matches the sample transaction, attaches; several matches → candidates; running again replaces the receipt |
| N1–N3 | should not trigger | — | software recommendation; drafting a customer reply; "task vs order vs project" explanation |

**Release notes (as submitted for 1.1.1, in full):**

> Version 1.1.1 addresses both points from the 1.1.0 review.
>
> 1) Test cases. The demo order in the review workspace was named "OpenAI Review Test" while our submitted
> expected output said the customer was "OpenAI Review Test Customer", so test cases 2 and 3 did not match
> the wording we gave you. The workspace data now matches exactly, and every expected output has been
> rewritten with the concrete values a reviewer will see. All five test cases plus the three negative ones
> were re-run end to end on ChatGPT web and on mobile with the review account (review@nivadesk.app) and
> produced the documented results, including the file-attachment case.
>
> 2) Tool annotations. Every tool serves explicit booleans (never null); the values are normalised
> server-side before tools/list is returned. Justifications:
> - readOnlyHint true only for tools that just read Firestore: search_orders, get_order_detail, search_notes,
>   get_note_detail, get_order_financials, get_dashboard_summary, get_extra_spending_overview,
>   get_financial_overview, get_bank_spending_summary, search_bank_transactions. These write nothing.
> - create_order, add_order_note, create_note, append_note: readOnly false, destructive false (they only add
>   new records), idempotent false (calling twice creates a second record).
> - update_order_status, update_note: destructive true because they overwrite values the workspace already
>   had; idempotent true because they set an explicit end state, so repeating the same call changes nothing
>   further. (Corrected in 1.1.1 - both were previously idempotent false.)
> - pin_note, archive_note: destructive false and idempotent true. Both take an explicit boolean (isPinned /
>   isArchived), are fully reversible and delete nothing. (Corrected in 1.1.1 - both were previously
>   destructive true.)
> - attach_bank_receipt: destructive true because it replaces any receipt already attached to that
>   transaction, and openWorldHint true because it downloads the user's file from ChatGPT's file host;
>   idempotent false because each call stores a new file. (Corrected in 1.1.1 - previously destructive false
>   / openWorld false.)
> - openWorldHint is false for every other tool: they only reach NivaDesk's own API within the workspace the
>   user connected.
>
> No new tools, scopes or user-facing features were added in this version.

## 3. The 1.1.1 release notes against what the tools actually do

Each claim OpenAI was given, checked against the handler. "Wire today" is production 1.1.1
(`docs/evidence/tools-list-production-015d5792.json`, re-captured today, sha256 `7c838fb6…64984`).

| 1.1.1 told OpenAI | True? | What the code does | Where |
|---|---|---|---|
| "the values are normalised server-side before tools/list is returned" | true, and it is the defect | The normaliser was `value === true`, so a `null` or a forgotten key shipped silently as `false`. That is the exact shape of "explicitly set to true or false (not null)". The branch removed the coercion: `orchestrator/registry.js` refuses to load a non-boolean hint, and `nvMcpAssertAnnotations` throws instead of coercing | `registry.js` `assertRegistry` check 1; `index.js:26272-26285`; test "assertRegistry refuses the mistakes it exists for" |
| ten read tools "write nothing" | **false for six of the ten** | `search_orders`, `get_order_detail`, `get_order_financials`, `get_dashboard_summary`, `get_extra_spending_overview`, `get_financial_overview` each cause one `companies/{cid}/piiAccessLog` row to be written before dispatch — in production today, every flag unset. The four note and bank reads do write nothing | `index.js:24616-24621`; `docs/mcp-production-parity.md` §3; test "with the flags off, the access log records exactly what production records" |
| `create_order` … "openWorldHint is false … only reach NivaDesk's own API" | **false** | `notifyCustomerOnStatusChange` is `onDocumentWritten` on `siparisler/{orderId}` and runs on creation (`before` is null, so the "same status" return does not fire). `portalAutoUpdates` defaults to enabled with e-mail on. A new order whose status matches a milestone (e.g. "In Progress" → "We've started work"), or any status where the workspace enabled "every status change", e-mails the customer through NivaDesk's SMTP provider and texts them through Twilio where SMS is enabled. The default status "Not Yet" sends nothing but still writes `portalLastNotifiedStatus` | `index.js:28605-28710`, `28133-28143`, `24070`, `28021-28052` |
| `update_order_status` … "idempotent true … repeating the same call changes nothing further" | **false** | Every call appends a `historyLog` entry minted with a fresh `crypto.randomUUID()` and `Timestamp.now()`, so `arrayUnion` cannot dedupe; the order's history, which the user sees, grows on every repeat. (No second customer message: the trigger returns early when the status is unchanged) | `index.js:23121-23129`, `24226-24242`, `28618` |
| `update_order_status` … openWorldHint false | **false** | Same trigger: a real status change e-mails/texts the customer | as above |
| `update_note`: destructive true, idempotent true | true | Sets the supplied fields; a repeat writes the same values and differs only in `updatedAt`/`source` | `index.js:24386-24405` |
| `pin_note`, `archive_note`: destructive false, idempotent true | true | Reversible booleans; omitting the argument pins/archives rather than toggles | `24407-24427` |
| `attach_bank_receipt`: destructive true, openWorld true "because it downloads the user's file from ChatGPT's file host", idempotent false | true but incomplete | It also sends image receipts to **Google Vision OCR**, and on assignment it **moves** the inbox file, **overwrites** `receiptPath`/`receiptName` and **deletes the previous receipt file** | `index.js:25087-25257`; `bankFeed.js:1843-1864` |
| "No new tools, scopes or user-facing features" | true | — | parity doc §3–§4 |
| *platform form* — the form's scanned values for `pin_note`, `archive_note` (Destructive: True) and `attach_bank_receipt` (Open World: False, Destructive: False) | **contradict the server** | Production serves the corrected values; the form carried the old ones with justifications written for them, beside release notes saying they had been corrected — a mismatch visible on the form itself, before any handler is read | §2, MCP Server section; `docs/evidence/tools-list-production-015d5792.json` |
| *platform form* — six read tools: "It performs no writes" | **false** | The `piiAccessLog` row, as above | `index.js:24616-24621` |
| *platform form* — `create_order`, `update_order_status`: "does not … call external services" | **false** | The customer notification trigger, as above | `index.js:28605-28710` |
| *platform form* — `attach_bank_receipt`: "does not … send data to any third party" | **false** | Image receipts are sent to Google Vision for OCR | `index.js:25174-25181` |

The reviewer's sentence was accurate twice over. Three published values did not survive a reading of the
handlers; and the form OpenAI actually reviews disagreed with the server on four more values and carried
justifications written for the wrong ones. The notes themselves said the values were "normalised", which is
the word for the coercion they were asking us to remove.

## 4. Tool-by-tool audit

Twenty-two registry rows: nineteen published to the review connection, three behind flags. Columns:
what the call actually does · read/write · destructive · external side effect · user confirmation ·
authentication and authorization · the annotation on the wire today → the verified value (`RO/D/I/OW`) ·
verdict · evidence · proposal. Every write tool receives ChatGPT's own client-side confirmation prompt
because `readOnlyHint` is false (the 1.1.1 test case 5 records it: "choose Allow once"); "server-side" below
means NivaDesk refuses without an explicit argument.

Authentication is the same for all: an OAuth bearer token minted by NivaDesk's own authorization server
(30-day TTL, `chatgptOAuthTokens`), resolved to `{uid, companyId}` by `nvRequireChatGPTWorkspaceAccessWithOAuth`
(`index.js:25679-25711`), or a Firebase ID token over `chatgptWorkspaceAction` (the same dispatcher,
`surface: "rest"`). Workspace membership is checked on every call (`uidHasCompanyAccess`). OAuth **scopes are
advertised per tool and not enforced** while the flags are off — `nvMcpAssertScope` runs only under
`NIVADESK_MCP_ORCHESTRATOR` (`index.js:24614`); role and area gates are what enforce today.

| # | Tool | What it really does | R/W | Destr. | External side effect | Confirmation | Authorization | Wire today → verified | Verdict | Evidence | Proposal |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `create_order` | Writes a new `siparisler` document through `nvOrderDefaults` (`createdFrom: "chatgpt"`, default status "Not Yet"); returns the redacted order | write, additive | no | **yes, conditional**: the order-created trigger can e-mail (and SMS) the customer when the status is a milestone or "every status change" is on and the order carries an address/number | ChatGPT prompt; description: "only after the user provides enough details or confirms creating a draft"; no server gate | `nvRequireWriteAccess` (role may write orders: owner/admin/member/workflowOnly) + Orders area | F/F/F/**F** → F/F/F/**T** | wire wrong on `openWorldHint` | `index.js:24107-24117`, `28605-28710`; tests `mcp-tool-annotations` ("openWorldHint and the declared effects agree", "the runtime still has the trigger…"), `mcp-tools-list-snapshot` | ship the correction (in registry, flag-gated); add one sentence to the description saying the workspace's notification may message the customer — today that is said only in `initialize.instructions`, and only flag-on |
| 2 | `search_orders` | Queries `siparisler` by `companyId` (workflow-only members: only orders assigned to them), filters in memory, ≤100 rows, each redacted by `nvSafeOrderForChatGPT`; the dispatcher files one `piiAccessLog` row first | read + access-log row | no | none | none | `nvRequireOrdersArea` | T/F/T/F → same | correct **under the disclosed carve-out**; 1.1.1's "writes nothing" was not | `24119-24159`, `24620`; tests `mcp-permissions`, `mcp-tool-annotations` ("a read tool that hands over people discloses its access-log row") | keep; the carve-out is the operator's signature (§7 C) |
| 3 | `get_order_detail` | Reads one order, refuses another workspace's, refuses an unassigned order for workflow-only; redacted; access-log row | read + row | no | none | none | `nvRequireOrdersArea` + `nvRequireWorkflowAssignedOrder` | T/F/T/F → same | correct (carve-out) | `24161-24174`; `mcp-permissions` | keep |
| 4 | `add_order_note` | Concatenates the note onto `notes`, appends a `historyLog` entry | write, additive | no (previous text kept) | none: the trigger runs on the write but returns because the status is unchanged | ChatGPT prompt | `nvRequireWriteAccess` + assigned-order check | F/F/F/F → same | correct | `24176-24205`, `28618` | keep; no qa test names it — add one |
| 5 | `update_order_status` | Sets `status` and/or `designStatus`, appends one history entry per field; a real status change fires the customer notification (not a repeat, not a `designStatus`-only change) | write | **yes** (previous status overwritten) | **yes, conditional** customer e-mail/SMS | ChatGPT prompt; description "only when the user clearly asks" | `nvRequireWriteAccess` + assigned-order check | F/T/**T**/**F** → F/T/**F**/**T** | wire wrong on two hints | `24207-24244`, `23121`, `28605-28652`; tests as row 1 | ship both corrections; **or** ship `nvMcpStatusNoOpGuard` and keep `idempotentHint: true` honestly (§7 B); add the notification sentence to the description |
| 6 | `create_note` | Creates a document under the caller's own `personal_notes` | write, additive | no | none | ChatGPT prompt | any workspace member (the notes are the caller's own) | F/F/F/F → same | correct | `24314-24324` | keep |
| 7 | `search_notes` | Reads the caller's own notes (≤250), filters; no access-log row (own data) | read | no | none | none | member | T/F/T/F → same | correct | `24326-24360` | keep |
| 8 | `get_note_detail` | Reads one own note | read | no | none | none | member | T/F/T/F → same | correct | `24362-24368` | keep; no qa test names it — add one |
| 9 | `append_note` | Concatenates a paragraph onto `text` | write, additive | no | none | ChatGPT prompt | member | F/F/F/F → same | correct | `24370-24384` | keep |
| 10 | `update_note` | Sets title/text/labels/links/colour as supplied | write | **yes** (values replaced) | none | ChatGPT prompt | member | F/T/T/F → same | correct | `24386-24405` | keep |
| 11 | `pin_note` | Sets `isPinned` (omitted → true) | write, flag | no | none | ChatGPT prompt | member | F/F/T/F → same | correct | `24407-24416` | keep |
| 12 | `archive_note` | Sets `isArchived` (omitted → true) | write, flag | no | none | ChatGPT prompt | member | F/F/T/F → same | correct | `24418-24427` | keep |
| 13 | `get_order_financials` | Resolves the order by id or query, redacts, computes basic or advanced figures by plan/role; access-log row; **a second** `piiAccessLog` row when the outbound policy withholds a marketplace buyer's name | read + row(s) | no | none | none | `nvRequireFinancialAccess` | T/F/T/F → same | correct (carve-out); justification says "the piiAccessLog row" and there can be two | `23500-23593` | tighten the wording to "row(s)"; no behaviour change |
| 14 | `get_dashboard_summary` | Aggregates ≤500 orders in memory; access-log row | read + row | no | none | none | `nvRequireDashboardAccess` (dashboard area) | T/F/T/F → same | correct | `23918-23960` | keep |
| 15 | `get_extra_spending_overview` | Reads spending entries off orders, groups in memory (`Map.set`, not a write); access-log row | read + row | no | none | none | `nvRequireFinancialAccess` | T/F/T/F → same | correct | `23809-23876` | keep |
| 16 | `get_financial_overview` | Computes revenue, cost and profit; access-log row | read + row | no | none | none | `nvRequireFinancialAccess` | T/F/T/F → same | correct | `23961-24106` | keep |
| 17 | `get_bank_spending_summary` | Reads ≤3,000 imported `bankTransactions` and the waiting receipt inbox, classifies in process (`Set.add`, not a write); **no** access-log row in production, one behind the flag | read | no | none (no bank, TrueLayer or PayPal call) | none | `nvRequireBankFeedAccess` (owner, or bankFeed area) | T/F/T/F → same | correct | `24898-24979` | keep; flag-on adds the row for counterparty names |
| 18 | `search_bank_transactions` | Filters the same rows | read | no | none | none | `nvRequireBankFeedAccess` | T/F/T/F → same | correct | `24981-25086` | keep |
| 19 | `attach_bank_receipt` | Downloads the chat file from the model-supplied https URL (flag-on: a `receiptUrl`, or an `emailReceipt` rendered to HTML), stores it under `bank_receipts/_inbox`, OCRs images with Google Vision, scores the feed; with a `transactionId` or one confident match `assignInboxReceipt` moves the file, overwrites `receiptPath`, **deletes the previous receipt**; otherwise returns candidates, queues a waiting receipt, or deletes the inbox file | write | **yes** | **yes**: outbound fetch of a model-supplied URL; Google Vision; a later auto-attach notifies the user in-app | ChatGPT prompt; server returns candidates and needs an explicit `transactionId` when ambiguous | `nvRequireBankFeedAccess({ ownerOnly: true })` — owner only | F/T/F/T → same | correct; 1.1.1's justification omitted OCR and the deletion | `25087-25257`; `bankFeed.js:1843-1864`; `mcp-inventory` | keep. `nvAssertPublicHttpsUrl` runs only on a non-https input, so the https chat-file URL is fetched unguarded (assessed on the SSRF branch, not here): never describe this fetch as guarded in submission text |
| 20 | `search_inventory` (flags: inventory · orchestrator) | Flag-off handler (not reachable in production): reads ≤400 `inventoryItems`, filters; flag-on: the orchestrator's pure search over a loaded snapshot | read | no | none | none | `nvRequireInventoryAccess` (owner, or Orders area **and** a role that can fully edit orders — a read tool gated by a write-capable role) | T/F/T/F → same | correct | `24725-24751`; `orchestrator/inventory.js`; tests `orchestrator-purity`, `mcp-one-inventory-search`, `mcp-no-money` | keep |
| 21 | `create_inventory_item` (flag: inventory) | Refuses invoice-looking input; **refuses without `confirmed: true`**; `saveItemForWorkspace`; downloads the photo from the model-supplied https URL and stores it | write, additive | no | **yes**: outbound fetch of the photo URL (same unguarded-https shape as row 19) | **server-side** (`confirmed: true`) + ChatGPT prompt | `nvRequireInventoryAccess`; advertised scope `orders.read` — **a write tool advertising a read scope** | F/F/F/T → same | hints correct; the advertised scope is not | `24753-24847`; `mcp-inventory` | if the inventory flag is part of the release, correct the scope to `orders.write` in the same release (`registry.js:639`, the OAuth surface); if not, the tool stays unpublished and the reviewer never sees it |
| 22 | `search_commerce_orders` (flag: orchestrator) | Pure function over the loaded orders, connections and `commerceHealth`; redacted rows; no monetary field; access-log row (`name`, `email`, subject "order", `subject=set`) | read + row | no | none (the provider is never queried) | none | `orchestrator.assertCapability` (Orders area; scope enforced flag-on) | T/F/T/F | correct | `orchestrator/commerce.js`; tests `orchestrator-purity`, `mcp-no-money`, `mcp-reduced-surface`, `outbound-pii-policy` | keep |

Two things the table does not change but the reviewer's rule ("actual behavior") makes worth stating:

- **The read-only carve-out is a position, not a deduction.** Nine tools (six today, nine flag-on) are
  `readOnlyHint: true` and each causes one audit row recording that customer data was shown to an assistant.
  We say so on every one of those tools' own `readOnlyHint` reason (enforced by test). The alternative —
  nine `readOnlyHint: false` reads — would make every read look mutating to the model and would trade an
  audit trail for a word. It has to be signed by the operator before it is sent (§7 C).
- **Nothing in this audit found a fourth wrong value.** The three the registry holds back
  (`create_order.openWorldHint`, `update_order_status.openWorldHint`, `update_order_status.idempotentHint`)
  are the whole difference between the wire and the truth. Two wording tightenings are proposed (rows 13
  and 19), neither of which moves a boolean.

## 5. Registry, dispatcher, listing, annotations, descriptions, release notes — one frozen set?

Measured today in this worktree, on a clean tree:

| Surface | Says | Agrees? | How checked |
|---|---|---|---|
| Registry (`orchestrator/registry.js`) | 22 rows; 19 always published; `search_inventory` under inventory **or** orchestrator; `create_inventory_item` under inventory; `search_commerce_orders` under orchestrator | — (the reference) | `publishedEntries()` over the flag states |
| Dispatcher (`nvChatGPTDispatchAction`) | one `case` per registry row, 22; the orchestrator's `run()` accepts exactly the two capabilities plus one internal alias | yes | test "the tool list, the dispatcher and the registry name the same tools"; `docs/mcp-final-gate-result.md` §3 |
| Published listing (`_nvMcpToolsWithSecuritySchemes`) | 19 / 21 / 21 / 22 across the flag states; flags-off sha256 `7c838fb6…64984` | yes, **byte-identical to production 1.1.1** | `node docs/evidence/capture-tools-list.js` — re-run today: PASS, BYTE-IDENTICAL; `mcp-tools-list-snapshot` |
| Annotations | four literal booleans per row, a `Because …` line per hint, `openWorldHint` ⇔ declared effects, the three live exemptions named | yes | `mcp-tool-annotations.test.js` (1,382-assertion suite green) |
| Descriptions | every gate a description names exists (owner-only, Bank Spending permission, plan gating); the two notifying tools' descriptions do not mention the notification | consistent, with one gap (§4 rows 1 and 5) | read against handlers |
| `initialize.instructions` | flag-off: the 1.1.1 four lines; flag-on: two more (freshness; "creating or updating an order can send that customer an e-mail or SMS") | yes | `index.js:27120-27142` |
| Reviewer-facing table (`docs/mcp-tool-annotations.md`) | the same 22 rows and reasons | yes | test "docs/mcp-tool-annotations.md carries every tool and every reason verbatim" |
| Release notes draft (`docs/mcp-submission-1.2.0.md` §7) | three corrections named; "two read-only tools" new | yes for an orchestrator-only flip; **no** if the inventory flag flips too (then `create_inventory_item`, a write tool, is new to the reviewer and unnamed) | `docs/mcp-backlog.md` §6 item 2, still open |
| Design document | `:1904` says 1.2.0 corrects `create_inventory_item`'s scope; the wire keeps `orders.read` | **no** — a doc sentence, not sent to OpenAI | `docs/mcp-backlog.md` §6 item 1, still open |
| Guide (`chatgpt-app` chapter, EN+TR) | no longer claims the assistant sends no customer messages; the two flagged reads are under "coming in the next version" | yes | `mcp-reduced-surface`, `guide-corpus-fresh` |
| Platform App Info description (1.1.1) | "manage orders, **customers**, personal notes, **tasks, schedules** and financial summaries" | **overstated**: there is no customer, task or schedule tool; `tasks.write` is a scope name with no tool behind it | §2 |
| Evidence stamps (`docs/evidence/*.json`) | candidate captured at `c61057b1`, `functions/` clean | yes — regenerated today; only `meta.commit` and the `index.js` sha moved, both listing hashes unchanged | `docs/mcp-backlog.md` §6 item 3 — **closed by this branch** |

**MCP 1.2.0 flags-off production parity is preserved.** `npm test` in `functions/`: exit 0, 1,382 `PASS`,
0 `FAIL`. Parity harness: production `7c838fb6…64984` = candidate `7c838fb6…64984` at `c61057b1`.

## 6. Previous rejection items — closed or open

| Item | Status | Where it stands |
|---|---|---|
| 1.1.0 — test cases did not produce correct results | **closed in 1.1.1**, not raised again | Data aligned ("OpenAI Review Test Customer"); every expected output is a point-in-time figure (21 orders, GBP 70,534 …) and has to be re-verified on the review workspace before the next submission; the ESET row must start with no receipt |
| "explicitly set to true or false (not null) for every tool" | **closed structurally** | Literal booleans in one table; the registry throws on a non-boolean; the coercion is gone; the wire already carries four booleans on all 19 (evidence snapshot) |
| "annotations … match the tool's behavior" | **closed in the registry, OPEN on the wire** | Three corrections are held behind `NIVADESK_MCP_ORCHESTRATOR`. Production still serves `create_order.openWorldHint=false`, `update_order_status.openWorldHint=false`, `update_order_status.idempotentHint=true`. A resubmission before the flip presents them again |
| "a clear justification … based on the tool's actual behavior" | **closed in code, OPEN on the platform** | Per-hint `Because …` in the registry and `docs/mcp-tool-annotations.md`. The platform's MCP Server section asks for a justification per tool for Read Only / Open World / Destructive; the 1.1.1 form carries boilerplate that is false for nine tools (§3). The 1.2.0 form has to carry the registry's own lines (Appendix A), and the release notes the definitions plus the three corrections — the §7 block does, and a test pins that it names all three |
| *(not in the notice, found today)* the platform's tool scan was stale | **open** | Four scanned values on the 1.1.1 form are pre-correction. Closing it: after the flag-on deploy, run "Scan Tools" on the new draft version and confirm every scanned value equals `registry.annotationsFor(name, {orchestrator:true})` before a single justification is written |

## 7. What has to happen before a resubmission (decisions first, then changes)

Operator decisions — none of these is made yet:

- **A. Which flags flip.** Orchestrator only (recommended: the §7 text is exactly true and the reviewer
  sees two new read-only tools and three corrections) or all three (then `create_inventory_item` and the
  email-receipt inputs go out too, the §7 block has to name a third, write, tool, and the scope correction
  in row 21 becomes mandatory).
- **B. `update_order_status` idempotency** (§5.2 of the submission plan): ship the hint as `false`, or ship
  the no-op guard and keep `true`. The registry's `pendingGuard` fails the build if the two drift.
- **C. Sign the read-only carve-out** (§5.7): nine tools flag-on.
- **D. Production change approval**: `chatgptMcp` redeployed with the flag(s) set, and the web connect page
  deployed before or with it (`studioflow-web/app/chatgpt/connect/ChatGPTConnectClient.tsx` still sends a
  two-scope default that overrides the server's). Both are production changes and are not covered by this
  branch's mandate; the review connection must then be reconnected because its token was minted narrow.

Changes, by file, once A–D are decided:

| File / place | Change | Wire? |
|---|---|---|
| `chatgptMcp` environment | `NIVADESK_MCP_ORCHESTRATOR=1` (+ `NIVADESK_MCP_INVENTORY`, `NIVADESK_MCP_EMAIL_RECEIPTS` if A says so) | yes — the three corrections and the two read tools appear |
| `studioflow-web/app/chatgpt/connect/ChatGPTConnectClient.tsx` | stop defaulting `scope` to `orders.read orders.write` (branch already has it) | OAuth surface |
| `functions/index.js` `nvMcpOrderToolSchemas` | (recommended) flag-gated sentence in `create_order` and `update_order_status` descriptions about the customer notification | yes, flag-on only |
| `functions/index.js` | if B = guard: `nvMcpStatusNoOpGuard`, then flip the registry hint and drop `pendingGuard` in the same commit | yes |
| `functions/orchestrator/registry.js:639` | if A includes inventory: `create_inventory_item` scopes → `orders.write` | OAuth surface |
| `functions/orchestrator/registry.js:430` | wording: "row(s)" on `get_order_financials` | no |
| `functions/index.js:26100` | optional: `serverInfo.version` (§5.6) — cosmetic, on the wire if changed | yes |
| `docs/mcp-submission-1.2.0.md` §5.8 / §7 | make the recommendation and the paste block describe the same flag set (backlog §6 item 2) | — |
| `docs/mcp-orchestration-design.md:1904` | say the wire keeps `orders.read`, or make the correction (backlog §6 item 1) | — |
| `functions/test/fixtures/mcp/tools-list.1.2.0.json` | record the **deployed** listing after the flip and diff it against the registry projection (checklist step 5) | — |
| Guide + corpus + seven assistant functions | move the two "coming" bullets (checklist step 8) | production |
| Platform form — MCP Server | **after** the flag-on deploy: "Scan Tools" on the new draft, verify the 21 scanned values against the registry (three hints per tool on the form; `idempotentHint` is on the wire but not asked), then paste the per-tool justifications from Appendix A — never the 1.1.1 boilerplate | — |
| Platform form — Info | Version `1.2.0`; **Description** rewritten to what the tools do (drop "customers, tasks, schedules"); demo recording re-recorded if the new tools are shown | — |
| Platform form — Testing | re-verify the five cases' figures on the review workspace; add `search_commerce_orders` and `search_inventory` cases (empty `sources` on the manual-only workspace, no money); add one `update_order_status` on an order with automatic updates **off**; reset the ESET row | — |
| Platform form — Submit | Release Notes = the §7 block as finalised under A | — |

## 8. Are we ready to submit?

**No — not today, and not because of the audit.** The audit is complete and finds the wire wrong in exactly
the three places the registry already corrects, plus two wording tightenings. What is missing is the
sequence in front of a submission: decisions A–D, the flag flip and the two deploys, the re-run test cases,
and the release notes finalised for the flag set chosen. Until the corrected values are actually served,
a new version would be reviewed against the same listing that was rejected on 3 September.

Readiness by part:

| Part | Ready |
|---|---|
| Annotation values and justifications (code) | yes |
| Flags-off parity with production | yes, re-proven today |
| Test suite | yes, green |
| Reviewer-facing documents | yes, with two open backlog items that depend on decision A |
| Wire the reviewer will scan | **no** — 1.1.1 bytes until the flip |
| Platform metadata | **no** — tool scan stale and justifications wrong on the last version, description overstated, test figures unverified, release notes not final |
| Operator approvals | **none given**: no flip, no deploy, no submission |

## 9. What this branch changed

Only evidence stamps: `docs/evidence/tools-list-candidate-flags-off.json` `meta.commit` →
`c61057b1…`, `functions/index.js sha256` → `1e329911…`, regenerated on a clean tree
(`node docs/evidence/capture-tools-list.js --write`), listing hash unchanged. No code, no flag, no deploy.
The password shown on the platform's test-credentials field was seen while reading the form and is not
recorded here or anywhere else.

---

## Appendix A — per-tool justifications to paste into the platform's MCP Server section (flag: orchestrator only, 21 tools)

Generated from `functions/orchestrator/registry.js` (`justificationFor`) with `{orchestrator: true}`, the state the
recommendation in §7 A describes. The platform asks for Read Only, Open World and Destructive; the Idempotent line
is included because it is on the wire and belongs in the release notes. Regenerate after any registry edit —
these lines are the code's, and a test keeps `docs/mcp-tool-annotations.md` equal to them.

### create_order  readOnly=false destructive=false idempotent=false openWorld=true
- Read Only (false): Because the call writes a new document in siparisler through nvOrderDefaults with createdFrom "chatgpt".
- Destructive (false): Because it only adds a record: no existing order is changed, moved or removed.
- Open World (true): Because creating an order that carries a status and a customer e-mail address can put a message in that customer's inbox: notifyCustomerOnStatusChange runs on document creation as well as update, and an order with no portalAutoUpdates block counts as enabled with e-mail on, so the mail leaves through NivaDesk's SMTP provider (and Twilio where the workspace enabled SMS).
- Idempotent (false): Because there is no request-level deduplication, so the same arguments called twice create two orders with different ids.

### search_orders  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it queries siparisler by companyId and filters in memory; the only write it makes is the piiAccessLog row recording the read, which records the read rather than changing what the workspace holds.
- Destructive (false): Because no order is altered, moved or removed by a search.
- Open World (false): Because it reads NivaDesk's own order records only and never contacts a shop, marketplace or any other outside system.
- Idempotent (true): Because repeating the same query returns the same rows and creates nothing.

### get_order_detail  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads one order document and the cross-workspace and workflow-assignment checks are reads too; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because reading an order changes nothing on it.
- Open World (false): Because the order is read from NivaDesk's own collection and no outside system is contacted.
- Idempotent (true): Because the same orderId returns the same document and creates nothing.

### add_order_note  readOnly=false destructive=false idempotent=false openWorld=false
- Read Only (false): Because it appends to the order's notes field and adds a historyLog entry.
- Destructive (false): Because the existing note text is kept and the new line is concatenated onto it.
- Open World (false): Because the workspace's customer notification keys on status, which this tool does not touch, so nothing leaves the workspace.
- Idempotent (false): Because each repeat appends the same line again and mints another history entry.

### update_order_status  readOnly=false destructive=true idempotent=false openWorld=true
- Read Only (false): Because the call sets status and/or designStatus on the order document.
- Destructive (true): Because the previous status value is overwritten and is not recoverable from the field.
- Open World (true): Because a status change is what the workspace's own customer notification listens for: notifyCustomerOnStatusChange sends an e-mail through NivaDesk's mail provider, and an SMS through Twilio where the workspace enabled SMS, to the address and number on the order — and it is on by default for an order with no portalAutoUpdates block.
- Idempotent (false): Because a repeat with the same status appends a second historyLog entry (nvHistoryItem mints a new id and timestamp per call, so arrayUnion cannot dedupe), which the order's history shows the user.

### create_note  readOnly=false destructive=false idempotent=false openWorld=false
- Read Only (false): Because it creates a note document under the connected user's own personal_notes collection.
- Destructive (false): Because it only adds a note; no existing note is changed or removed.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.
- Idempotent (false): Because there is no deduplication, so the same text called twice creates two notes.

### search_notes  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the connected user's own notes and filters them in memory; it writes nothing at all, not even an access-log row, because the notes are the caller's own.
- Destructive (false): Because no note is altered by a search.
- Open World (false): Because the notes are read from NivaDesk and no outside system is contacted.
- Idempotent (true): Because the same query returns the same notes and creates nothing.

### get_note_detail  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads one of the connected user's own note documents and writes nothing.
- Destructive (false): Because reading a note changes nothing on it.
- Open World (false): Because the note is read from NivaDesk and no outside system is contacted.
- Idempotent (true): Because the same noteId returns the same note and creates nothing.

### append_note  readOnly=false destructive=false idempotent=false openWorld=false
- Read Only (false): Because it writes the note's text field with the appended paragraph.
- Destructive (false): Because the previous text is kept and the new text is concatenated onto it.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.
- Idempotent (false): Because each repeat appends the same paragraph again, so the note grows on every call.

### update_note  readOnly=false destructive=true idempotent=true openWorld=false
- Read Only (false): Because it sets the note's title, text, labels, links or colour.
- Destructive (true): Because the supplied fields replace the previous values, which are not recoverable from the note.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.
- Idempotent (true): Because it sets an explicit end state: a repeat with the same fields writes the same values, adds no note line and no history entry, and differs only in the server's updatedAt and source stamps.

### pin_note  readOnly=false destructive=false idempotent=true openWorld=false
- Read Only (false): Because it sets isPinned on the note document.
- Destructive (false): Because the flag is reversible by the same tool and no content is lost when it changes.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.
- Idempotent (true): Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument pins rather than toggles.

### archive_note  readOnly=false destructive=false idempotent=true openWorld=false
- Read Only (false): Because it sets isArchived on the note document.
- Destructive (false): Because archiving hides the note without deleting it and the same tool puts it back.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.
- Idempotent (true): Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument archives rather than toggles.

### get_order_financials  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it computes totals over the workspace's own order documents; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no order or payment record is altered by the calculation.
- Open World (false): Because every figure comes from NivaDesk's own records; no bank, payment or accounting provider is called.
- Idempotent (true): Because the same order returns the same figures and creates nothing.

### get_dashboard_summary  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it aggregates the workspace's own orders in memory; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because summarising records does not change them.
- Open World (false): Because the summary is computed from NivaDesk's own records and no outside system is contacted.
- Idempotent (true): Because the same workspace state returns the same summary and creates nothing.

### get_extra_spending_overview  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's spending documents and groups them in memory; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no spending record is altered by the calculation.
- Open World (false): Because the spending rows are already in NivaDesk; no bank or provider is called to produce them.
- Idempotent (true): Because the same period returns the same overview and creates nothing.

### get_financial_overview  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it computes revenue, cost and profit from the workspace's own orders and spending; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no record behind the figures is altered.
- Open World (false): Because every figure comes from NivaDesk's own records; no bank or accounting provider is called.
- Idempotent (true): Because the same period returns the same figures and creates nothing.

### get_bank_spending_summary  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's already-imported bankTransactions rows and classifies them in process; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no transaction row is altered by the summary.
- Open World (false): Because the rows were imported by the bank feed beforehand: this call contacts no bank, no TrueLayer and no PayPal endpoint.
- Idempotent (true): Because the same rows produce the same summary and nothing is created.

### search_bank_transactions  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's already-imported bankTransactions rows and filters them in memory; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because searching does not change a transaction row.
- Open World (false): Because the rows were imported by the bank feed beforehand: this call contacts no bank or payment provider.
- Idempotent (true): Because the same query returns the same rows and creates nothing.

### attach_bank_receipt  readOnly=false destructive=true idempotent=false openWorld=true
- Read Only (false): Because it stores the file under companies/{cid}/bank_receipts and then either assigns it to a transaction, returns candidates, or queues it as waiting.
- Destructive (true): Because assigning to a transaction that already has a receipt replaces it: assignInboxReceipt overwrites receiptPath and deletes the previous file.
- Open World (true): Because the handler downloads the document from a model-supplied https URL and sends it to Google Vision for OCR, so the call reaches systems outside NivaDesk even though it mutates no sales provider.
- Idempotent (false): Because a repeat with the same file stores and scores a second copy, and a repeat with the same inboxPath fails, since the first assignment moved the inbox file.

### search_inventory  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's inventoryItems and filters them in memory; no item is created, reserved or written, and stock rows carry no person fields.
- Destructive (false): Because a search does not touch the stock it finds.
- Open World (false): Because there is no listing or channel data to consult: the items are read from NivaDesk and no outside system is contacted.
- Idempotent (true): Because the same filters return the same items, including two items that share a SKU, which is a search key here and never an identity.

### search_commerce_orders  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it filters orders the loader already read and returns rows; the only write on the path is the piiAccessLog row recording that an assistant was shown customer names, which is a record of the read rather than a change to the workspace.
- Destructive (false): Because searching cannot alter an order: no field is written and no row is removed.
- Open World (false): Because it searches NivaDesk's own order collection; the provider is never queried, even for an order that came from one.
- Idempotent (true): Because the same filters over the same orders return the same rows in the same order.
