# OpenAI resubmission package — NivaDesk for ChatGPT 1.2.0 (10 September 2026)

Branch `openai-resubmission` (worktree `/Users/gocmen/Developer/studioflow-openai-review`). This is the
package the operator asked for after taking decisions A–C on the readiness report
(`docs/openai-resubmission-readiness-2026-09-09.md`): what closed, what is still open, the exact flag set,
the wire the reviewer will scan, the tests, the deploy package and its order, and the texts to paste into
the platform. **Nothing is deployed and nothing is submitted by this package**; both are the operator's
separate acts, and the platform form is not touched before the flag-on deploy (Scan Tools reads the
server).

## 1. Decisions, as applied

| Decision | Applied as | Where |
|---|---|---|
| **A** — orchestrator flag only; no inventory write tool | Release flag set = `NIVADESK_MCP_ORCHESTRATOR=1`; `NIVADESK_MCP_INVENTORY` and `NIVADESK_MCP_EMAIL_RECEIPTS` stay unset. `create_inventory_item` remains unpublished; its `orders.read` scope is left as it is and documented as deferred to the release that publishes it | submission §5.8; registry comment at `create_inventory_item`; design `:1900-1904`; backlog §6 item 1 |
| **B** — `update_order_status` `idempotentHint: false`, no no-op guard | Registry: hint stays `false` (a correction from 1.1.1's `true`), `pendingGuard` removed; the guard-token rule stays armed for a future release and is exercised on a clone in the test | `orchestrator/registry.js`; `mcp-tool-annotations.test.js` "assertRegistry refuses…"; submission §5.2; annotations doc "Corrections" |
| **C** — keep the nine-tool access-log carve-out; reasons must say the row; no "writes nothing" that is false | Every `readOnlyHint: true` tool that files the row says so in its own reason (test-enforced). `get_order_financials` now says it can file two rows (the second records a withheld marketplace buyer name). The one paragraph that said the flagged reads "write nothing" now says the modules write nothing and the dispatcher files the disclosed row; the release notes no longer say "neither writes anything" | registry; `docs/mcp-tool-annotations.md`; submission §7 |

## 2. Readiness items — closed and open

| Item (readiness §7 / operator list) | Status | How |
|---|---|---|
| `create_order` / `update_order_status` notification side effect on the tool itself | **closed** | Flag-gated sentence appended to both descriptions ("The workspace's own notification rules run on this change: it can send the customer an e-mail or SMS. Say so before you do it."); `openWorldHint: true` with the trigger named in the reason; `initialize.instructions` already said it flag-on |
| `get_order_financials` audit wording | **closed** | reason says "rows … one for the read itself, and a second when the outbound policy withholds a marketplace buyer's name" |
| `attach_bank_receipt` OCR / third party / replace-and-delete | **closed** | reason (already) names Google Vision, the model-supplied URL fetch, the overwrite and the deletion; flag-gated sentence appended to the description ("Image receipts are read with Google Vision OCR. Attaching to a transaction that already has a receipt replaces it, and the previous file is deleted."); release notes say it |
| `ChatGPTConnectClient.tsx` narrow-scope default | **closed in code, needs the web deploy** | the branch already sends `scope: ""` (server decides); production web still sends `orders.read orders.write` — web deploy is in §5 |
| wrong scope claim (design `:1904`) | **closed** | rewritten in place: the correction is not in 1.2.0, the wire keeps `orders.read` for an unpublished tool |
| release notes ↔ flag set | **closed** | §5.8 decides the orchestrator flag alone; §7 describes exactly that wire, including the three description sentences and the two bank tools' access-log row |
| guide | **closed in code, deploys after the flip** | the two released searches moved into "What you can ask" (EN+TR); the photo add stays under "Coming…", with a caveat that counts one; corpus rebuilt; `mcp-reduced-surface` now keys each block on the release flag set |
| tools-list fixture consistency | **closed** | `tools-list-full.json`: the two orchestrator states re-recorded; the four flag-off states untouched (byte-identical); the only records that changed are the three tools with appended sentences, pinned by the snapshot test |
| customer / task / schedule promises | **closed in the texts below** | the platform Description in §7 names only what the tools do. The dead scope name `tasks.write` is deliberately left in `scopes_supported`: removing it changes the OAuth surface the release notes promise is unchanged; tracked as a follow-up |
| reviewer-facing "writes nothing" statements | **closed** | see C above |

**Still open (blockers and follow-ups):**

1. ~~**Dependency gate — FAIL.**~~ **Closed on this branch, 10 September (later the same day):**
   `nodemailer` `^9.0.1` → `^9.1.1`, lockfile `9.0.1` → `9.1.1` (§2a). `scripts/audit-gate.mjs`: **PASS**, 0
   blocking findings; the three allowed highs (geoip-lite, postcss ×2) are unchanged, due 2026-10-05. **The
   fix is in the code and the lockfile only — the live functions still run 9.0.1 until they are redeployed;
   §6 says which ones and which of them this package's deploy does not cover.**
2. **Production `chatgptMcp` source is not in the repository.** The live revision `chatgptmcp-00072-dok`
   (7 September, the SSRF hotfix deploy) has an `index.js` that matches no commit on any ref. Its flags-off
   listing was measured from the uploaded zip and is byte-identical to the candidate's (§4), so the
   parity claim stands on the bytes; the provenance gap is recorded in the parity document.
3. Review-workspace figures (test cases 1–3) must be re-verified on `review@nivadesk.app` before the form
   is filled; the ESET row reset; the review connection reconnected after the flip (§5.4 of the
   submission doc: a token minted before the flip carries two scopes and is refused on the finance and
   notes tools).
4. `create_inventory_item` keeps `orders.read` (deferred with the tool); `tasks.write` stays advertised.

### 2a. GHSA-2x7j-588g-ccc2 — verified, and the narrowest fix

**What the audit says.** `npm audit --json` in `functions/` filed one entry, `nodemailer` (direct dependency, no
other package depends on it; `npm ls nodemailer --all` → `nodemailer@9.0.1` at the root only), carrying
**four** advisories, of which the gate reported the first title it found (the moderate `resolveContent` one)
beside the high that blocked:

| Advisory | Severity | Affected | Fixed in |
|---|---|---|---|
| GHSA-2x7j-588g-ccc2 — quadratic (O(n²)) time in `addressparser`, remote DoS via a crafted address list | **high, CVSS 7.5** (AV:N/AC:L/PR:N, A:H) | `< 9.1.0` | 9.1.0 |
| GHSA-8m3c-c648-2xjj — `resolveContent()` bypasses `disableFileAccess`/`disableUrlAccess` (legacy signature) | moderate 5.9 | `<= 9.1.0` | 9.1.1 |
| GHSA-wmmp-3585-3rmp — IDN/Punycode domain allow-list bypass | moderate 6.5 | `< 9.1.0` | 9.1.0 |
| GHSA-cc9r-2j5m-2m83 — recipient-domain validation bypass via RFC 5322 comment mis-parsing | moderate 6.5 | `>= 6.9.16 < 9.1.0` | 9.1.0 |

**The official advisory** (github.com/advisories/GHSA-2x7j-588g-ccc2, published 1 September 2026, no CVE): the
address parser rebuilt its accumulator with `Array.prototype.concat()` on every address, so a comma-separated
list of *n* addresses costs 1+2+…+n copies; a ~1.5 MB crafted list holds the event loop for 25–30 s at 100 %
CPU. Reachable through any structured address header (`to`, `cc`, `bcc`, `from`, `replyTo`) handed to
`transport.sendMail()`, with no configuration or authentication required — "any service that runs Nodemailer
on an address value influenced by an untrusted party". 9.1.0 makes the parser linear (changelog: "handle
address lists in linear time", plus linear recipient dedupe and the `concat.apply` stack overflow); 9.1.1
adds the `resolveContent` access-policy fixes. **No breaking change is listed between 9.0.1 and 9.1.1**
(9.0.2–9.0.6 are hardening releases; 9.1.0 adds an optional `maxRecipients`).

**Installed and affected:** `nodemailer@9.0.1`, `functions/package.json` `^9.0.1`, one lockfile entry
(`node_modules/nodemailer`, no dependencies of its own), required once at `functions/index.js:11` and turned
into a transport only by `nvMailTransport()` (`index.js:44`), which the five mail helpers call:
`emailNivadeskSupportForTicket`, `emailNivadeskSupportForWebsiteChat`, `emailWebsiteChatVisitorReply`,
`emailWorkspaceInvitation`, `sendPortalStatusEmail`.

**NivaDesk exposure, measured against the advisory's condition ("an address value influenced by an untrusted
party").** Every address NivaDesk hands to `sendMail` is a single address that passed a shape check and a
length cap before it got there: the website visitor's e-mail (the one *unauthenticated* path) goes through
`websiteChatVisitorEmail` — 240 characters and a single-address regex, or dropped; an invitation address
through `team/invitations.js` `isPlausibleEmail` — single-address regex, ≤ 254; a customer's e-mail on an order
through `cleanOrderText(after.emailAddress, "", 240)` in the notification trigger and `nvCleanString(…, 240)` on
an assistant-created order; the workspace's reply-to through `cleanOrderText(…, 240)`; the support inbox and
the `from` are constants. A 240-character value cannot reach the quadratic cost (measured here: on 9.0.1 a
15,000-address / 169 KB list parsed in 60 ms against 13 ms for 5,000 — super-linear, but the advisory's 25–30 s
needs the megabyte-scale input the caps exclude; on 9.1.1 the same lists parse in 7–8 ms). The support-ticket
reply-to is an authenticated caller's e-mail and was not separately traced to a cap. Conclusion: no reachable
DoS path at NivaDesk's input sizes; the finding is closed for policy (a high with no allow-list entry fails the
gate) and for hygiene, not because an exploit was found.

