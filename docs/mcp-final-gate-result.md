# MCP 1.2.0 — final gate result

**Verdict: PASS.** All five checks hold. The registry, the published listing, the dispatcher and the
documents describe the same two new capabilities — a non-financial order search and read
(`search_commerce_orders`) and one canonical inventory search (`search_inventory`) — and with every MCP
flag unset the listing is byte-identical to production 1.1.1.

No code was changed. No suite is red, so nothing was fixed under this gate; the only files this run
writes are this one and `docs/mcp-backlog.md`.

- Repository: `/Users/gocmen/Developer/studioflow-mcp`, branch `mcp-orchestration`
- Commit gated: `01e5ab6c` ("The release notes told OpenAI two hints move, and three do")
- Working tree: clean at every measurement below (`git status --porcelain` empty, before and after)
- Date: 7 September 2026

This is the gate the previous run's nine blocking findings (B1–B9) were raised against. B2–B9 were
closed by the twelve commits between `7ad8cdd9` and `01e5ab6c`; each closure is re-verified here against
the CODE rather than against the commit message, and the verification is recorded in §1–§5.

**B1 is out of scope by operator instruction.** The SSRF finding on the assistant's file-fetch paths is
being assessed on its own branch in another worktree. It was not examined, not touched and not fixed
here, and nothing in this document should be read as a statement about its status.

---

## 0. What was run, and what it returned

Every command was run here. Exit codes are the shell's.

| suite | command | exit | result |
|---|---|---|---|
| unit / fake-Firestore | `cd functions && npm test` | **0** | 130 files, 1382 `PASS`, 0 `FAIL` |
| production parity | `node docs/evidence/capture-tools-list.js` | **0** | PASS on both snapshots, BYTE-IDENTICAL |
| no money | `node functions/test/qa/mcp-no-money.test.js` | **0** | 6 `PASS` |
| reduced surface | `node functions/test/qa/mcp-reduced-surface.test.js` | **0** | 16 `PASS` |
| one inventory search | `node functions/test/qa/mcp-one-inventory-search.test.js` | **0** | 8 `PASS` |
| tools/list snapshot | `node functions/test/qa/mcp-tools-list-snapshot.test.js` | **0** | 15 `PASS` |
| orchestrator contract | `node functions/test/qa/orchestrator-contract.test.js` | **0** | 33 `PASS` |
| guide corpus freshness | `node functions/test/qa/guide-corpus-fresh.test.js` | **0** | 3 `PASS` |

**On the count.** `grep -c '^PASS'` returns **1382**, which is the number of assertions. `grep -c 'PASS'`
returns 1383 because one line of the password-policy suite reads `✅ PASSWORD POLICY GEÇTİ` and the
substring matches. `npm test` stops at the first failing file (`|| exit 1`), so exit 0 is a statement
about all 130 files, not about the first one.

**The emulator chain was not run, and did not need to be.** The condition is a rules or Firestore path
change. This run changed no code at all — the working tree was clean before the first measurement, and
the only files it writes are this one and `docs/mcp-backlog.md` — so there is no path for the emulator
chain to cover. Ports 8080 and 9199 were not touched.

**One suite went red during this run, against THIS document, and it was right to.** The first draft of
§7 below named customer search without stating plainly that it does not exist and is not being added, so
`mcp-reduced-surface.test.js`'s "the documents that name customer search say plainly that there is none"
failed on `mcp-final-gate-result.md` — the guard scans every `docs/*.md` that contains the phrase and
requires both halves of the answer. §7 now opens with both. The suite was re-run to green afterwards
(exit 0, 1382 `PASS`, 0 `FAIL`), and the parity harness was re-run after the edit and still reports
BYTE-IDENTICAL. It is recorded here rather than quietly fixed because a gate that reports "no suite is
red" should say when one was.

---

## 1. The registry — what it defines beyond the production baseline

Derived by calling `registry.publishedEntries()` over all eight flag combinations, not by reading the
table.

