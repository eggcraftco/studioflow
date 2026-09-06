# MCP production parity: does the flags-off candidate equal production?

> **Verdict: YES.** With every MCP feature flag unset, the `mcp-orchestration` **working tree** serves a
> `tools/list` **byte-identical** to the deployed production tree — 19 tools, same order, same
> descriptions, same input schemas, same annotations, same advertised scopes. Both listings hash to
> `7c838fb68a5b6e97571ec9605638913014e06931765e4b0dbe0bd53cbce64984`. **Zero differences to classify.**

Measured 6 Sep 2026, read-only. No authenticated call was made to production. The candidate side is
captured from the working tree rather than a commit, and each capture stamps the HEAD sha it was taken
at into `docs/evidence/tools-list-candidate-flags-off.json` — so re-running the harness re-measures what
is actually there. It used to archive a fixed commit (`56b6591c`) while calling it "HEAD"; five commits
later it still printed PASS and "BYTE-IDENTICAL", because it was faithfully re-measuring a commit nobody
was proposing to ship. The one document whose job is to catch drift must not be the one that cannot see
it.

---

## 1. What "production" means here, and how it was established

| fact | value | how it was established |
|------|-------|------------------------|
| live revision | `chatgptmcp-00071-tir` | `gcloud run revisions describe`, read-only |
| MCP feature flags in production | **none — all unset** | the service carries 32 environment entries and not one name contains `MCP`; there is no `NIVADESK_MCP_*` and no `NV_MCP_*`. Names only were listed, never values. |
| deployed source | deploy branch `functions/` at `ea37d25d` | deployment record; `functions/` unchanged on that branch since |
| **baseline used below** | **`015d5792`** | `git diff 015d5792..ea37d25d -- functions/` is **empty** — not merely `index.js`, the *entire* `functions/` tree is identical. |

So production serves the flags-OFF listing: email receipts off, inventory off, orchestrator off.

`tools/list` on the live endpoint requires an OAuth bearer token and answers `401` without one, so the
production listing is **reconstructed from the deployed source**, not fetched. The reconstruction is
sound because the extracted baseline `functions/index.js` hashes
`80a971811e76d42ccc2d8adf65867b5850f580bc08097fc8c913440a8eb5750f`, identical to
`git show ea37d25d:functions/index.js`.

**"The merge base" names two different commits on this branch, so nobody should use the phrase bare.**
`git merge-base HEAD main` is **`f753a8ca`** — that is the merge base, and it is what
`docs/mcp-submission-1.2.0.md` §4 and `test/fixtures/mcp/tools-list-full.json` mean by the term.
`015d5792` is the merge base with the *deploy* branch `macbook-save-before-macstudio-2026-06-01`, which
is a different commit and the only one relevant to a parity question, because it is the one that was
deployed. An earlier revision of this document called `015d5792` "exactly this branch's merge base",
which put two definitions of one phrase on one branch. §5 says what follows from that.

## 2. Method — re-runnable

`docs/evidence/capture-tools-list.js`, committed beside the snapshots:

```
node docs/evidence/capture-tools-list.js          # verify against the committed snapshots
node docs/evidence/capture-tools-list.js --write  # regenerate them
```

The two sides are fetched differently, on purpose:

- **production** is `git archive`d from the fixed commit `015d5792` into a scratch directory (never a
  checkout, so the working tree is untouched). Fixed is right here: it is a record of what is deployed,
  and it must not move when the branch does.
- **the candidate** is the repository's own `functions/` tree. Never pinned: a harness that archives a
  fixed commit cannot see drift in the thing it certifies.

Both are then required with **every environment variable whose name contains `MCP` deleted**. Unset is
the faithful state — production has no MCP entry at all — rather than `"0"`, which is what the existing
snapshot test uses. Both reach the same code path (`=== "1"`), but only one of them matches the deployed
environment.

The baseline keeps its listing builder module-local, so the harness appends a one-line export shim **to
the scratch copy only**, and refuses outright to shim the working tree; each snapshot records the
pristine sha256 taken before the shim, so the shim can be shown not to have altered the source that
produced the listing. The candidate snapshot also records the HEAD sha at capture and whether
`functions/` was dirty, so the evidence names the commit it was measured at instead of the word "HEAD".

Snapshots (full listing: name, title, description, complete input schema, annotations, securitySchemes,
`_meta`, in listing order):

- `docs/evidence/tools-list-production-015d5792.json`
- `docs/evidence/tools-list-candidate-flags-off.json` (its `meta.commit` names the HEAD it was taken at)