**The fix, as narrow as it gets:** `npm install nodemailer@^9.1.1 --package-lock-only --ignore-scripts` in
`functions/` — manifest `^9.0.1` → `^9.1.1` (so a future install cannot resolve below the fix), lockfile
`9.0.1` → `9.1.1` with the registry's integrity (`sha512-izw9mVKFix6Y…`, verified equal to `npm view
nodemailer@9.1.1 dist.integrity`). **Nothing else moved**: the lockfile diff is the one package's three lines
plus the range; nodemailer has no dependencies, so there is no transitive change to explain. No `npm audit
fix`, no `--force`, no allow-list entry. A second `--package-lock-only` install changes nothing (lockfile
stable). `npm audit` afterwards: the `nodemailer` entry is gone; `functions` high 1 = the allowed
`ip-address` via geoip-lite.

**Verification of the mail flows.** The unit suites never open a transport — the five helpers return before
`createTransport` when `NIVADESK_SMTP_PASSWORD` is unset, which is the suites' state, and
`no-mail-from-tests.mjs` exists precisely so that no test run ever sends mail — so what was verified is: (a)
the flows' logic suites are green (`team-invitations` 21, `webhook-privacy` 12, and the full run below);
(b) a scratch install of `nodemailer@9.1.1` (`dependencies: {}`) accepts the exact shapes NivaDesk uses —
`createTransport(options)`, `sendMail({ from, to, replyTo, subject, text, html, attachments })` — on a
`jsonTransport` that writes nothing, and its address parser is linear; (c) no breaking change in the
changelog. No e-mail was sent to anyone. The shared `node_modules` the suites run from still holds 9.0.1
(it is the main checkout's, symlinked; it is not what a deploy installs — Cloud Build installs from this
lockfile).

## 3. Flags and the candidate

- Release flag set: **`NIVADESK_MCP_ORCHESTRATOR=1`**, `NIVADESK_MCP_INVENTORY` unset, `NIVADESK_MCP_EMAIL_RECEIPTS` unset.
- Candidate commit: **the head of `openai-resubmission`** — `6f7849f9` carries the code, tests, corpus, evidence and this
  document; the nodemailer lockfile fix (§2a) and this section's updates follow it; the evidence snapshots are
  re-stamped on the clean tree after each (same listings, same hashes). The hash is in the operator report. Product code on the branch since the readiness commit `9709919c`: the merge of the deploy branch
  (`2ee5f6c1`, every live hotfix including the Stripe fix `76c5e3c3`), `functions/index.js` (two flag-gated
  sentence constants and three description appends), `functions/orchestrator/registry.js` (the three edits in
  §1), `studioflow-web/lib/publicSite/guide.ts` + rebuilt corpus, and the connect page as it already was.

## 4. The wire, measured

Flags-off (what production serves today, and what this tree serves with every MCP flag unset): **19 tools,
listing sha256 `7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984`** — from the committed
production snapshot (`015d5792`), from the **live `chatgptmcp-00072-dok` source zip** (re-measured 10
September, `index.js` sha256 `d5ae16fd…`), and from this tree (`docs/evidence/capture-tools-list.js`:
PASS, BYTE-IDENTICAL).

Release flag set (`docs/evidence/tools-list-candidate-orchestrator-on.json`, checked by
`docs/evidence/release-listing-report.js`: names = registry = dispatcher, four literal booleans per tool,
hints = registry, a `Because …` line per hint, scopes = registry — **PASS**): **21 tools**.

| # | Tool | Read Only | Destructive | Idempotent | Open World | Scopes |
|---|---|---|---|---|---|---|
| 1 | `create_order` | false | false | false | true | orders.write |
| 2 | `search_orders` | true | false | true | false | orders.read |
| 3 | `get_order_detail` | true | false | true | false | orders.read |
| 4 | `add_order_note` | false | false | false | false | orders.write, notes.write |
| 5 | `update_order_status` | false | true | false | true | orders.write |
| 6 | `create_note` | false | false | false | false | notes.write |
| 7 | `search_notes` | true | false | true | false | notes.read |
| 8 | `get_note_detail` | true | false | true | false | notes.read |
| 9 | `append_note` | false | false | false | false | notes.write |
| 10 | `update_note` | false | true | true | false | notes.write |
| 11 | `pin_note` | false | false | true | false | notes.write |
| 12 | `archive_note` | false | false | true | false | notes.write |
| 13 | `get_order_financials` | true | false | true | false | finance.read |
| 14 | `get_dashboard_summary` | true | false | true | false | orders.read, finance.read |
| 15 | `get_extra_spending_overview` | true | false | true | false | finance.read |
| 16 | `get_financial_overview` | true | false | true | false | finance.read |
| 17 | `get_bank_spending_summary` | true | false | true | false | finance.read |
| 18 | `search_bank_transactions` | true | false | true | false | finance.read |
| 19 | `attach_bank_receipt` | false | true | false | true | finance.read, orders.write |
| 20 | `search_inventory` | true | false | true | false | orders.read |
| 21 | `search_commerce_orders` | true | false | true | false | orders.read |

**Four hints on the wire, three on the form.** Every tool above carries all four annotation keys as literal
booleans — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` — and the report script fails
if any is missing or non-boolean. The platform's MCP Server section, as read on the 1.1.1 form (readiness §2),
displays and asks a justification for **three** of them — Read Only, Open World, Destructive — and does not show
`idempotentHint`. So "Scan Tools → 21 tools × 3 scanned hints" in §6 is the platform's field set, not a
typo and not a claim about the wire; the fourth hint is verified in §4's table and in the release notes'
`update_order_status` correction, and its justification lines (§7.4) are kept for the notes even though the
form has nowhere to paste them. If the scan ever shows a fourth column, compare it too.