The baseline — every MCP flag off — is **19** rows, and those 19 are the production tools. Three rows sit
behind flags:

| row | `flag` | published when |
|---|---|---|
| `search_inventory` | `["inventory", "orchestrator"]` | either flag |
| `create_inventory_item` | `"inventory"` | inventory only |
| `search_commerce_orders` | `"orchestrator"` | orchestrator only |

`functions/orchestrator/registry.js:604`, `:631`, `:675`.

**The delta under the release flag is exactly two.** With `NIVADESK_MCP_ORCHESTRATOR=1` and nothing else,
the registry publishes 21 rows: the 19 baseline rows plus `search_inventory` and
`search_commerce_orders`. That is the answer to the gate's question.

**`create_inventory_item` is not a third new capability, and this was checked rather than assumed.** It is
already present in `functions/index.js` at the production commit `015d5792`, behind the same pre-existing
`NIVADESK_MCP_INVENTORY` flag (`git show 015d5792:functions/index.js` contains the name seven times and
`NIVADESK_MCP_INVENTORY` once). It is a pre-existing hidden write tool, not part of the 1.2.0 read layer,
and the design says exactly that at `docs/mcp-orchestration-design.md:1914-1915`: "`create_inventory_item`
is not new either — it is the pre-existing hidden write tool that `NIVADESK_MCP_INVENTORY` has always
published beside the search."

Measured per state, `delta` being the names not in the flags-off baseline:

```
e=0 i=0 o=0  count=19  delta=[]
e=0 i=0 o=1  count=21  delta=[search_inventory, search_commerce_orders]
e=0 i=1 o=0  count=21  delta=[search_inventory, create_inventory_item]
e=0 i=1 o=1  count=22  delta=[search_inventory, create_inventory_item, search_commerce_orders]
e=1 i=0 o=0  count=19  delta=[]
e=1 i=0 o=1  count=21  delta=[search_inventory, search_commerce_orders]
e=1 i=1 o=0  count=21  delta=[search_inventory, create_inventory_item]
e=1 i=1 o=1  count=22  delta=[search_inventory, create_inventory_item, search_commerce_orders]
```

No state removes a baseline row. `missingFromBaseline` is empty in all eight.

---

## 2. The published tool list — what the builder emits, in every flag state

Derived by running the real builder, `_nvMcpToolsWithSecuritySchemes()`, in one child process per state
with every environment variable whose name contains `MCP` deleted first, then setting only the flags
under test.

| e | i | o | tools | listing sha256 (first 16) | added vs flags-off |
|---|---|---|---|---|---|
| 0 | 0 | 0 | **19** | `7c838fb68a5b6e97` | — |
| 0 | 0 | 1 | **21** | `6dd8dbae769a3a4b` | `search_inventory`, `search_commerce_orders` |
| 0 | 1 | 0 | **21** | `ab882cf11bed6d1b` | `search_inventory`, `create_inventory_item` |
| 0 | 1 | 1 | **22** | `927eeeb022b2140d` | + `search_commerce_orders` |
| 1 | 0 | 0 | **19** | `af48fc7c4613a0db` | — (names identical; `attach_bank_receipt` gains inputs) |
| 1 | 0 | 1 | **21** | `8b2aa178aadaaf48` | `search_inventory`, `search_commerce_orders` |
| 1 | 1 | 0 | **21** | `7ffb69b0b037ba05` | `search_inventory`, `create_inventory_item` |
| 1 | 1 | 1 | **22** | `f9b976e5ddbd031e` | + `search_commerce_orders` |

**The builder agrees with the registry name-for-name in all eight states.** No tool appears in the
listing that has no registry row, and no flag-gated row fails to appear when its flag is on.
`search_inventory` is listed once with both flags on, never twice — 22 and not 23.

The `e=1 i=0 o=0` row is worth naming so it is not read as drift: the tool NAMES are the production 19,
and the listing hash moves only because `NIVADESK_MCP_EMAIL_RECEIPTS` adds `receiptUrl` / `emailReceipt`
inputs and two sentences to `attach_bank_receipt`. That flag is not part of the flags-off invariant, which
is measured with every MCP variable unset.