## 3. The classification table

Every difference, classified into exactly one of the three classes:

| # | difference | class |
|---|-----------|-------|
| — | **none found** | — |

Broken out per class, so the empty result is not a formatting accident:

| class | count | tools involved |
|-------|-------|----------------|
| expected/documented (`mcp-submission-1.2.0.md` §3) | **0** | — |
| backward-compatible metadata-only | **0** | — |
| **unexpected — a listing field that changed** | **0** | — |

The third class used to be named "unexpected/**behaviour**-changing", and §6 then retracted the word:
"Handler behaviour is **not** [compared]". A zero counted over `tools/list` must not be labelled with a
word this document does not measure — and the label was not merely imprecise. Two flags-off behaviour
changes were live under it: `nvMcpPiiAccessEntry`'s `source` and `note` fields changed what every
`piiAccessLog` row records, for the six reads production already logs, with every MCP flag unset. They
are behind `NIVADESK_MCP_ORCHESTRATOR` now, and `mcp-tool-annotations.test.js` pins the flags-off row
field by field against what the deployed tree writes. See §6 for what this document does and does not
cover.

In particular, **no tool that does not exist in production appears with the flags off.** The candidate
serves 19 tools; production serves the same 19. The flagged capabilities — `search_commerce_orders`,
`search_inventory` and `create_inventory_item` — are all absent from the flags-off listing, which is the
operator's invariant holding rather than being tested and excused. (This was written when the flagged set
was ten capabilities. The scope reduction of 6 September 2026 took eight of them out of the release
entirely, so they are absent from every listing in every flag state, not only from this one; the verdict
above is unaffected, and the capture was re-run against the reduced tree to confirm it.)

### 3.1 The comparison in full

All 19 tools, in listing order. Every field below — plus `title`, `description` and the full
`inputSchema`, which are too long to table — is identical on both sides; a field-by-field walk over all
seven emitted keys of all 19 tools returns **0 differences**.

| # | tool | schema props | required | annotations (read/destructive/idempotent/openWorld) | advertised scopes |
|---|------|-------|----------|----------------------|--------|
| 1 | `create_order` | 15 | — | F/F/F/F | `orders.write` |
| 2 | `search_orders` | 4 | — | T/F/T/F | `orders.read` |
| 3 | `get_order_detail` | 2 | `orderId` | T/F/T/F | `orders.read` |
| 4 | `add_order_note` | 3 | `orderId`, `note` | F/F/F/F | `orders.write notes.write` |
| 5 | `update_order_status` | 4 | `orderId` | F/T/T/F | `orders.write` |
| 6 | `create_note` | 7 | — | F/F/F/F | `notes.write` |
| 7 | `search_notes` | 5 | — | T/F/T/F | `notes.read` |
| 8 | `get_note_detail` | 2 | `noteId` | T/F/T/F | `notes.read` |
| 9 | `append_note` | 3 | `noteId`, `text` | F/F/F/F | `notes.write` |
| 10 | `update_note` | 7 | `noteId` | F/T/T/F | `notes.write` |
| 11 | `pin_note` | 3 | `noteId` | F/F/T/F | `notes.write` |
| 12 | `archive_note` | 3 | `noteId` | F/F/T/F | `notes.write` |
| 13 | `get_order_financials` | 5 | — | T/F/T/F | `finance.read` |
| 14 | `get_dashboard_summary` | 2 | — | T/F/T/F | `orders.read finance.read` |
| 15 | `get_extra_spending_overview` | 10 | — | T/F/T/F | `finance.read` |
| 16 | `get_financial_overview` | 2 | — | T/F/T/F | `finance.read` |
| 17 | `get_bank_spending_summary` | 4 | — | T/F/T/F | `finance.read` |
| 18 | `search_bank_transactions` | 10 | — | T/F/T/F | `finance.read` |
| 19 | `attach_bank_receipt` | 7 | — | F/T/F/T | `finance.read orders.write` |

Note rows 5, 10, 11, 12 and 19: the annotation values production is serving **today** already include
the ones §4 of the submission doc describes as corrected on this branch. See §5.

## 4. Adjacent flags-off surfaces

`tools/list` is one document. The invariant is behavioural, so the surfaces around it were checked the
same way — driven from both extracted trees with the flags unset, not read off a diff.