What differs from the reviewed listing under the flag, and nothing else (pinned by `mcp-tools-list-snapshot`):
the two new read tools at the end; `create_order` openWorldHint false→true; `update_order_status`
openWorldHint false→true and idempotentHint true→false; one sentence appended to the descriptions of
`create_order`, `update_order_status` and `attach_bank_receipt`.

## 5. Tests and gates run on this tree

| Suite / gate | Result |
|---|---|
| `mcp-tool-annotations` | 37 PASS, 0 FAIL |
| `mcp-tools-list-snapshot` | 15 PASS, 0 FAIL |
| `mcp-reduced-surface` | 16 PASS, 0 FAIL |
| `mcp-no-money` / `mcp-one-inventory-search` / `orchestrator-contract` | 6 / 8 / 33 PASS |
| `mcp-permissions` / `mcp-scope-enforcement` / `mcp-inventory` | 25 / 10 / 3 PASS |
| `guide-corpus-fresh` / `guide-retrieval` | 3 / 13 PASS |
| `docs/evidence/capture-tools-list.js` (flags-off parity) | PASS on all three snapshots; BYTE-IDENTICAL |
| `docs/evidence/release-listing-report.js` | PASS |
| `team-invitations` / `webhook-privacy` (the mail flows' logic, transport never opened) | 21 / 12 PASS |
| `npm test` (whole `functions/` tier) | exit 0, **1,470 PASS, 0 FAIL**, 115 suites — run twice: on the package tree and again on the final tree with the nodemailer lockfile |
| `scripts/audit-gate.mjs` (dependency gate, DPP 2.7) | ~~FAIL~~ → **PASS, 0 blocking** after `nodemailer` `^9.1.1` (§2a); allowed highs unchanged |

The bank/receipt matching features are untouched: no handler changed on this branch; `mcp-inventory`
(the receipt attachment path) and the bank suites in the full run are green.

## 6. Deploy package, order, carry and rollback

**Functions — the seven that read the flag, in one command, from the main checkout with
`NIVADESK_MCP_ORCHESTRATOR=1` in `functions/.env`** (traced statically from every `exports.*` to the flag
identifiers; `chatgptMcp` alone is not enough — the OAuth authorize/approve/register/metadata endpoints mint
the default grant the flag widens, and the REST surface shares the dispatcher):

```
firebase deploy --project eggcraft-studio --only "functions:chatgptMcp,functions:chatgptWorkspaceAction,functions:chatgptOAuthAuthorize,functions:chatgptOAuthApprove,functions:chatgptOAuthRegister,functions:chatgptOAuthAuthorizationServer,functions:chatgptOAuthProtectedResource"
```

Then, **after** those are serving, the guide: the seven assistant functions carrying the rebuilt corpus —
`getUserGuide`, `askAppAssistant`, `createSupportTicket`, `postWebsiteChatMessage`, `createWebsiteChat`,
`getAppAssistantAvailability`, `addSupportTicketReply` (by name). Deploying them first would let the in-app
bot offer two tools the published app did not yet serve.

**Web** — the connect page (`studioflow-web/app/chatgpt/connect/ChatGPTConnectClient.tsx`, `page.tsx`:
empty scope default, the server decides) — a web round, **before or with** the functions deploy, never
after. No other web file changes; the guide reaches production through the functions above.

**Order:** dependency gate green → source/ancestor pre-check (`docs/audit-deploy-checklist.md`) → web round
→ the seven functions (flag on) → the five mail functions above (nodemailer, no flag needed) → record the deployed listing (`node docs/evidence/capture-tools-list.js`
against the deployed source, or the checklist's step 5) and diff it against
`tools-list-candidate-orchestrator-on.json` → the seven assistant functions → reconnect the review
connection → re-run the test cases → platform form (§7 below): Scan Tools, verify 21 tools × 3 scanned
hints against §4, paste justifications, Description, Release Notes, test cases → operator submits.

**Carry:** `openai-resubmission` already contains the deploy branch (merge `2ee5f6c1`); after the operator
accepts the package, merge it back with `git merge --no-ff openai-resubmission` on
`macbook-save-before-macstudio-2026-06-01` (the sides are disjoint except `functions/index.js`, which merged
cleanly; `git merge-tree` clean), push, and deploy from the main checkout. The pre-check's
`is-ancestor 76c5e3c3` passes on this branch.

**Rollback:** route each of the seven services back to its previous revision (`gcloud run services
update-traffic <service> --to-revisions <previous>=100`; snapshot the seven revision names before the
deploy) **and** remove the flag from `functions/.env` so a later deploy does not re-flip it. The web page can
stay: with the flag off the server's default is the same two scopes.

*What a widened token means under a rollback — shown, not assumed.* Between the flip and a rollback, new
connections are minted with the six-scope default (`nvOAuthMintDefaultScope`, flag on) instead of 1.1.1's
`orders.read orders.write`; access tokens live thirty days, so those grants outlast the rollback. Whether that
opens anything is decided by what the rolled-back (flag-off) code reads:

- the OAuth resolver `nvRequireChatGPTWorkspaceAccessWithOAuth` (`index.js:25720`) turns a bearer into
  `{uid, companyId}` and refuses unless `uidHasCompanyAccess(companyData, uid)` — workspace membership, not
  scope;
- every tool then runs its own gate from the registry's `permission.guard` — `nvRequireWriteAccess`,
  `nvRequireOrdersArea`, `nvRequireFinancialAccess`, `nvRequireBankFeedAccess({ ownerOnly })`,
  `nvRequireWorkflowAssignedOrder` — the role and area model `mcp-permissions` (25 checks) pins: a Workflow
  Only or View Only member sees no money, a switched-off Finance area is honoured, the owner cannot lock
  themselves out;
- the scope string is consulted in exactly one place, `nvMcpAssertScope`, and the dispatcher calls it only
  `if (NV_MCP_ORCHESTRATOR)` (`index.js:24636`); `mcp-scope-enforcement` pins both halves — "enforcement
  ships with the submission flag" and "flag off, the OAuth surface mints and challenges exactly what 1.1.1
  does".

So under a rollback a six-scope token can do exactly what a two-scope token — or any 1.1.1 token — can do:
the 19 tools, each behind the same membership, role and area checks, with the scope string never read.
**No operation and no data access opens that the old revision did not already allow to the same user.** What
differs is only the record: `chatgptOAuthTokens` rows minted in the window store a wider `scope` string. That
matters in one direction — on a later re-flip those connections pass enforcement without a reconnect, which
is the intended state. (The converse is the flip-day effect already in §5.4: a two-scope token minted before
the flip is refused on the finance and notes tools until the user reconnects.)

**nodemailer 9.1.1 — code fixed, live exposure separate.** The candidate's gate closes with the lockfile (§2a).
The live functions keep running 9.0.1 until each is redeployed from this lockfile, and the ones that actually
send mail are, from the static call graph (`exports.*` → `nvMailTransport`): `createSupportTicket`,
`addSupportTicketReply`, `postWebsiteChatMessage`, `websiteChatRequestHuman`, `inviteWorkspaceMember`,
`createOrderPortalLink`, `saveOrderPortalSettings`, `notifyCustomerOnStatusChange` (the customer e-mail/SMS
trigger; the graph also lists `chatgptMcp` and `chatgptOAuthProtectedResource` through the name
`sendPortalStatusEmail`, but the only call is inside the trigger at `index.js:28841` — the MCP path never sends
mail itself). Of these, **three** are in this package's deploy — `createSupportTicket`,
`addSupportTicketReply`, `postWebsiteChatMessage` ride with the seven assistant functions — and **five are
not**: `websiteChatRequestHuman`, `inviteWorkspaceMember`, `createOrderPortalLink`, `saveOrderPortalSettings`,
`notifyCustomerOnStatusChange`. Closing the live advisory therefore needs one more deploy, by name, after the
lockfile is on the deploy branch:

```
firebase deploy --project eggcraft-studio --only "functions:websiteChatRequestHuman,functions:inviteWorkspaceMember,functions:createOrderPortalLink,functions:saveOrderPortalSettings,functions:notifyCustomerOnStatusChange"
```

Every other function loads `index.js` and so bundles nodemailer without calling it; they pick 9.1.1 up
whenever they are next deployed for their own reasons. **This package does not claim the live advisory closed
until those revisions exist.**

## 7. Texts to paste into the platform (after the flag-on deploy and Scan Tools)

### 7.1 App Info — Description (replaces the 1.1.1 text; names only what the tools do)

NivaDesk helps custom-order studios work with their orders, personal notes and financial summaries from
ChatGPT. After connecting a NivaDesk workspace, users can search orders, open one, add a note, create an
order or change its status — the workspace's own notification rules then apply, so a status change can
e-mail or text the customer exactly as it would from the app — and read the financial information their
role and plan allow. Personal notes can be created, searched, appended to, edited, pinned and archived.
Workspace owners, and members given the Bank Spending permission, can ask for monthly or yearly spending
summaries, recurring costs and incoming payments from their connected Open Banking feed, search individual
bank transactions, and attach an invoice or receipt shared in the chat to the matching transaction.

New in this version: two read-only searches — find an order from any connected sales channel or one taken
by hand, and search stock by name, SKU, serial number, brand, model, category or location. Neither returns
amounts; figures stay with the finance tools and their permissions.

Designed for small teams and studios that work on made-to-order projects — bespoke art, handmade products,
repairs, photography, tailoring, jewellery and other client-based work.

### 7.2 Submit — Release Notes (the submission document's §7, verbatim)

> **Annotations.** All four hints are explicit booleans in source and on the wire for every published
> tool; there are no nulls and no coercion left in the path — the values now come from one table
> (`orchestrator/registry.js`) that refuses to load if a hint is not a literal `true` or `false`, if a
> justification is missing, or if a hint disagrees with the outward effects the tool declares. Each tool
> carries a written justification per hint.
>
> **Three values changed since 1.1.1, across two tools, and all three are corrections we found by
> tracing each tool's effect rather than its handler.** `create_order` and `update_order_status` are now
> `openWorldHint: true`: creating an order or changing its status fires the workspace's own notification
> rules, which e-mail the customer — and send an SMS where the workspace has SMS enabled — through our
> provider. The write is ours; the message leaves our domain, so the hint is true. And
> `update_order_status` is now `idempotentHint: false`: a repeat with the same status appends a second
> entry to the order's history, because every entry is minted with a fresh id and timestamp and the
> array-union that stores it therefore cannot deduplicate. No second customer message goes out — the
> trigger returns early when the status has not changed — but a new sub-record the user can see in the
> order's own history is enough to fail the definition below. We would rather correct all three
> ourselves than defend the old values.
>
> **Definitions we used** (also in the tool justifications): read-only means no write of workspace state,
> no external call with a side effect and no trigger — with one disclosed exception, an access-log row
> that records a read of customer data; destructive means an existing value can be overwritten, replaced
> or deleted; idempotent means a second identical call produces no new record, no user-visible change and
> no outbound message; open-world means the call reaches outside NivaDesk, whether directly or through a
> trigger the workspace configured.
>
> **New in this version:** two read-only tools — one that searches orders across a workspace's sales
> channels and one that searches its stock. Both say what they could not include: a read that hit its
> document limit and a result page shorter than the number of matches are each reported in the answer
> rather than left for the model to notice. Freshness is reported where there is a sync to report on:
> the order search names the last successful sync of each channel that contributed rows to that answer,
> so a workspace with no shop connected is told about no channels rather than being shown a roster of
> zeros; stock has no connector at all, so the stock search says its freshness is not applicable instead
> of stating a sync time it does not have. **Neither reports any monetary value**: no order total, nothing paid or outstanding, no
> refund, no tax, no payout and no currency. The order search reports whether an order is paid as a
> status word, never as an amount; the workspace's money stays with the finance tools that were already
> in the app, behind the permissions they already have. Neither changes any workspace record, calls a
> shop, marketplace or bank, or modifies an external provider; the order search files the one access-log
> row disclosed under the read-only definition above, because it can show the assistant customer names.
>
> **Also on the wire in this version:** three tool descriptions gain one sentence each, saying on the
> tool what its justification says — `create_order` and `update_order_status` that the workspace's own
> notification rules can e-mail or SMS the customer, `attach_bank_receipt` that image receipts are read
> with Google Vision OCR and that attaching to a transaction that already has a receipt replaces it and
> deletes the previous file. And two read tools that were already in the app, `get_bank_spending_summary`
> and `search_bank_transactions`, now record the same access-log row as the other reads when they show the
> assistant a counterparty name — the disclosed exception, applied consistently.
>
> **Unchanged:** the OAuth and discovery surface, the scope names, the workspace and role model, and what
> every tool from 1.1.1 does when called: no handler changed in this version.

### 7.3 Testing — test cases

Re-verify every figure on the review workspace (`review@nivadesk.app`) before pasting; the values below are
the 1.1.1 ones and are point-in-time.

| # | Scenario | Tool(s) | Expected output |
|---|---|---|---|
| 1 | Get dashboard summary | `get_dashboard_summary` | re-verify: 21 orders (4 active, 16 completed, 1 cancelled, 1 overdue), total GBP 70,534, paid 64,874, outstanding 5,660, cost 21,173.60, profit 49,360.40, largest balances named |
| 2 | Search the review order | `search_orders` | exactly one match, "OpenAI Review Test Order" for "OpenAI Review Test Customer" (`22uckzfA8lGXYjj1JxCM`), In Progress / Done, paid 5,300, remaining 900, due 19 July 2026 |
| 3 | Read order financial information | `get_order_financials` | price 6,200, paid 5,300, remaining 900, base cost 430, fee 186, delivery 0, VAT 1,240, total cost 1,856, profit 4,344 |
| 4 | Bank spending summary and transaction search | `get_bank_spending_summary`, `search_bank_transactions` | the monthly total, top categories and the receipt-less rows of the review feed (re-verify) |
| 5 | Attach an invoice image to the matching bank transaction | `attach_bank_receipt` | download the sample ESET invoice, attach; ChatGPT shows its own confirmation prompt ("Allow once"); NivaDesk reads ESET UK 53.99 / 13 Aug 2026, matches the sample transaction (`demo-acc_demo006`, reset to no receipt first), attaches; several matches → candidates; running again replaces the receipt (and deletes the previous file) |
| 6 | **new** — Find an order across channels | `search_commerce_orders` | "Find the order for OpenAI Review Test Customer across my channels": one match, status words only (NivaDesk status, paid as a word), **no amount and no currency**, and an **empty** channel list — the review workspace has no shop connected, so no source is named |
| 7 | **new** — Search stock | `search_inventory` | "Search my stock for <item>": the matching item(s) with quantity/unit and location, no price field; freshness reported as not applicable. The review workspace needs at least one inventory item added from the app first (data step for the operator) |
| 8 | **new** — Change a status without messaging the customer | `update_order_status` | on an order whose automatic updates are **off**: status changes, one history entry is added, ChatGPT shows its confirmation prompt, **no** customer e-mail or SMS |
| N1–N3 | should not trigger | — | software recommendation; drafting a customer reply; "task vs order vs project" explanation (unchanged) |

### 7.4 MCP Server — per-tool justifications (Read Only / Open World / Destructive as the form asks; Idempotent for the notes)

Generated by `node docs/evidence/release-listing-report.js` from the registry at the candidate; regenerate
after any registry edit — never paste the 1.1.1 boilerplate.

### create_order  readOnly=false destructive=false idempotent=false openWorld=true
- Read Only (false): Because the call writes a new document in siparisler through nvOrderDefaults with createdFrom "chatgpt".
- Destructive (false): Because it only adds a record: no existing order is changed, moved or removed.
- Idempotent (false): Because there is no request-level deduplication, so the same arguments called twice create two orders with different ids.
- Open World (true): Because creating an order that carries a status and a customer e-mail address can put a message in that customer's inbox: notifyCustomerOnStatusChange runs on document creation as well as update, and an order with no portalAutoUpdates block counts as enabled with e-mail on, so the mail leaves through NivaDesk's SMTP provider (and Twilio where the workspace enabled SMS).

### search_orders  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it queries siparisler by companyId and filters in memory; the only write it makes is the piiAccessLog row recording the read, which records the read rather than changing what the workspace holds.
- Destructive (false): Because no order is altered, moved or removed by a search.
- Idempotent (true): Because repeating the same query returns the same rows and creates nothing.
- Open World (false): Because it reads NivaDesk's own order records only and never contacts a shop, marketplace or any other outside system.

### get_order_detail  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads one order document and the cross-workspace and workflow-assignment checks are reads too; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because reading an order changes nothing on it.
- Idempotent (true): Because the same orderId returns the same document and creates nothing.
- Open World (false): Because the order is read from NivaDesk's own collection and no outside system is contacted.

### add_order_note  readOnly=false destructive=false idempotent=false openWorld=false
- Read Only (false): Because it appends to the order's notes field and adds a historyLog entry.
- Destructive (false): Because the existing note text is kept and the new line is concatenated onto it.
- Idempotent (false): Because each repeat appends the same line again and mints another history entry.
- Open World (false): Because the workspace's customer notification keys on status, which this tool does not touch, so nothing leaves the workspace.

### update_order_status  readOnly=false destructive=true idempotent=false openWorld=true
- Read Only (false): Because the call sets status and/or designStatus on the order document.
- Destructive (true): Because the previous status value is overwritten and is not recoverable from the field.
- Idempotent (false): Because a repeat with the same status appends a second historyLog entry (nvHistoryItem mints a new id and timestamp per call, so arrayUnion cannot dedupe), which the order's history shows the user.
- Open World (true): Because a status change is what the workspace's own customer notification listens for: notifyCustomerOnStatusChange sends an e-mail through NivaDesk's mail provider, and an SMS through Twilio where the workspace enabled SMS, to the address and number on the order — and it is on by default for an order with no portalAutoUpdates block.

### create_note  readOnly=false destructive=false idempotent=false openWorld=false
- Read Only (false): Because it creates a note document under the connected user's own personal_notes collection.
- Destructive (false): Because it only adds a note; no existing note is changed or removed.
- Idempotent (false): Because there is no deduplication, so the same text called twice creates two notes.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.

### search_notes  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the connected user's own notes and filters them in memory; it writes nothing at all, not even an access-log row, because the notes are the caller's own.
- Destructive (false): Because no note is altered by a search.
- Idempotent (true): Because the same query returns the same notes and creates nothing.
- Open World (false): Because the notes are read from NivaDesk and no outside system is contacted.

### get_note_detail  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads one of the connected user's own note documents and writes nothing.
- Destructive (false): Because reading a note changes nothing on it.
- Idempotent (true): Because the same noteId returns the same note and creates nothing.
- Open World (false): Because the note is read from NivaDesk and no outside system is contacted.

### append_note  readOnly=false destructive=false idempotent=false openWorld=false
- Read Only (false): Because it writes the note's text field with the appended paragraph.
- Destructive (false): Because the previous text is kept and the new text is concatenated onto it.
- Idempotent (false): Because each repeat appends the same paragraph again, so the note grows on every call.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.

### update_note  readOnly=false destructive=true idempotent=true openWorld=false
- Read Only (false): Because it sets the note's title, text, labels, links or colour.
- Destructive (true): Because the supplied fields replace the previous values, which are not recoverable from the note.
- Idempotent (true): Because it sets an explicit end state: a repeat with the same fields writes the same values, adds no note line and no history entry, and differs only in the server's updatedAt and source stamps.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.

### pin_note  readOnly=false destructive=false idempotent=true openWorld=false
- Read Only (false): Because it sets isPinned on the note document.
- Destructive (false): Because the flag is reversible by the same tool and no content is lost when it changes.
- Idempotent (true): Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument pins rather than toggles.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.

### archive_note  readOnly=false destructive=false idempotent=true openWorld=false
- Read Only (false): Because it sets isArchived on the note document.
- Destructive (false): Because archiving hides the note without deleting it and the same tool puts it back.
- Idempotent (true): Because a repeat sets the same boolean, so nothing user-visible changes; note that omitting the argument archives rather than toggles.
- Open World (false): Because the note is written to NivaDesk only and no trigger sends it anywhere.

### get_order_financials  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it computes totals over the workspace's own order documents; the only writes it makes are piiAccessLog rows recording the read: one for the read itself, and a second when the outbound policy withholds a marketplace buyer's name, recording that the name was withheld rather than shown.
- Destructive (false): Because no order or payment record is altered by the calculation.
- Idempotent (true): Because the same order returns the same figures and creates nothing.
- Open World (false): Because every figure comes from NivaDesk's own records; no bank, payment or accounting provider is called.

### get_dashboard_summary  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it aggregates the workspace's own orders in memory; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because summarising records does not change them.
- Idempotent (true): Because the same workspace state returns the same summary and creates nothing.
- Open World (false): Because the summary is computed from NivaDesk's own records and no outside system is contacted.

### get_extra_spending_overview  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's spending documents and groups them in memory; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no spending record is altered by the calculation.
- Idempotent (true): Because the same period returns the same overview and creates nothing.
- Open World (false): Because the spending rows are already in NivaDesk; no bank or provider is called to produce them.

### get_financial_overview  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it computes revenue, cost and profit from the workspace's own orders and spending; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no record behind the figures is altered.
- Idempotent (true): Because the same period returns the same figures and creates nothing.
- Open World (false): Because every figure comes from NivaDesk's own records; no bank or accounting provider is called.

### get_bank_spending_summary  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's already-imported bankTransactions rows and classifies them in process; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because no transaction row is altered by the summary.
- Idempotent (true): Because the same rows produce the same summary and nothing is created.
- Open World (false): Because the rows were imported by the bank feed beforehand: this call contacts no bank, no TrueLayer and no PayPal endpoint.

### search_bank_transactions  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's already-imported bankTransactions rows and filters them in memory; the only write it makes is the piiAccessLog row recording the read.
- Destructive (false): Because searching does not change a transaction row.
- Idempotent (true): Because the same query returns the same rows and creates nothing.
- Open World (false): Because the rows were imported by the bank feed beforehand: this call contacts no bank or payment provider.

### attach_bank_receipt  readOnly=false destructive=true idempotent=false openWorld=true
- Read Only (false): Because it stores the file under companies/{cid}/bank_receipts and then either assigns it to a transaction, returns candidates, or queues it as waiting.
- Destructive (true): Because assigning to a transaction that already has a receipt replaces it: assignInboxReceipt overwrites receiptPath and deletes the previous file.
- Idempotent (false): Because a repeat with the same file stores and scores a second copy, and a repeat with the same inboxPath fails, since the first assignment moved the inbox file.
- Open World (true): Because the handler downloads the document from a model-supplied https URL and sends it to Google Vision for OCR, so the call reaches systems outside NivaDesk even though it mutates no sales provider.

### search_inventory  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it reads the workspace's inventoryItems and filters them in memory; no item is created, reserved or written, and stock rows carry no person fields.
- Destructive (false): Because a search does not touch the stock it finds.
- Idempotent (true): Because the same filters return the same items, including two items that share a SKU, which is a search key here and never an identity.
- Open World (false): Because there is no listing or channel data to consult: the items are read from NivaDesk and no outside system is contacted.

### search_commerce_orders  readOnly=true destructive=false idempotent=true openWorld=false
- Read Only (true): Because it filters orders the loader already read and returns rows; the only write on the path is the piiAccessLog row recording that an assistant was shown customer names, which is a record of the read rather than a change to the workspace.
- Destructive (false): Because searching cannot alter an order: no field is written and no row is removed.
- Idempotent (true): Because the same filters over the same orders return the same rows in the same order.
- Open World (false): Because it searches NivaDesk's own order collection; the provider is never queried, even for an order that came from one.
