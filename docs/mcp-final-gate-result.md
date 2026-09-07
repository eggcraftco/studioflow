# MCP 1.2.0 — final gate result

**Verdict: STOP.** Nine blocking issues. Two are high-severity truthfulness defects in the
reviewer-facing and user-facing text of this release; one is a high-severity SSRF guard on the live
surface that the caller can step around at both of its call sites; six are counts and disclosures that
state a number the code contradicts.

No code was changed. No suite is red, so nothing was fixed under this gate — the instruction was to
write the verdict and the backlog, and every finding below is a defect in text, documentation, a
committed fixture, or one line of an unrelated live handler. All nine need their own change with their
own test.

- Repository: `/Users/gocmen/Developer/studioflow-mcp`, branch `mcp-orchestration`
- Commit gated: `3f68dc88` ("The contract said a capability logs PII twice and never says it carries money")
- Working tree: clean at every measurement below (`git status --short` empty); the only change this
  gate makes to the repository is this file and `docs/mcp-backlog.md`
- Date: 7 September 2026

---

## 0. What was run, and what it returned

Every suite was run here, not read about. Exit codes are the shell's.

| suite | command | exit | result |
|---|---|---|---|
| unit / fake-Firestore | `cd functions && npm test` | **0** | 1360 `PASS`, 0 `FAIL` |
| rules (emulator) | `npm run test:rules` under `firebase emulators:exec --only firestore,storage` | **0** | 127 `PASS`, 0 `FAIL`, 5 suites |
| e2e (emulator) | `test/run-e2e.sh` in the same emulator run | **0** | 155 `PASS`, 0 `FAIL`, 20 files |
| tools/list snapshot | `node test/qa/mcp-tools-list-snapshot.test.js` | **0** | 14 `PASS` |
| tool annotations | `node test/qa/mcp-tool-annotations.test.js` | **0** | 26 `PASS` |
| reduced surface | `node test/qa/mcp-reduced-surface.test.js` | **0** | 10 `PASS` |
| one inventory search | `node test/qa/mcp-one-inventory-search.test.js` | **0** | 8 `PASS` |
| scope enforcement | `node test/qa/mcp-scope-enforcement.test.js` | **0** | 10 `PASS` |
| production parity | `node docs/evidence/capture-tools-list.js` | **0** | PASS on both committed snapshots |

Ports 8080 and 9199 were polled free with `lsof -nP -iTCP:<port> -sTCP:LISTEN` (both exit 1, no
listener) before the emulator chain; `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
was set for it, and the emulators reported `Script exited successfully (code 0)` and shut down cleanly.

**On the count.** The number to carry forward is **1360**, not 1361. `grep -c 'PASS' npmtest.log` returns
1361 because one line of the password-policy suite reads `✅ PASSWORD POLICY GEÇTİ` and the substring
matches. `grep -c '^PASS'` returns 1360, which is the number of assertions.

**Parity re-capture, not the committed snapshot.** The harness archives production `015d5792` into a
scratch directory and measures the WORKING TREE as the candidate, with every environment variable whose
name contains `MCP` deleted:

```
PASS  tools-list-production-015d5792.json matches the committed snapshot
PASS  tools-list-candidate-flags-off.json matches the committed snapshot