| surface | production (`015d5792`) | candidate flags-off | equal? |
|---------|------------------------|---------------------|--------|
| `initialize` result, incl. `instructions` | — | — | **yes**, identical |
| default minted scope (client names none) | `orders.read orders.write` | `orders.read orders.write` | **yes** |
| `WWW-Authenticate` challenge scope | `orders.read notes.read finance.read` | `orders.read notes.read finance.read` | **yes** |
| `.well-known` `scopes_supported` (both documents) | the six | the six, same order, via `registry.SCOPES_SUPPORTED` | **yes** |
| dynamic registration response | `redirect_uris`, `client_name`, `scope` defaulting to the six | same three, `scope` via `nvOAuthDefaultScope()` = the same six | **yes** |
| redirect-URI binding sites | `nvOAuthRedirectAllowed` at both authorize and approve | same two sites | **yes** |

The scope widening and the dispatcher's scope gate are both behind `NIVADESK_MCP_ORCHESTRATOR` and were
confirmed inert with it unset — `nvOAuthMintDefaultScope()` and `nvMcpChallengeScope()` return the
literal 1.1.1 strings.

## 5. What this measurement corrects — `mcp-submission-1.2.0.md` §4

**§4's four claims are true.** An earlier revision of this section printed them in a table marked
**False**, and that was wrong: it ruled on `f753a8ca` without ever measuring `f753a8ca`, replacing
"claims about the wrong commit" with false claims about the right one — the same failure mode it was
written to fix.

All four were replayed by driving the extracted trees, not by reading a diff:

| §4 claim, measured against `f753a8ca` — the commit §4 actually names | result |
|---------|------|
| "Between the merge base and `bc718e06` the branch added three tools (`get_bank_spending_summary`, `search_bank_transactions`, `attach_bank_receipt`)" | **True.** `f753a8ca`'s flags-off listing is 16 tools, `create_order` … `get_financial_overview`; `bc718e06`'s is 19. |
| "corrected six annotation values across four tools (`update_order_status`, `update_note`, `pin_note`, `archive_note`)" | **True.** Exactly six, across exactly those four: `update_order_status` destructive f→t and idempotent f→t, `update_note` the same pair, `pin_note` idempotent f→t, `archive_note` idempotent f→t. |
| "renamed 'Lite' to 'Starter' in two descriptions" | **True.** Exactly two: `get_dashboard_summary` and `get_extra_spending_overview`. |
| "the dynamic **registration response** is not what the merge base returned. The base echoed all six scopes unconditionally and carried no `redirect_uris` or `client_name`" | **True.** `f753a8ca:functions/index.js` returns `scope: "orders.read orders.write notes.read notes.write finance.read tasks.write"` with no `redirect_uris`, no `client_name`, and no `nvOAuthRedirectAllowed` anywhere in the file. |

**What is wrong with them is the yardstick, not the content — and it does not weaken this verdict, it
strengthens it.** `f753a8ca` is the merge base with `main`, and it was never deployed, so a change
measured against it says nothing about what a review connection is being served. Measured against the
tree that IS deployed (`015d5792`), the flags-off wire did not move by a byte: all three "added" tools
are numbers 17, 18 and 19 of the production listing, those six annotation values are what production
serves today (§3.1), the production listing already says "Starter" and contains no "Lite", and
`015d5792` already returns `redirect_uris` and `client_name` with the same six-scope default.

So §4 describes real branch history against a commit nobody shipped, and this document describes the
only comparison a submission decision turns on. Both statements can stand; what cannot stand is either
one using the bare phrase "the merge base", because on this branch it names two different commits
(§1).

And one claim is now **discharged**. §4 asks that the fixture be diffed against the live listing once
before the flip, because `bc718e06` is a branch commit rather than the deployed tree:

> `functions/test/fixtures/mcp/tools-list-full.json` → `states.off.tools` **is byte-identical to the
> production listing.**

The fixture therefore does prove what it was hoped to prove. The caveat in its `note` is now satisfied
rather than outstanding.

## 6. Scope of this measurement

- `tools/list` and the §4 surfaces are compared. **Handler behaviour is not** — two listings being equal
  says nothing about what a tool does once called, and the scope gate, the PII layer and the dispatcher
  were not exercised here. This is a real limit, not a formality: the one flags-off behaviour change on
  this branch was in the PII layer, was invisible to every comparison in this document, and was found by
  driving `_nvMcpPiiAccessEntry` with the flags unset rather than by diffing a listing. A parity document
  that measures one surface must say so in its counts as well as in its scope note — hence the rename in
  §3.
- Everything is reconstructed from the deployed source. It is sound because the deployed tree is
  byte-identical to `015d5792`, but it is a source-level equality, not a live capture.
- Nothing was deployed, pushed, or called with credentials.