---

## 3. The dispatcher — which names `run()` accepts, and which it refuses

Derived by constructing an orchestrator with stub deps and an owner context and actually calling
`run()` once per candidate name per flag state — 28 names × 4 states — recording the outcome.

**`run()` accepts exactly two capability names**, and only when a flag that publishes them is on:

| name | accepted | note |
|---|---|---|
| `search_inventory` | yes | under `inventory` OR `orchestrator` |
| `search_commerce_orders` | yes | under `orchestrator` only |
| `search_inventory_items` | yes, as an alias | resolves to `search_inventory`; the envelope answers `search_inventory` |

`HANDLERS` has two keys and `CAPABILITY_NAMES` is `["search_inventory", "search_commerce_orders"]`
(`functions/orchestrator/index.js:56-60`). `CAPABILITY_ALIASES` is
`{"search_inventory_items": "search_inventory"}` (`:79`).

**What it refuses.** With every flag off, all 22 registry names are refused: the 19 baseline names with
`invalid-argument` "Unknown capability" — they are dispatched by `index.js`, not by the orchestrator — and
the two flag-gated orchestrator names with `failed-precondition` "not switched on in this deployment".
`create_inventory_item` is refused in every state with `invalid-argument`, which is correct: it is an
`index.js` MCP tool, not an orchestrator capability, and is served by `nvChatGPTCreateInventoryItem`
(`functions/index.js:24671`).

**Every invented name is refused in every state**, including `search_customers`, `get_customer_detail`,
`get_attention_items`, `get_payout_summary`, `get_order_financials_v2` and `totally_bogus`.

**The MCP layer was checked independently of the orchestrator.** `_nvMcpAvailableActions()` and
`_nvMcpToolsWithSecuritySchemes()` were compared as sets in all eight flag states: identical in all
eight, with no duplicate entries. This is the list-versus-dispatcher split closed in both directions —
nothing listed is undispatchable, and nothing dispatchable is unlisted. `search_inventory` is pushed
exactly once when both flags are on (`functions/index.js:24450-24451`).

---

## 4. The documents — what they say is published

Each was read against the code as it stands at `01e5ab6c`, not against another document.

| document | where | what it says | agrees |
|---|---|---|---|
| the guide | `studioflow-web/lib/publicSite/guide.ts:1205-1210` (EN), `:2427-2432` (TR) | "Coming in the next version": one bullet for the cross-channel order search, one for stock search with the confirmed photo-add | yes |
| the checklist | `docs/mcp-submission-1.2.0.md:565-568` (§6 step 8) | probe `search_commerce_orders` and `search_inventory` | yes (see backlog) |
| the release notes | `docs/mcp-submission-1.2.0.md:600-611` (§7) | "two read-only tools — one that searches orders … and one that searches its stock"; "**Neither reports any monetary value**" | yes (see backlog) |
| the submission | `docs/mcp-submission-1.2.0.md:93-96`, `:199-206` (§3 table) | "exactly two capabilities"; per-flag wire counts 19 / 19 / 21 / 21 / 22 | yes |
| the contract | `docs/orchestrator-contract.md:351`, `:620-640` | "the two capabilities `run()` serves"; exactly one logs PII; neither reports money | yes |
| the design | `docs/mcp-orchestration-design.md:5-16` (§0), `:1913-1919` (§6.5–6.6) | "what ships behind `NIVADESK_MCP_ORCHESTRATOR` is the two that exist"; `create_inventory_item` "is not new either" | yes |
| the annotations doc | `docs/mcp-tool-annotations.md:87-92` | "Twenty-two tools. Nineteen are published … the groups overlap by exactly one row" | yes |
| the fixtures | `functions/test/fixtures/mcp/tools-list-full.json` | off 19, emailReceipts 19, inventory 21, emailReceipts+inventory 21, orchestrator 21, inventory+orchestrator 22 | yes |
| the evidence | `docs/evidence/tools-list-{production-015d5792,candidate-flags-off}.json` | both `toolCount: 19`, both `listingSha256: 7c838fb6…` | yes |