production listing sha256 : 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984
candidate  listing sha256 : 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984   (working tree at 3f68dc88)
VERDICT: the flags-off candidate listing is BYTE-IDENTICAL to production.
```

**Flag-state counts, measured.** `_nvMcpToolsWithSecuritySchemes()`, `_nvMcpAvailableActions()` and
`_nvMcpPiiLoggedActions()` driven in a child process per state, with every `*MCP*` variable deleted first:

| flags | tools | dispatchable actions | PII-logged actions |
|---|---|---|---|
| none | **19** | 19 | 7 |
| `NIVADESK_MCP_INVENTORY` | **21** | 21 | 7 |
| `NIVADESK_MCP_ORCHESTRATOR` | **21** | 21 | **9** |
| both | **22** | 22 | **9** |

`registry.TOOL_REGISTRY` holds 22 entries, 10 of them writes, 9 of them `piiAccessLogged: true` — and all
nine carry `readOnlyHint: true`.

These four numbers, and the 7-vs-9 split, are what findings B4 through B9 are measured against.

---

## 1. Verdict

**STOP.** The branch is technically sound — the flags-off wire has not moved by a byte, the reduced
surface is enumerable and enforced in all eight flag states, and every guard I deleted was caught by a
test. What fails the gate is what the release *says about itself*. Three separate texts that a reviewer
or a paying user reads — the OpenAI release notes, the in-app guide, and the operator's own flip-day
checklist — describe capabilities this release removed on 6 September, and the checklist instructs the
operator to publish one of them. That is the shape of the 1.1.1 rejection, in three new places.

The remaining six are counts. Individually each is a stale number in a sentence. Together they mean the
submission document contradicts itself (B4), the decision document's own outcome row is false (B5), and
the note a person reads before regenerating a fixture describes a fixture that no longer exists (B6). A
document nobody can trust the numbers in is not a gate artefact.

---

## 2. The nine blocking findings

### B1 — [high] The SSRF guard on both assistant file fetches can be bypassed by choosing the other parameter

**Where.** `functions/index.js:24813` (`create_inventory_item`) and `functions/index.js:25113`
(`attach_bank_receipt`). The guard is `nvAssertPublicHttpsUrl`, `functions/index.js:25047`.

**What the two lines actually read** — and they are not the same line, which matters for how each fails:

```js
// 24813, create_inventory_item — photoUrl is tested AND guarded: the guard is dead code
const source = /^https:\/\//i.test(photoUrl) ? photoUrl : nvAssertPublicHttpsUrl(photoUrl);

// 25113, attach_bank_receipt — chatFileUrl is tested, linkUrl is guarded: two doors, one guarded
const source = chatFileUrl && /^https:\/\//i.test(chatFileUrl) ? chatFileUrl : nvAssertPublicHttpsUrl(linkUrl);
```

At `24813` the guard is unreachable in the sense that matters. `photoUrl` is `photo.download_url ||
args.photoUrl` (`index.js:24810`). If it is `https:`, the ternary hands the raw value to `fetch`. If it is
anything else, the guard is called — and `nvAssertPublicHttpsUrl` rejects on `url.protocol !== "https:"`
at `index.js:25050`, **before** it reads the host at `:25051`. So the guard is only ever invoked with a
value it is guaranteed to refuse on protocol, and every URL that is actually fetched skipped it.

At `25113` the guard is live, but for the wrong parameter. `linkUrl` (`args.receiptUrl`, itself gated by
`NIVADESK_MCP_EMAIL_RECEIPTS`, `index.js:25107`) is checked. `chatFileUrl` — `args.receipt.download_url`,
`index.js:25102`, a caller-supplied argument on every deployment — is fetched unchecked whenever it is
`https:`. The caller picks which door to use, and one of them has no guard on it.

**What passes.** `https://10.0.0.5/x`, `https://169.254.169.254/computeMetadata/v1/…` and
`https://metadata.google.internal/…` all reach `fetch`, and both call sites pass `redirect: "follow"`, so a
public host that 302s inward works too. On `attach_bank_receipt` the response body is then written to the
workspace's Storage under `companies/{cid}/bank_receipts/_inbox/` (`index.js:25090`, saved at `index.js:25131`) and surfaced to the
owner, and the MIME allowlist at `index.js:25045` admits `text/html`, `text/plain` and
`application/octet-stream` — so an internal endpoint's body lands in the workspace as a receipt. On
`create_inventory_item` only `image/*` is stored (`index.js:24819`), leaving a blind GET.

