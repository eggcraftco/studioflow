# NivaDesk for ChatGPT — submission 1.2.0: what changes, and what does not

Status: submission plan, 6 Sep 2026. Branch `mcp-orchestration`, worktree `/Users/gocmen/Developer/studioflow-mcp`.
Companion documents: `docs/mcp-tool-annotations.md` (the reviewer-facing annotation table),
`docs/mcp-orchestration-design.md` (why), `docs/orchestrator-contract.md` (the module interface).

Nothing in this branch has been deployed. `chatgptMcp` in production is still serving the 1.1.1 listing,
and it will keep serving it after this branch merges, because every new tool and every corrected
annotation sits behind `NIVADESK_MCP_ORCHESTRATOR`, default off. **Flipping a flag is a submission
decision, never a side effect of a merge.**

---

## 1. Where 1.1.1 stands

| version | outcome |
|---------|---------|
| 1.0.0 | published |
| 1.1.0 | rejected — a test-case customer name, and the annotations |
| 1.1.1 | submitted 22 Aug after commit `68222996`; rejected on the annotations again |

The 1.1.1 rejection, in OpenAI's words, asked for two things: every published tool's `readOnlyHint`,
`destructiveHint`, `idempotentHint` and `openWorldHint` "explicitly set to true or false (not null)",
and "a clear justification … based on the tool's actual behavior".

The 1.2.0 blocker is therefore not a feature. It is that answer, and the answer had to survive somebody
reading the handlers — which is how we found that **two hints we shipped were wrong** (§3.1).

---

## 2. What is already in this branch