**The per-flag counts in the documents were checked against the builder, not against each other.** Every
tool count stated in the six MCP documents was swept for figures outside {19, 21, 22}; the only remaining
hits are a section number (`§5.2`), a labelled historical-correction block quoting the stale claims it
corrects (`docs/mcp-orchestration-design.md:1880-1884`), and two per-flag DELTA counts of "2 tools"
(`:1918-1919`), which are correct as deltas.

**The guide is not merely written, it is enforced.** `functions/test/qa/mcp-reduced-surface.test.js:297`
reads the `chatgpt-app` chapter out of the BUILT corpus (`functions/assistant/guideCorpus.json`, which is
what the in-app bot answers from) and asserts both directions against the registry: every removed
capability's identifying phrase must be absent, and every flag-gated published capability must have a
marker present, in EN and TR. The marker table is derived from `registry.publishedNames()`, so it cannot
fall behind the registry. `guide-corpus-fresh.test.js` passes, so the built corpus matches the source.

**Access-log counts verified by running code.** `_nvMcpPiiLoggedActions()` names **7** with the
orchestrator flag off (6 of them reachable) and **9** with it on (all 9 reachable), which is exactly what
`docs/mcp-submission-1.2.0.md:504-514` (§5.7) claims. B7 and B8 are closed.

**Fixture and evidence counts verified.** `functions/test/fixtures/mcp/tools-list-full.json`'s six states
match the builder exactly. B5 and B6 are closed. `docs/mcp-inventory-search-decision.md:172` now reads
19 / 21 / 21 / 22.

---

## 5. The fifth check — flags OFF, byte-identical to production 1.1.1

Re-captured, not read off a note. `docs/evidence/capture-tools-list.js` `git archive`s production
`015d5792` into a scratch directory, measures the WORKING TREE as the candidate, and requires every
environment variable whose name contains `MCP` to be deleted before either side is required:

```
PASS  tools-list-production-015d5792.json matches the committed snapshot
PASS  tools-list-candidate-flags-off.json matches the committed snapshot

production listing sha256 : 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984
candidate  listing sha256 : 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984   (working tree at 01e5ab6c)
VERDICT: the flags-off candidate listing is BYTE-IDENTICAL to production.
```