**Invariant.** Not one of the four this gate certified — it is the branch's own design document.
`docs/mcp-orchestration-design.md` revision-2 correction 3 states the defect ("the guard … never blocks a
request that would otherwise be made") and schedules the fix as §1.4.10. The document says it was
scheduled; the code says it was not made. A design document that describes a correction the tree does not
contain is the same class of defect as B2 and B3, one layer down.

**Provenance, checked not assumed.** `git blame` puts `24813` at `6b0eb3bc2` (28 Aug) and `25113` at
`a5159b650` (22 Aug). Both are ancestors of the deployed commit `015d5792` (`git merge-base --is-ancestor`
returns true for each), so both are live in production today and neither was introduced by this branch.
`attach_bank_receipt` ships in 1.1.1; `create_inventory_item` sits behind `NIVADESK_MCP_INVENTORY`, unset
in production, and is not part of the 1.2.0 orchestrator release. **Refusing this branch changes the
exposure by exactly zero.** It is blocking because the gate cannot sign a release whose own design
document claims this was corrected.

**Closing it.** One line at each site. At `24813`, call the guard unconditionally:
`const source = nvAssertPublicHttpsUrl(photoUrl);`. At `25113`, guard whichever URL is chosen rather than
whichever was tested. Then the parity test the design document already asks for in §1.4.10: a case per
call site asserting that `https://169.254.169.254/…` is refused, and one asserting a public https URL
still fetches. Ship it as its own change against the deployed line, not folded into 1.2.0.

---

### B2 — [high] The in-app guide still promises the eight removed capabilities, and the checklist tells the operator to publish it

**Where.** `studioflow-web/lib/publicSite/guide.ts:1189-1195` (EN) and `:2403-2410` (TR).

A `{ kind: "sub", text: "Coming in the next version of the app" }` heading followed by four bullets.
Three of the four are entirely capabilities the 6 September reduction removed; the fourth is partly.

| line | promise | removed capability |
|---|---|---|
| `:1192` | per-channel "sales, refunds and known platform fees"; "payouts and whether they have been matched with a bank line"; "Channels you have not connected are named as not connected rather than counted as zero" | `get_commerce_overview`, `get_channel_performance`, `get_payout_reconciliation_overview` |
| `:1193` | "What needs attention today: … one list, each item once, with the sync time behind it" | `get_business_attention_summary` |
| `:1194` | "whether each shop, bank and accounting connection is healthy"; "what is prepared for Pandle, Xero or QuickBooks" | `get_integration_health`, `get_accounting_sync_status` |
| `:1195` | "Inventory: stock overview, low-stock items and reserved items; search …; add an item from a photo" | `get_inventory_overview` — only the search and the photo-add survive |

**This is not an internal design page.** It is compiled into `functions/assistant/guideCorpus.json`, which
is what the in-app assistant answers from — the string "Coming in the next version of the app" appears
three times in that file, and the ChatGPT-app chapter is `:441`. And two places instruct the operator to
publish it on flip day:

- `docs/mcp-submission-1.2.0.md:123-127` (§2.5): "When the flags flip, move those bullets into 'What you
  can ask', delete the heading and its caveat bullet, rebuild the corpus … deploy the seven assistant
  functions and probe the live bot".
- `docs/mcp-submission-1.2.0.md:481-482` (checklist step 8): "Guide: move the Step B bullets, rebuild the
  corpus, deploy the seven assistant functions, probe the live bot with one question per new capability."

The source comment at `guide.ts:1183-1188` says the same in the file itself, and states the rule it is
about to break: "a bot that offers a tool the app does not publish sends the reader somewhere that is not
there."

**Invariant.** The guide rule — the app's own standing rule that every published capability gets an
EN+TR guide section and nothing else does. Following checklist step 8 as written would put four
descriptions of capabilities that do not exist into the answer set of a bot that paying users ask, and
would then deploy it.

**Provenance.** `git log -S"Coming in the next version of the app" -- studioflow-web/lib/publicSite/guide.ts`
names exactly one commit, `912450fa` (6 Sep, "The guide learns the cross-channel reads, and dates them
honestly"). `git rev-list --count 912450fa..778fa7a6` is **56** — the reduction commit is 56 commits later
— and `git log -1 -- studioflow-web/lib/publicSite/guide.ts` is still `912450fa`, so nothing has touched
the file since. The reduction did not reach the guide.

**Closing it.** Rewrite the four bullets in both languages down to what actually ships behind the flags:
one line for cross-channel order search and one for inventory search plus the confirmed photo-add. Delete
every promise of a money summary, an attention list, a connection roster, an accounting sync status, a
payout reconciliation or a stock valuation. Rebuild `guideCorpus.json` with
`node functions/assistant/buildGuideCorpus.js`. Rewrite §2.5 and checklist step 8 of the submission
document so the flip-day instruction moves only the two surviving bullets. Then a test that fails if the
guide names a capability with no registry row — the same enumerate-from-the-registry shape
`mcp-reduced-surface.test.js` already uses.

---

### B3 — [high] The reviewer-facing release notes claim a behaviour neither shipped tool has

**Where.** `docs/mcp-submission-1.2.0.md:511-512`, inside the §7 block marked "draft to paste" for OpenAI:

> "a channel the workspace has not connected is named as not connected rather than counted as zero"

The same claim appears twice more, in text the operator acts on:

- `:105-106` (§2.3, the "three honesty rules that matter to a reviewer, because they are visible in a
  demo"): "a channel that is **not connected** is named as not connected, never counted as zero — which is
  what the review workspace will show for Shopify, Etsy, Amazon and eBay";
- `:478` (checklist step 7): "manual orders only, so the reviewer sees channels named as not connected
  instead of zeros".

**Measured, not reasoned about.** The roster that produces that behaviour is `channelRows`
(`functions/orchestrator/commerce.js:172-215`), which walks `channelModule.CHANNELS` and, for a channel
with no orders and no connection, pushes a row carrying `channelModule.channelAvailability(...)`
(`commerce.js:186-193`) — that is the "named as not connected" row, and it exists nowhere else.
`channelRows` has exactly two callers: `commerce.js:341`, inside `commerceOverview`, and `commerce.js:533`,
inside `channelPerformance`. Both capabilities were removed by the reduction; neither has a registry row
and neither is dispatchable in any flag state.

What `search_commerce_orders` emits instead is `commerceSources` (`commerce.js:112-168`, called at
`commerce.js:497`), which pushes a row only for a provider that has a `commerceHealth` document or that
contributed a non-manual order. Its return shape (`commerce.js:489-498`) is
`data { count, matched, currency, orders }`, `warnings`, `sources`, `entityRefs` — there is no channel
roster in it at all. On a workspace with manual orders and no connections, `sources` is `[]`: no channel
is named, connected or otherwise.

> Measured at `3f68dc88`, and one field of that shape has since gone. The operator's decision of
> 7 September 2026 removed every monetary field from both kept capabilities, so the shape is now
> `data { count, matched, orders }`: `currency` went with the per-order `totals` block. This finding and
> its closure are unaffected — the shape is left here as it was on the day it was measured.

**Invariant.** Reviewer-facing truth. This is a submission page telling OpenAI that a tool exhibits a
behaviour it does not, which is precisely the 1.1.1 rejection shape — the argument the branch itself makes
at `:85-91` about "customer search and read". On that third item, so this page answers the question it
raises rather than only citing it: **no customer search or customer read capability exists, none was
removed to reach two, and none is being added.** It was never built — no registry row, no dispatcher
case, no handler, and no `customers` domain in the loader for one to read — and the operator froze the
new surface at two capabilities on 7 September 2026. Customer data reaches an assistant only as fields
on an order.

**Closing it.** Delete the claim from `:511-512`, `:105-106` and `:478`, and rewrite checklist step 7 to
describe what the reviewer will actually see on a manual-only workspace: a result with `count`, `matched`,
an empty `sources` array and no warnings. If the "named as not connected" behaviour is wanted for the
demo, it needs `get_commerce_overview` back in the release, which is a scope decision, not an edit. Then
extend `mcp-tool-annotations.test.js` — which already parses this document — with a check that the §7
release-note block names no behaviour absent from the published capabilities.

---

### B4 — [medium] §5.1 of the submission document states the wrong published tool count, and contradicts §3

**Where.** `docs/mcp-submission-1.2.0.md:265`:

> "Wire effect: `inventory + orchestrator` is **30** tools, not 31."

**Measured:** 19 / 21 / 21 / **22** for none / inventory / orchestrator / both (§0 above). And §3's own
table at `:151` says **22** correctly: "| inventory + orchestrator | **22** | … and **not 23** …".

**Invariant.** Internal consistency of the document the operator flips flags from. Two sections of one
page state different wire counts for the same flag state, and only one of them is pinned:
`functions/test/qa/mcp-tool-annotations.test.js:688-706` finds lines beginning `| none (today) |`,
`` | `NIVADESK_MCP_INVENTORY` | ``, `` | `NIVADESK_MCP_ORCHESTRATOR` | `` and `| inventory + orchestrator |`
and asserts each names `registry.publishedNames(flags).length`. §5.1's prose is not a table row, so it is
outside the match and went stale — the harness is green while the sentence beside it is wrong by eight.

**Closing it.** Change **30** to **22** at `:265`. Then widen the harness so prose counts are pinned too:
scan the document for `\*\*\d+\*\* tools` and require every match to be a count the builder actually
produces in some flag state, or an explicitly whitelisted historical figure.

---

### B5 — [medium] The inventory-search decision document's outcome row and its fixture claim are both false

**Where.** `docs/mcp-inventory-search-decision.md:172` and `:244-247`.

`:172` is a row of the §4 table "The decision, and what moved" — a statement about the state *after* the
decision, not history:

> "| tool counts | 19 / 21 / 29 / **30** (was 31) |"

Measured: 19 / 21 / **21** / **22**. The historical table at `:29-34` is correctly labelled "before the
change in §4" and is not at issue.

`:244-247` describes the committed fixture:

> "29 tools with `search_inventory_items` and no `search_inventory`, and an `inventory+orchestrator` state
> of **31** tools … Both states were re-recorded on 6 Sep 2026 (29 and 30 tools)."

`functions/test/fixtures/mcp/tools-list-full.json` now records `states.orchestrator` with **21** tools and
`states["inventory+orchestrator"]` with **22**.

**Invariant.** A decision document's outcome row is the record of what the decision produced. This one
records numbers the decision did not produce, in the same paragraph that argues "A fixture nothing reads
is not evidence."

**Why staleness rather than deliberate history.** The same document *was* maintained for the reduction
elsewhere in the HEAD commit — `:88` rewrites the `reserved` comparison around `get_inventory_overview`
being out of the release, and `:217-219` rewrites the discriminator argument around it. Two lines were
missed, not a history preserved on purpose.

**Closing it.** Correct `:172` to 19 / 21 / 21 / 22 and `:244-247` to 21 and 22, keeping the "was 31"
parenthetical as the history it is. Same harness widening as B4 — this document has no test parsing its
numbers at all today, and it is cited as the authority by `mcp-orchestration-design.md:119-120`.

---

### B6 — [medium] Both listing fixtures' `note` fields state counts the files' own recorded states contradict

**Where.** `functions/test/fixtures/mcp/tools-list-full.json:3` (`note`):

> "the inventory+orchestrator state carried 31 tools … while the builder produced 30. Both were
> re-recorded then (29 and 30 tools, `search_inventory` only)."

The file's own states hold: `off` 19, `emailReceipts` 19, `inventory` 21, `emailReceipts+inventory` 21,
`orchestrator` **21**, `inventory+orchestrator` **22**.

And `functions/test/fixtures/mcp/tools-list-annotations.json:3` (`note`):

> "inventory+orchestrator went from 31 tools to 30"

That file's `states["inventory+orchestrator"]` holds **22**.

**Invariant.** The recorded states are right — `mcp-tools-list-snapshot.test.js` compares `states[*].tools`
against the live builder and is green. Nothing compares the prose note to the file it annotates. And the
note is exactly the part a person reads before deciding whether to run
`node test/qa/mcp-tools-list-snapshot.test.js --write`: `tools-list-full.json:3` ends by telling that
person which two states `--write` touches and which four must never be regenerated. A note that
misdescribes the fixture it governs is a wrong instruction at the moment of an irreversible action.

**Closing it.** Correct both notes to 21 and 22. Then close the gap that let them drift: have
`mcp-tools-list-snapshot.test.js` parse every `\d+ tools?` figure out of each fixture's own `note` and
assert it matches that fixture's recorded state counts, so the prose cannot disagree with the JSON beside
it.

---

### B7 — [medium] The annotation document under-counts the access-log carve-out it exists to disclose

**Where.** `docs/mcp-tool-annotations.md:41`:

> "Six read tools cause one write: `recordPiiAccess` files a row in `companies/{cid}/piiAccessLog` …"

**Measured:** `registry.TOOL_REGISTRY` has **nine** rows with `piiAccessLogged: true`, and all nine carry
`readOnlyHint: true`: `search_orders`, `get_order_detail`, `get_order_financials`,
`get_dashboard_summary`, `get_extra_spending_overview`, `get_financial_overview`,
`get_bank_spending_summary`, `search_bank_transactions`, `search_commerce_orders`.
`functions/test/qa/mcp-tool-annotations.test.js:174-185` pins exactly those nine names. The same
document's own per-tool section already discloses the row on nine tools — `:156`, `:163`, `:233`, `:240`,
`:247`, `:254`, `:261`, `:268` and `:347` — so the document contradicts itself between its summary
sentence and its own table.

**Invariant.** Disclosure accuracy. This document is the registry's annotation table written out for a
reader; §41 is the sentence that discloses the one place a `readOnlyHint: true` tool writes. Six is now
only the flags-**off** dispatchable set — `_nvMcpPiiLoggedActions()` returns 7 with the orchestrator flag
off (the seventh being `search_commerce_orders`, which is registered but not dispatchable in that state)
and 9 with it on. Neither number is six.

**Provenance.** `git log -L 41,41:docs/mcp-tool-annotations.md` names one commit, `bc718e06` — the commit
that wrote the document, when six was true. The two bank tools gained the row later, behind the
orchestrator flag (§5.5 of the submission, `:393-411`).

**Closing it.** Change "Six read tools" to nine at `:41` and name the two bank tools' flag condition in the
same sentence, since flags-off they are not among them. Then pin it: `mcp-tool-annotations.test.js`
already holds the canonical nine-name list at `:174-185`; have it also assert that `:41`'s number equals
`TOOL_REGISTRY.filter(e => e.piiAccessLogged).length`.

---

### B8 — [medium] The submission's carve-out sign-off counts seven where the flipped state is nine

**Where.** `docs/mcp-submission-1.2.0.md:438-442`, §5.7 — "a position to sign off, not a bug", explicitly
the operator's signature:

> "Six live read tools (`search_orders`, `get_order_detail`, `get_order_financials`,
> `get_dashboard_summary`, `get_financial_overview`, `get_extra_spending_overview`) and one of the new ones
> (`search_commerce_orders`) write one `piiAccessLog` row per call … The alternative — flipping seven
> `readOnlyHint`s to `false` —"

§5.5 of the same document, `:393-411`, states that `get_bank_spending_summary` and
`search_bank_transactions` now record the read, "behind the flag" — and the flag is
`NIVADESK_MCP_ORCHESTRATOR`, the one §5.7 is being signed off for. Verified by driving the deployment:
`_nvMcpPiiLoggedActions()` returns **7** with the flag off and **9** with it on.

**Invariant.** The operator signs a described position. The described position is seven tools; the
position they would actually be signing, in the state the signature authorises, is nine — and the
alternative it weighs ("flipping seven `readOnlyHint`s to `false`") is nine hints, two of them on the bank
tools, which is a materially larger change than the one described.

**Closing it.** Rewrite `:438-442` to name all nine, split by flag state: seven when the flag is off (six
live plus `search_commerce_orders`, registered but not dispatchable), nine when it is on. Say the
alternative is nine hints. Then pin the §5.7 list the way `:174-185` pins the registry's, so this sentence
cannot drift from `TOOL_REGISTRY` again.

---

### B9 — [low] The design document states a present-tense wire count that is false

**Where.** `docs/mcp-orchestration-design.md:118`:

> "Both flags on is **30** tools, not 31."

Measured: **22**, wrong by eight. The surrounding figures in the same paragraph ("19 published with the
orchestrator flag off, 21 with inventory, 29 with the orchestrator, 31 with both") are framed as a
measurement taken before the fold and are fine as history — but this sentence is the *corrected*,
present-tense value, in a revision block headed "Closed the same day", and it is the answer a reader takes
away.

**Invariant.** Same as B4 and B5: a stated current count the builder contradicts.

**Why lowest of the count findings.** The banner at `:5-19` already disclaims the document's capability
set in strong terms — "eight of the ten capabilities below are NOT in this release", "read it as the
design, and §8.1 of `docs/orchestrator-contract.md` as the surface". But it disclaims *which capabilities
ship*, not *a measured tool count stated as the current answer*, and `:119-120` hands the reader to
`docs/mcp-inventory-search-decision.md` for the count — which is B5, also wrong.

**Closing it.** Change **30** to **22** at `:118`. Covered by the same harness widening as B4.

---

## 3. What is not blocking

The four invariants this gate certifies all hold, and every guard deleted to test the harness was
caught. That evidence, and eight non-blocking findings, are in `docs/mcp-backlog.md`. Nothing there
argues against the verdict; it is what the next changes should be measured against once B1–B9 are
closed.

## 4. The W2 answer

**The WhatsApp W2 gate is NOT unblocked from the MCP side.** It is unblocked only on PASS, and this gate
is STOP. Re-run the gate after B1–B9 are closed, each with the test that keeps it closed.