All of it is dormant with the flags off, and all of it is pinned by tests (`§2.6`). "Dormant" is a
claim about the wire, and it is checked in both halves: `tools/list` is byte-identical in all four
non-orchestrator flag states (`test/fixtures/mcp/tools-list-full.json`), and the OAuth surface —
what a connection is MINTED with and what the 401 challenge asks for — is byte-identical too, because
the widened default that §5.4 describes is itself behind `NIVADESK_MCP_ORCHESTRATOR`
(`mcp-scope-enforcement.test.js`, "flag off, the OAuth surface mints and challenges exactly what
1.1.1 does"). It was not, for four days: the mint sites and the challenge widened unconditionally, so
a deploy with the flag off would have changed what every new connection recorded.

### 2.1 One registry, four literal booleans, one reason each

`functions/orchestrator/registry.js` is now the single table behind `tools/list`, the OAuth scopes and
the channel policy. It carries, per tool: the four hints as literal booleans, a `Because …` line for
each, the outward `effects`, the `pii` categories, the permission descriptor, the risk class and the
minimum identity assurance. It validates itself before it describes, publishes or dispatches anything
and **throws rather than serve a listing with a hole in it** — on the MCP surface alone, so a malformed
tool entry no longer fails the cold start of the other 400-odd functions that share this deployment. The old path coerced every hint with `=== true`, which would have shipped a `null`
silently as `false` — exactly the class of mistake the rejection points at.

`docs/mcp-tool-annotations.md` is the same table for a reader, and a test asserts the document and the
code say the same thing about every tool.

### 2.2 The definitions the values are decided by

Written down so a hint is decided by a test instead of an opinion, and so the reviewer can check our
reasoning rather than our conclusion:

- **The unit being annotated is the observable effect of calling the tool, not the lines in its handler.**
  If a workspace-configured Firestore trigger turns the handler's write into an e-mail or an SMS, that
  effect belongs to the tool.
- `readOnlyHint` — no write of workspace state, no external call with a side effect, no trigger. One
  disclosed carve-out: the `piiAccessLog` row that records a read of customer data (§5.7).
- `destructiveHint` — a call can overwrite, replace, move or delete something the workspace had.
  Purely additive writes and reversible booleans are `false`.
- `idempotentHint` — a second identical call produces no new document, no new sub-record, no change to a
  user-visible field **and no outbound message**. Bookkeeping stamps are excluded.
- `openWorldHint` — the call reaches outside NivaDesk: a URL fetch, a third-party API, a provider
  mutation — whether the handler does it or a trigger the workspace configured does it in consequence.

### 2.3 Ten cross-channel read capabilities

`search_inventory`, `get_business_attention_summary`, `get_commerce_overview`,
`search_commerce_orders`, `get_channel_performance`, `get_inventory_overview`,
`get_payout_reconciliation_overview`, `get_integration_health`, `get_accounting_sync_status`,
`get_banking_attention_summary`.

The first of them is also published by `NIVADESK_MCP_INVENTORY` on its own, where an older handler
answers it. It was a separate capability called `search_inventory_items` until §5.1 was closed.

They live in `functions/orchestrator/` as pure functions over a loaded snapshot, with the MCP tools as
thin adapters, so the WhatsApp channel can reuse them without a second copy of the business rules
(`docs/orchestrator-contract.md`). Each is read-only, class A, assurance 1, and reads only the domains
it declares.

Every one of them answers in the same envelope: `state`, `data`, `freshness.sources[]`, `partial`,
`warnings[]` (a closed list of codes), `entityRefs`, `suggestedActions`, `summary.lines`. The three
honesty rules that matter to a reviewer, because they are visible in a demo:

- a channel that is **not connected** is named as not connected, never counted as zero — which is what
  the review workspace will show for Shopify, Etsy, Amazon and eBay;
- a source that contributed rows but cannot report a sync time sets `partial: true` and says which;
- amounts in another currency are listed in their own rows and never converted.

### 2.4 Discovery text, gated

With `NIVADESK_MCP_ORCHESTRATOR=1`, `initialize.instructions` gains two lines: one telling the model
never to present a stale or partial figure as live, and one telling it that creating or updating an
order can send that customer an e-mail or SMS. With the flag off the instructions are the 1.1.1 bytes.

### 2.5 Guide

The in-app guide's `chatgpt-app` chapter (EN + TR) is live in this branch and corrected: it no longer
claims the assistant "does not send messages to your customers", because a status change made from
ChatGPT fires the workspace's own notification exactly as the app does. That correction is **not gated**
— it describes the 19 tools that are live today.

The four cross-channel bullets are written in the same chapter under "Coming in the next version of the
app" / "Uygulamanın sonraki sürümünde geliyor", marked as not yet published. When the flags flip, move
those bullets into "What you can ask", delete the heading and its caveat bullet, rebuild the corpus
(`node functions/assistant/buildGuideCorpus.js`), deploy the seven assistant functions and probe the
live bot — the guide rule, unchanged.

### 2.6 What pins it

| test | what it would catch |
|------|---------------------|
| `test/qa/mcp-tool-annotations.test.js` | a null/missing hint, a missing reason, a hint that disagrees with the declared effects, a doc that drifted from the table |
| `test/qa/mcp-tools-list-snapshot.test.js` | the reviewed listing moving: four pre-orchestrator flag states recorded from `index.js` at commit `bc718e06` |
| `test/qa/orchestrator-*.test.js` | the capabilities, the envelope, the renderer, the permission order, the module purity |
| `test/qa/orchestrator-contract.test.js` | the reuse contract and its document |
| `test/qa/guide-*.test.js` | a guide edit that was never rebuilt into the corpus; a ChatGPT chapter that stops being honest about notifications |

---

## 3. What changes on the wire

Nothing changes until a flag is set to `"1"` in the deployed function's environment. Per flag:

| flag | tools | other changes on the wire |
|------|-------|---------------------------|
| none (today) | **19** | — |
| `NIVADESK_MCP_EMAIL_RECEIPTS` | 19 | `attach_bank_receipt` gains `receiptUrl` / `emailReceipt` inputs and two description sentences |
| `NIVADESK_MCP_INVENTORY` | **21** | adds `search_inventory`, `create_inventory_item`; one sentence appended to `attach_bank_receipt`'s description |
| `NIVADESK_MCP_ORCHESTRATOR` | **29** | adds the ten read tools — one of which is `search_inventory`, with the filters and the freshness block; **two annotation corrections** (§3.1); two extra `initialize.instructions` lines |
| inventory + orchestrator | **30** | all of the above, and **not 31**: `search_inventory` is the one tool both flags publish, so it is listed once (§5.1) |

### 3.1 The two annotation corrections — the headline of the release notes, not a footnote

| tool | hint | 1.1.1 serves | verified | why the verified value is right |
|------|------|--------------|----------|--------------------------------|
| `create_order` | `openWorldHint` | false | **true** | `notifyCustomerOnStatusChange` (`index.js`, `onDocumentWritten` on `siparisler/{orderId}`) runs on creation as well as update, and `cleanPortalAutoUpdates` defaults to `{enabled:true, email:true, sms:false}`, so an order created with a customer e-mail address puts a message in that customer's inbox through NivaDesk's SMTP provider |
| `update_order_status` | `openWorldHint` | false | **true** | same trigger, on every status change; SMS too where the workspace has it enabled |
| `update_order_status` | `idempotentHint` | true | **false** | a repeat appends a second history entry: `nvHistoryItem` mints a fresh `crypto.randomUUID()` and `Timestamp.now()` per call, so the `arrayUnion` can never dedupe. No second customer message goes out — the trigger returns early when the status is unchanged, and re-announces the same status at most once in 24 hours — but a new sub-record on every call is enough to fail the definition |

The third row is a decision, not just a report: either the no-op guard ships and the hint stays `true`
honestly (§5.2), or the hint goes out as `false`. The registry's `pendingGuard` mechanism fails the
build if somebody adds the guard without flipping the hint, so the two cannot drift.

These three are the ONLY hints on which the served listing and the verified table are allowed to
differ, and they are declared one by one in `registry.LIVE_HINT_EXEMPTIONS`. The load-time check that
compares `openWorldHint` against a tool's declared effects — the check that would have caught the 1.1.1
rejection — now runs over the values actually being served as well as the verified ones, and any other
difference between the two sets fails the load with the tool and the hint named. Until this, the half
of the table that ships was the half nothing structural checked.

### 3.2 Result shape

The ten new tools return the envelope described in §2.3 inside `structuredContent`. The existing 19
return exactly what they return today; none of their shapes changes.

---

## 4. What stays

- **Flag-off, the 19 tools have not moved since the fixture was recorded**: names, order, titles,
  descriptions, input schemas, annotation values and advertised scopes. That is a fixture rather than a
  promise — `test/fixtures/mcp/tools-list-full.json`, four flag-off states recorded from index.js at
  commit `bc718e06`, before the orchestrator capabilities existed. Read the scope of that claim exactly:
  `bc718e06` is a commit on THIS branch, not the deployed 1.1.1 tree, so the fixture proves the listing
  has not moved since it was recorded, not that it equals what the review connection is being served.
  Between the merge base with `main` (`f753a8ca`) and `bc718e06` the branch added three tools
  (`get_bank_spending_summary`, `search_bank_transactions`, `attach_bank_receipt`), corrected six
  annotation values across four tools (`update_order_status`, `update_note`, `pin_note`, `archive_note`)
  and renamed "Lite" to "Starter" in two descriptions — all of which §3 covers as intended 1.2.0 changes.
  Each of those four has been replayed and each is true of `f753a8ca`.

  **Name the commit, never "the merge base".** This branch has two, and they are different: `f753a8ca`
  is `git merge-base HEAD main`, and `015d5792` is the merge base with the deploy branch
  `macbook-save-before-macstudio-2026-06-01`. Only the second was ever deployed, which is why the
  changes above are true and simultaneously irrelevant to a parity question. Measured against the
  deployed tree, the flags-off wire did not move by a byte — the three "new" tools are numbers 17, 18
  and 19 of the production listing, the six annotation values are what production serves today, and the
  production listing already says "Starter". `docs/mcp-production-parity.md` carries that measurement,
  and it **discharges** the diff this bullet used to ask for: `states.off.tools` in the fixture is
  byte-identical to the reconstructed production listing, so the two claims are no longer conflated —
  they are separately established.
- The OAuth and discovery surface: `mcp.nivadesk.app`, the `.well-known` routes, dynamic client
  registration only, PKCE, the redirect-URI registry, 405 on an SSE GET, 202 on notifications, the
  `openai-apps-challenge` file. One qualification, since "stays" is read literally here: the dynamic
  **registration response** is not what `f753a8ca` returned — the merge base with `main`, replayed and
  confirmed, not inferred. It echoed all six scopes unconditionally and carried no `redirect_uris` or
  `client_name`; HEAD returns `body.scope || six` plus both fields. (The DEPLOYED tree, `015d5792`,
  already returns both fields with the same six-scope default, so nothing here moves for a review
  connection.) That is `14ff0cfb`, the redirect-URI registry, it predates the fixture recording, and it
  is not flag-gated — it belongs in §3 as a 1.2.0 change, not here as something unchanged. The scope
  NAMES are what has not moved. **No new scope names in 1.2.0** — the metadata and the registration
  response have advertised the same six since before this branch, verified by replaying the
  merge-base tree. What DOES change, and only when the flag goes on, is which of those six a
  connection is minted with and which the 401 challenge asks for: flag off, the challenge is
  `scope="orders.read notes.read finance.read"` and the default mint is `orders.read orders.write`,
  exactly as 1.1.1 serves them; flag on, both name all six. See §5.4, and
  `mcp-scope-enforcement.test.js` pins both states.
- The `attach_bank_receipt` flow: one confident match attaches; several return candidates plus an
  `inboxPath`; the second call passes `transactionId` + `inboxPath` with no re-upload; no match with an
  amount queues the receipt; owner-only; `_meta["openai/fileParams"]: ["receipt"]`.
- Orders, Notes and Finance behaviour and gates: workflow-only members see only their own orders, money
  fields are stripped for roles without the Financial permission, the workspace Orders switch is
  honoured, and a tool behind an off flag is not dispatchable even if its name is guessed.
- PII policy: no path returns customer fields outside `redactForChannel`; `restrictedCustomer` never
  leaves the server; Amazon and eBay appear only as canonical NivaDesk records with `order_source`
  preserved.
- The review workspace, its connection and its demo rows.
- No per-provider tools, no per-agent tools, no generic "do anything" action tool, and **no external
  provider write from ChatGPT in this version**. The customer notification is the workspace's own
  message, annotated rather than added.

---

## 5. Before this can be submitted

Each item is either a decision only the operator can make or a piece of work with a named owner in the
code. None of them is optional in the sense of "we can explain it later" — the reviewer reads the
listing, and the listing is the claim.

### 5.1 Two inventory searches — CLOSED, one is published

Settled 6 Sep 2026. The full field-by-field comparison and the evidence are in
`docs/mcp-inventory-search-decision.md`; the short version:

**Neither of them is public.** The rule was "whichever is public in production 1.1.1 today is
canonical", and the answer to that question is *neither*: production runs with every MCP flag unset, so
`tools/list` there is the 19 tools and carries no inventory search at all. There was no incumbent to
protect, so the choice was made on the merits.

**One published name, `search_inventory`; the orchestrator's implementation behind it.** The registry
row for `search_inventory` is now gated by *both* flags, and `search_inventory_items` has no registry
row at all — it survives as an internal alias (`orchestrator/index.js` `CAPABILITY_ALIASES`) so a caller
that learned the name still resolves, but it can never be published or dispatched by name over MCP.

Why this way round rather than option 1 as it was written here (publish `search_inventory_items`, drop
`search_inventory`): the inventory flag on its own would then have published `create_inventory_item`
with no search beside it, and the whole point of the search is the sentence in its own description —
"use it before adding something, so an item the workshop already has gets topped up instead of
duplicated". A create tool with no search next to it is a duplicate-maker.

What moved, so nothing useful was dropped: the merged tool returns `number` (the item number on the
label and in the QR) and `unit` (what `onHand` counts), the two fields only the older handler had.

Wire effect: `inventory + orchestrator` is **30** tools, not 31. With the orchestrator flag off nothing
moves — the inventory-only listing is byte-identical to what it has always been, and the older handler
still answers it, because everything new on this branch stays behind `NIVADESK_MCP_ORCHESTRATOR`.

Pinned by `test/qa/mcp-one-inventory-search.test.js`, which fails if a second inventory search ever
appears in a published listing in **any** flag state.

### 5.2 `update_order_status` idempotency (blocking)

Ship `nvMcpStatusNoOpGuard` — a repeat of the status the order already has returns success without
writing, without a history entry and without a notification — and `idempotentHint` stays `true` as it is
on the wire today. Without the guard the hint goes out as `false`, which is honest but is a third wire
change to explain. The registry entry already names the guard token; adding it without flipping the hint
fails the build.

### 5.3 `attach_bank_receipt` URL fetch (blocking if `NIVADESK_MCP_EMAIL_RECEIPTS` is flipped)

`nvAssertPublicHttpsUrl` is called only when the URL is *not* https, and the guard rejects non-https on
protocol — so on the path that matters it never runs. Describe the download by what the guard actually
does, or make the guard real. Making it real needs one piece of information the code does not have: a
real ChatGPT file host from a review-workspace call log, to pin the allowlist. Until that host is
supplied the allowlist test is pending rather than passing.

### 5.4 Scopes: one rule, and what a token with no scope may do

`nvMcpOAuthScopesForTool` reads the registry, so the advertised scope per tool is single-sourced. The
enforcement of it now has ONE rule, stated in orchestrator/context.js and applied from one function
(`missingScopes`) over that same table:

> **A delegated grant is the whole of what that caller may do.**

- **A token with no scope may do nothing.** The check used to be `granted.size > 0 && required.some(…)`
  — "deny if the token names scopes and one is missing" — so a token carrying no scope string passed
  every gate while the file's header claimed enforcement. An empty grant is not every grant; it is a
  token that was granted nothing, and it is refused with a message that says to reconnect.
- **A member signed into NivaDesk is not a token.** `chatgptWorkspaceAction` (and the non-OAuth branch
  of `nvRequireChatGPTWorkspaceAccessWithOAuth`) authenticates a Firebase ID token: the person acting
  for themselves, no consent screen, no third party, no delegated grant, and so nothing to check. That
  context now says so — `authType: "firebase_session"` — and the gate asks WHO is calling rather than
  whether a string happens to be empty. Role, area, financial and bankFeed gates apply to them exactly
  as before. The list is closed the safe way round: an auth type nobody has named is treated as a token
  and must carry its scopes.
- **All 29 tools, not just the ten.** `nvMcpAssertScope` applies the same function over the registry's
  `scopes` in the dispatcher, so `get_financial_overview` can no longer answer a token that
  `get_commerce_overview` refuses.

**Flag-gated, deliberately — and that now covers the mint and the challenge too.** The dispatcher's
gate runs only under `NIVADESK_MCP_ORCHESTRATOR`. Enforcing scope on the 19 is a behaviour change, and
a live connection whose token was minted with the old default would begin to be refused — that belongs
to the operator's 1.2.0 flip, beside the annotation corrections, not to a merge. Flag off, nothing
about scope changes: the tools-list snapshot proves the listing is unmoved, and
`mcp-scope-enforcement.test.js` proves the OAuth surface is too.

**The default grant covers the listing — on the same switch as the enforcement it exists for.**
`tools/list` is one document served before any token exists and cannot be filtered per connection, so
everything it advertises must be inside the grant this server mints when a client asks for none. Three
places used to answer that question and disagreed: the registration response promised all six scopes,
the `WWW-Authenticate` challenge asked for three read scopes, and
`chatgptOAuthAuthorize`/`chatgptOAuthApprove` issued `orders.read orders.write` — which would have made
six advertised capabilities uncallable the moment enforcement became real. There is one answer now,
`nvOAuthMintDefaultScope()`, and the connect page no longer sends a default of its own. A client that
names its scopes still gets exactly those.

The widening is behind the flag, which the first version of this section got wrong. With the flag off
nothing enforces scope, so a wider default changes nothing a caller can DO and everything a connection
RECORDS: every connection minted after such a deploy — including the one OpenAI's reviewer creates —
would store `notes.write`, `tasks.write` and `finance.read` it did not carry before, invisibly, until
flip day. An access token lives thirty days, so turning the flag back off would not take those grants
back. Flag off, this server mints `orders.read orders.write` and challenges with
`orders.read notes.read finance.read`, byte for byte what 1.1.1 serves. Flag on, both are the
registry's `SCOPES_SUPPORTED` — the same list the metadata and the registration response have always
advertised, and the string studioflow-web's proxy already emits when the function sets no header.

**Half of that fix is a web deploy, and it is not optional (blocking).** The connect page is
`studioflow-web/app/chatgpt/connect/ChatGPTConnectClient.tsx` in this worktree, and the page that is
LIVE still reads `scope: params.get("scope") ?? "orders.read orders.write"`. When ChatGPT names no
scope, that live page names two — so the server never reaches its own default and the connection is
minted narrow whatever `nvOAuthMintDefaultScope()` says. The web deploy goes out **before or with**
the flag flip — see the new step in §6. Nothing else on this branch needs a web deploy, which is
precisely why it is easy to miss. Until the flip, the live page and the flag-off server agree
(`orders.read orders.write`), so deploying the function alone changes nothing — which is the point of
putting the widening behind the flag.

**Flip-day, stated plainly.** Every token minted before the flip carries `orders.read orders.write`
and will be refused on the finance and notes tools the moment the flag goes on — including the ones
minted between this deploy and the flip, because the default widens with the flag rather than ahead of
it. The refusal names the missing scope and tells the user to reconnect, which re-mints the grant at
full width. Check the live token records before flipping, and expect to reconnect the review
connection.

**And the client will not offer to do it.** The refusal a pre-flip connection meets is a tool-level
`permission-denied` from `context.scopeRefusal`, not a 401 with a `WWW-Authenticate` challenge, so
ChatGPT has no signal to re-run OAuth on its own: the user has to disconnect and reconnect NivaDesk by
hand. That is why the refusal text says "Reconnect NivaDesk in ChatGPT" in words rather than relying on
the client to prompt, and why the review connection has to be reconnected deliberately as step 6 rather
than assumed to heal itself on the next call.

Related, and it gets worse the day this is enforced: `create_inventory_item` advertises `orders.read`
today — a write tool advertising a read scope. While nothing checked scope that was a wire inaccuracy.
Once `nvMcpAssertScope` runs, `scopesFor("create_inventory_item")` is the list the gate demands, so a
connection granted only `orders.read` satisfies the scope gate on a tool that creates a document. The
permission gate still applies (`nvRequireInventoryAccess`, write), so this is not an open door; it is a
read grant that does not mean what it says. Correcting it to `orders.write` is a wire change and belongs
in this submission rather than in a merge — and it belongs with the flag, not after it, because
`NIVADESK_MCP_INVENTORY` is what publishes the tool in the first place.

### 5.5 Audit and access-log corrections

- ~~`privacy/accessLog.js` `ACCESS_SOURCES` has no `rest` and no `whatsapp`, so those reads are filed as
  `unknown`. Add both.~~ ~~`chatgptWorkspaceAction` stamps its REST reads as `mcp`.~~ **Done for
  `rest`.** `ACCESS_SOURCES` carries it, the two HTTP entry points stamp `surface` (`"mcp"` on
  `nvHandleMcpToolCall`, `"rest"` on `chatgptWorkspaceAction` — the auth helper cannot decide it,
  because an MCP call authenticated with a member's own ID token is still an MCP call), and
  `nvMcpPiiAccessEntry` reads it. `whatsapp` is NOT added: the channel does not exist yet, and a
  source nothing can write is a vocabulary entry pretending to be a control. It goes in with CH-3.
- **Done: a row with no subject says it read a set.** `search_orders` without an `orderId`,
  `search_commerce_orders` and `get_banking_attention_summary` take no record id because they read a
  SET, and `subject.id: ""` with nothing said reads as a subject that went missing. The row now
  carries `subject=set` in its note — the convention `run()` already uses for the marketplace-block
  rows — while a read that names a record still names it. `run()` files its own row the same way now,
  with `channel=<type>` beside it, because `source` is normalised against `ACCESS_SOURCES` at write time
  and a WhatsApp read would otherwise lose the channel entirely.

  `recordCount` stays 1: the row is written before dispatch, so the count is genuinely not known yet.
  That is a real limitation of writing before the read rather than a fact about the data —
  `search_commerce_orders` can project a thousand orders under a row that says 1 — so it is now written
  where an auditor meets it (`privacy/accessLog.js`, beside the field, and
  `docs/orchestrator-contract.md` §5.4) instead of only in this operator's page.
- **Done, behind the flag: the two bank tools now record the read.** `get_bank_spending_summary`
  returns `topMerchants[].merchant` and `recurringSubscriptions[].merchant`; `search_bank_transactions`
  returns `merchant: tx.counterparty`. A person-to-person payment puts a person in that field, both
  declared `pii: ["name"]`, and neither read was recorded — while `get_banking_attention_summary`, which
  reads the same collection and declares the same category, does. The newest door to bank counterparty
  names was audited and the two oldest were not, which is the "one body of data, two doors" objection
  §5.4 settles for scope and this branch settles for inventory.

  The argument for leaving it open was that turning a write on for the live 1.1.1 connection is the
  operator's call, not a merge's. That is right about the risk and wrong about the remedy: every other
  behaviour change on this branch — the annotation corrections that move the wire, the whole
  scope-enforcement gate — ships behind `NIVADESK_MCP_ORCHESTRATOR`, and so does this. Both entries now
  declare `piiAccessLogged: true`, `piiSubject: "bank_transaction"` and
  `piiAccessLoggedFlag: "orchestrator"`; `nvMcpPiiLogFlagOn` is the single predicate that reads it, in
  both the dispatcher's list and its row builder; and `assertRegistry` refuses a flag name
  `normalizeFlags` does not know. **Flag off, nothing changes** — no new write, and the tools/list
  fixture is unmoved, because `justification` and `piiAccessLogged` are not on the wire. Flag on, every
  PII path on this surface writes its row. `mcp-tool-annotations.test.js` asserts both states, and
  refuses any registry entry that declares a `pii` category without declaring the row.
- ~~`MCP_ACTIONS_READING_PII` duplicates the registry's `pii` field; the registry should be the only
  list.~~ **Done.** The dispatcher derives the set from `piiAccessLogged`, and builds each row's
  `categories` from the entry's `pii` and `subject.kind` from its new `piiSubject`. Before that every
  logged action declared name/email/phone/address and a subject kind guessed from the tool's name, so
  the log claimed a bank-counterparty read had exposed a phone number and a postal address, filed as an
  order. `assertRegistry` now refuses a logged entry with no valid subject kind and an unlogged entry
  that names one.
- ~~Marketplace PII blocks made on the orchestrator path are never recorded.~~ **Done.**
  `loaders.projectOrderForAssistant` hands each audited outbound decision back to its caller (it stays
  pure and writes nothing) and `run()` files it through an injected `recordPiiBlock` — one row per
  provider and reason, carrying `recordCount`, rather than one per order over a read of up to a
  thousand. Before this, a block by one of the ten read capabilities left no trace while the same block
  by `search_orders` left one, which is the failure privacy/outbound.js's third rule names: a block
  nobody can see is indistinguishable from a feature that quietly does not work.
- The orchestrator's audit record needs its collection (`companies/{cid}/assistantAudit`), a retention
  rule and a Firestore rules entry — remembering that the `companies/{cid}` wildcard is a **deny list**:
  a new sensitive subcollection that is not named in all three places is readable by every member.

### 5.6 `serverInfo.version`

The runtime serves `{ name: "NivaDesk", version: "0.1.0" }` and does not change it with any flag. "1.2.0"
is the app-listing version, not the MCP server's. Decide whether to bump `serverInfo` — and if so, gate
the bump, because it is on the wire and the review connection is live on the current bytes.

### 5.7 The `readOnlyHint` carve-out (a position to sign off, not a bug)

Six live read tools (`search_orders`, `get_order_detail`, `get_order_financials`,
`get_dashboard_summary`, `get_financial_overview`, `get_extra_spending_overview`) and two of the new ones
(`search_commerce_orders`, `get_banking_attention_summary`) write one `piiAccessLog` row per call,
recording that a person's details were shown to an assistant. We call them read-only and say so in each
tool's own `readOnlyHint` justification. The alternative — flipping eight `readOnlyHint`s to `false` — is defensible
under a literal reading of "changes no persistent state" and would make every read tool look mutating to
the model. Recommendation: keep the carve-out, disclosed on each tool. The operator signs this off,
because it is the one annotation position a reviewer could reasonably disagree with.

### 5.8 Flip order

Recommended: all three flags together, one submission, so the reviewer sees the finished surface once —
and, more importantly, so the corrected annotations reach the wire. Inventory-and-email first would leave
two known-wrong `openWorldHint` values live for longer.

---

## 6. Submission checklist (operator)

Nothing here runs from this worktree; it is the order the steps have to happen in.

1. Close §5.1, §5.2, §5.7 and §5.8, and decide the two bank tools' access-log flags (§5.5). The rest can
   follow the submission if it is written down; those change what the reviewer sees or what is recorded.
2. Merge the branch. The listing does not move: the flags are off.
3. **Deploy the web connect page** (§5.4). It is the only web change on this branch and the flag flip is
   half-done without it: the live page still names `orders.read orders.write` when ChatGPT names none,
   which overrides the server's own default and mints exactly the narrow token that flip-day then
   refuses. Before or with step 4, never after. (Deploying it EARLY is harmless: with the flag off the
   server's own default is the same two scopes.)
4. Set the chosen flags on `chatgptMcp` and deploy it (functions only, from a clean main checkout —
   remember the branch-divergence rule: a blind `firebase deploy --only functions` from a save branch has
   pushed stale functions before).
5. Record the deployed listing as `test/fixtures/mcp/tools-list.1.2.0.json` from the **deployed** server,
   and diff it against the registry projection for those exact flags. The current fixture has no
   all-three-flags state; generate the one that matches what was deployed.
6. Re-run the five 1.1.1 review test cases on the review account: customer named exactly
   "OpenAI Review Test Customer", ESET row `demo-acc_demo006` reset to no receipt. Reconnect the review
   connection after step 4: its grant was minted before the flip and carries two scopes, which the
   finance and notes tools now refuse (§5.4, flip-day).
7. Add the new review cases: `get_business_attention_summary`, `get_commerce_overview` and
   `get_integration_health` on the review workspace — manual orders only, so the reviewer sees channels
   named as not connected instead of zeros — plus one `update_order_status` on an order with automatic
   updates **off**, so the notification boundary can be demonstrated without mailing a test address.
8. Guide: move the Step B bullets, rebuild the corpus, deploy the seven assistant functions, probe the
   live bot with one question per new capability.
9. Submit 1.2.0 with the release notes below.

---

## 7. Release notes for the reviewer (draft to paste)

> **Annotations.** All four hints are explicit booleans in source and on the wire for every published
> tool; there are no nulls and no coercion left in the path — the values now come from one table
> (`orchestrator/registry.js`) that refuses to load if a hint is not a literal `true` or `false`, if a
> justification is missing, or if a hint disagrees with the outward effects the tool declares. Each tool
> carries a written justification per hint.
>
> **Two values changed since 1.1.1, and both are corrections we found by tracing each tool's effect
> rather than its handler.** `create_order` and `update_order_status` are now `openWorldHint: true`:
> creating an order or changing its status fires the workspace's own notification rules, which e-mail the
> customer — and send an SMS where the workspace has SMS enabled — through our provider. The write is
> ours; the message leaves our domain, so the hint is true. We would rather correct this ourselves than
> defend the old value.
>
> **Definitions we used** (also in the tool justifications): read-only means no write of workspace state,
> no external call with a side effect and no trigger — with one disclosed exception, an access-log row
> that records a read of customer data; destructive means an existing value can be overwritten, replaced
> or deleted; idempotent means a second identical call produces no new record, no user-visible change and
> no outbound message; open-world means the call reaches outside NivaDesk, whether directly or through a
> trigger the workspace configured.
>
> **New in this version:** ten read-only tools that answer across a workspace's sales channels, stock,
> payouts, connection health, accounting preparation and bank feed. Every one of them reports how fresh
> its data is and what it could not include; a channel the workspace has not connected is named as not
> connected rather than counted as zero, and amounts in other currencies are listed separately rather
> than converted. None of them writes anything, calls a shop, marketplace or bank, or modifies an
> external provider.
>
> **Unchanged:** the OAuth and discovery surface, the scope names, the workspace and role model, and the
> behaviour of the tools from 1.1.1.