**Four independent records of the same listing, all one hash.** The harness's two sides were cross-checked
against a third derivation (my own builder run at `e=0 i=0 o=0`, §2) and a fourth (the committed test
fixture's `states.off`):

```
production fixture   sha: 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984
candidate  fixture   sha: 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984
live builder (o=0)   sha: 7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984
test fixture states.off names == production names: true
```

The invariant holds. Nothing in the reduced 1.2.0 surface moves the flags-off wire.

---

## 6. No money, and how it was proved

Three independent ways, because a source read alone would not settle it.

**(a) Runtime, exhaustively.** An order fixture was built carrying more than thirty money-shaped fields
(`total`, `totalAmount`, `price`, `cost`, `amount`, `amountPaid`, `outstanding`, `balanceDue`, `deposit`,
`refund`, `refundAmount`, `vat`, `tax`, `platformTax`, `payout`, `fee`, `margin`, `profit`, `revenue`,
`subtotal`, `grandTotal`, `shippingCost`, `discount`, `currency`, a `payments` array, a `lineItems` array
with per-line `price`/`cost`/`currency`, and a nested `totals` block) and an inventory fixture carrying
`price`, `unitPrice`, `cost`, `costPrice`, `unitCost`, `value`, `totalValue`, `retailPrice`, `currency`
and `margin`. Both capabilities and the alias were then run in all eight flag states under nineteen
argument sets chosen to try to switch money back on — `{financial:true}`, `{includeFinancials:true}`,
`{advanced:true}`, `{includeTotals:true}`, `{includePayments:true}`, `{detail:"full"}`,
`{mode:"financial"}`, `{view:"financial"}`, `{expand:"totals"}`, `{fields:["totals","payments"]}` and
combinations — each also re-run on the `whatsapp` channel so the compact renderer is covered as well as
the chat one.

**304 successful runs. Zero hits.** The whole emitted envelope is walked recursively for any key matching
`/(total|amount|paid|outstanding|balance|refund|vat|tax|payout|price|cost|margin|profit|revenue|\bfee|currency|deposit|discount|subtotal|money|monetary|charge|invoice|credit|debit|gross|\bnet\b|\bsum\b|\bvalue\b|\bdue\b)/i`
and for any string containing a currency symbol beside a number or a two-decimal figure. Nothing matched,
in any state, under any argument. Passing `financial: true` changes nothing, because there is no branch
left for it to reach.

**(b) The wire contract.** The published schemas and descriptions of both tools were scanned the same
way. The only hits on `search_commerce_orders` are its `paymentStatus` enum — `unpaid`, `pending`,
`authorized`, `paid`, `partially_paid`, `partially_refunded`, `refunded`, `voided`, `unknown` — which are
status WORDS and never figures, and the word "amounts" inside the description's own disclaimer: "It
reports no amounts at all: no order total, nothing paid or outstanding, no refund, no tax and no
currency." Neither tool declares an `outputSchema`, and neither input schema accepts a monetary filter.
`search_inventory` produced no hits at all.

**(c) Reachability.** `HANDLERS` routes to `commerce.searchCommerceOrders` and
`inventory.searchInventoryItems` and to nothing else. The money-bearing functions still on disk —
`commerceOverview`, `channelPerformance`, `settlementTotals` in `commerce.js`, `inventoryOverview` in
`inventory.js` — are exported but have no registry row, no schema in `index.js` and no dispatcher case,
so no flag state can list or call one. The single `money.workspaceCurrency` call in `inventory.js` is at
`:66`, inside `inventoryOverview`, which begins at `:57` and is not dispatched; `searchInventoryItems`
begins at `:130` and never touches it. The `if (financial) { row.totals = … }` block the operator named
is gone from `commerce.js` — the word `financial` survives there only in comments and in the unreachable
`advancedFinance()` path.

---

## 7. No customer search, and how it was proved

**There is no customer search and no customer read capability on this surface. Nothing was removed to
get to two — it was never built — and none is being added.** The operator's list of what to build named
"customer search and read" third; it was never written, and on 7 September 2026 the operator settled that
it will not be, because adding one would put a third capability into a scope frozen at two. Any document
that reads as though a customer capability is planned is describing the request, not the release.

That is the claim. Four ways it was checked, all by running code or reading the definition that decides
it:

1. **Dispatch.** `run()` refuses `search_customers`, `get_customer_detail`, `get_customers` and
   `search_contacts` with `invalid-argument` in all four flag states tested. `HANDLERS` has no key
   containing "customer" (`functions/orchestrator/index.js:56-60`).
2. **Registry.** No row whose name contains "customer" exists in any of the eight flag projections; the
   full 22-row table was enumerated and none matched.
3. **Listing.** No published tool in any of the eight builder states carries a customer name.
4. **Loaders.** `loaders.DOMAIN_GATES` has eleven domains — `settings, orders, production, connections,
   commerceHealth, review, inventory, bank, receiptInbox, accounting, payouts` — and no `customers`
   domain, so a capability that wanted one could not read it even if a handler were written.

The documents say so too, and say it as a decision rather than an omission:
`docs/orchestrator-contract.md:626-630`, `docs/mcp-submission-1.2.0.md:85-96`,
`docs/mcp-orchestration-design.md:9-12`. Customer data reaches an assistant only as fields on an order
row, under `search_commerce_orders`' declared `pii: ["name","email"]` and its access-log row — and the
registry gates that row on `piiAccessLogged`, the same predicate the MCP dispatcher keys on, so the two
surfaces cannot describe one read differently.

---

## 8. Verdict

| # | check | result |
|---|---|---|
| 1 | registry beyond baseline | **holds** — orchestrator delta is exactly `search_inventory` + `search_commerce_orders` |
| 2 | published listing, all 8 flag states | **holds** — name-for-name identical to the registry projection |
| 3 | dispatcher accept/refuse | **holds** — accepts exactly those two (plus one internal alias), refuses all else |
| 4 | the documents | **holds** — guide, checklist, release notes, submission, contract, design, annotations doc and fixtures all describe the same two |
| 5 | flags OFF byte-identical to 1.1.1 | **holds** — `7c838fb6…`, re-captured, agreeing across four independent records |
| — | no money from either capability | **holds** — 304 runs, 0 hits; schemas and descriptions clean |
| — | no customer search anywhere | **holds** — refused at dispatch, absent from registry, listing and loaders |

**PASS.** There is no disagreement between the four to name.

Three things were noticed that are neither a disagreement between the four nor an invariant breach. They
are in `docs/mcp-backlog.md` §6 and none of them touches the two capabilities, the flags-off listing, the
money invariant or the customer-search invariant.

---

## 9. The two gate questions

**May the MCP gate close?** Yes, from the parity gate's side. All five checks hold, every suite is green,
and the branch describes itself accurately in code and in text. The gate does not authorise a deploy or a
flag flip — §6 of the submission is still the operator's flip-day order, and the backlog's §6 items are
worth reading before that day because two of them are flip-day instructions rather than defects.

The one thing this gate is silent on is B1, the SSRF finding on the assistant's file-fetch paths. It is
being assessed on its own branch in another worktree, it was not examined here, and it is not part of
this verdict in either direction.

**Is the WhatsApp W2 gate unblocked from the MCP side?** Yes. W2's dependency on this branch is that a
second channel can reach the same capabilities through the same table without a second tool set to drift
out of step. That is now measured rather than asserted:

- `listCapabilities({ channelProfile })` and `run()` both resolve through `registry.publishedForChannel`,
  so a WhatsApp binding's allowed set is a projection of the one registry, not a second list.
- Both capabilities were exercised on `channel.type: "whatsapp"` in §6(a) — half of the 304 runs — and
  returned the same envelope with the compact renderer, carrying no money.
- The channel-agnostic defects the contract names are closed in code: `actorRoleFor()` derives the
  access-log actor from the channel (`whatsapp` → `whatsapp_binding`) instead of hardcoding
  `chatgpt_connection`, and the marketplace-block audit row carries `source: ctx.channel.type`.

W2 is unblocked from the MCP side. It is not unblocked by this document for anything on its own side.

## 10. Re-run independently, on the gated commit, by a second party

Everything in §0–§9 was produced by the gate agent. The three claims that decide the gate were then
re-run from scratch on the working tree at `4c942d0b`, by a different reader, with no cached result
in between. This section is that second record; it is not a copy of the first.

| Claim | Re-run command | Result |
|---|---|---|
| The two kept capabilities emit no money | `node test/qa/mcp-no-money.test.js` | exit 0 — four checks pass, including *every finished envelope is money-free, in all eight flag states and for every caller* |
| The branch is green | `npm test` (functions) | **exit 0, 1382 PASS, 0 FAIL** — the suite stops at the first failure, so a clean exit is the whole suite, not a prefix |
| Flags OFF is production 1.1.1 | `node docs/evidence/capture-tools-list.js` | production `7c838fb6…64984`, candidate `7c838fb6…64984`, **byte-identical**, and both committed snapshots still match |

The count moved from the 1370 the demonetise agent reported to 1382 because the alignment and gate
passes added checks; no test was removed to reach a clean run.

**Gate verdict, seconded: PASS.** Nothing here was deployed, no flag was turned on, and the branch is
pushed to `origin/mcp-orchestration` only so the work is not held on one machine.
