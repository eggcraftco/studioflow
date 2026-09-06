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

All of it is dormant with the flags off, and all of it is pinned by tests (`§2.6`).

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

`get_business_attention_summary`, `get_commerce_overview`, `search_commerce_orders`,
`get_channel_performance`, `get_inventory_overview`, `search_inventory_items`,
`get_payout_reconciliation_overview`, `get_integration_health`, `get_accounting_sync_status`,
`get_banking_attention_summary`.

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
| `NIVADESK_MCP_ORCHESTRATOR` | **29** | adds the ten read tools; **two annotation corrections** (§3.1); two extra `initialize.instructions` lines |
| inventory + orchestrator | **31** | all of the above |

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

- **Flag-off, the 19 tools are byte-identical**: names, order, titles, descriptions, input schemas,
  annotation values and advertised scopes. That is not a promise, it is a fixture:
  `test/fixtures/mcp/tools-list-full.json`, four states recorded before the orchestrator existed.
- The OAuth and discovery surface: `mcp.nivadesk.app`, the `.well-known` routes, dynamic client
  registration only, PKCE, the redirect-URI registry, the 401 challenge with
  `scope="orders.read notes.read finance.read"` (**no new scope names in 1.2.0**), 405 on an SSE GET,
  202 on notifications, the `openai-apps-challenge` file.
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

### 5.1 Two inventory searches — pick one (blocking)

With `NIVADESK_MCP_INVENTORY` and `NIVADESK_MCP_ORCHESTRATOR` both on, `tools/list` carries **31** tools
including both `search_inventory` (the older MCP handler) and `search_inventory_items` (the orchestrator
capability). Two tools for one job is the tool sprawl the design forbids, and a reviewer comparing them
would be right to ask. Options:

1. publish `search_inventory_items` and drop `search_inventory` from the listing while keeping its
   dispatch case for any client that learned the name (recommended: the orchestrator version carries the
   filters and the freshness block);
2. keep `search_inventory` and leave `search_inventory_items` unpublished, reachable only through the
   orchestrator for other channels;
3. submit both with descriptions that say which to use — the weakest option, and the one that invites
   the question.

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

**Flag-gated, deliberately.** The dispatcher's gate runs only under `NIVADESK_MCP_ORCHESTRATOR`.
Enforcing scope on the 19 is a behaviour change, and a live connection whose token was minted with the
old default would begin to be refused — that belongs to the operator's 1.2.0 flip, beside the annotation
corrections, not to a merge. Flag off, nothing about scope changes and the tools-list snapshot proves
the wire is unmoved.

**The default grant now covers the listing.** `tools/list` is one document served before any token
exists and cannot be filtered per connection, so everything it advertises must be inside the grant this
server mints when a client asks for none. Three places used to answer that question and disagreed: the
registration response promised all six scopes, the `WWW-Authenticate` challenge asked for all six, and
`chatgptOAuthAuthorize`/`chatgptOAuthApprove` issued `orders.read orders.write` — which would have made
six advertised capabilities uncallable the moment enforcement became real. There is one answer now,
`nvOAuthDefaultScope()` = the registry's `SCOPES_SUPPORTED`, and the connect page no longer sends a
default of its own. A client that names its scopes still gets exactly those. The function's 401
`WWW-Authenticate` challenge named a fourth list — three read scopes — so a client that took it at its
word would have asked for a grant that could not call `create_order`; it names the same list now, which
is the string studioflow-web's proxy already emitted when the function set no header.

**Flip-day, stated plainly.** A token minted before this change with only `orders.read orders.write`
will be refused on the finance and notes tools the moment the flag goes on. The refusal names the
missing scope and tells the user to reconnect, which re-mints the grant at full width. Check the live
token records before flipping.

Related, and a wire change if taken: `create_inventory_item` advertises `orders.read` today, which is a
write tool advertising a read scope. Correcting it to `orders.write` is right and belongs in a
submission, not in a merge.

### 5.5 Audit and access-log corrections

- `privacy/accessLog.js` `ACCESS_SOURCES` has no `rest` and no `whatsapp`, so those reads are filed as
  `unknown`. Add both.
- `chatgptWorkspaceAction` stamps its REST reads as `mcp`.
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

1. Close §5.1, §5.2, §5.7 and §5.8. The rest can follow the submission if it is written down; those four
   change what the reviewer sees.
2. Merge the branch. The listing does not move: the flags are off.
3. Set the chosen flags on `chatgptMcp` and deploy it (functions only, from a clean main checkout —
   remember the branch-divergence rule: a blind `firebase deploy --only functions` from a save branch has
   pushed stale functions before).
4. Record the deployed listing as `test/fixtures/mcp/tools-list.1.2.0.json` from the **deployed** server,
   and diff it against the registry projection for those exact flags. The current fixture has no
   all-three-flags state; generate the one that matches what was deployed.
5. Re-run the five 1.1.1 review test cases on the review account: customer named exactly
   "OpenAI Review Test Customer", ESET row `demo-acc_demo006` reset to no receipt.
6. Add the new review cases: `get_business_attention_summary`, `get_commerce_overview` and
   `get_integration_health` on the review workspace — manual orders only, so the reviewer sees channels
   named as not connected instead of zeros — plus one `update_order_status` on an order with automatic
   updates **off**, so the notification boundary can be demonstrated without mailing a test address.
7. Guide: move the Step B bullets, rebuild the corpus, deploy the seven assistant functions, probe the
   live bot with one question per new capability.
8. Submit 1.2.0 with the release notes below.

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
