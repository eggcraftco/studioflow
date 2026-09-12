# Verification of the two Sales candidates (12 Sep 2026)

Read-only verification first, then two narrow fix commits, then one combined run. **Nothing was merged into the deploy branch, nothing was deployed, no rules or indexes were published, no flag document exists, and no workspace data was written.** The pilot allowlist is empty.

## 1. What was verified

| Branch | Commit | GitHub CI (`functions-tests`) | Local |
|---|---|---|---|
| `sales-faz1-server` | `10074573` | **success** (run 34658501164) | unit suites green |
| `sales-faz1-server` | `ef7585e2` (three added proofs) | **success** | `npm test` exit 0; `sales-rules` and `sales-query` under the Firestore emulator exit 0 |
| `commerce-capability-truth` | `a4d65900` | **failure** (run 34658764564) | — |
| `commerce-capability-truth` | `eaf90230` (the fix) | **success** | the exact CI command locally: exit 0, 338 checks |
| `sales-faz1-release-candidate` | `5206515f` (both merged) | **success** | `npm test` 1786 checks exit 0; rules + e2e 355 checks exit 0; web `tsc` exit 0; `next build` exit 0 |

**The contradiction the operator flagged was real.** My "1748 checks passed" came from `npm test`, which runs only the unit suites. CI additionally runs `npm run test:rules` and `test/run-e2e.sh` against the emulators, and that job failed on `a4d65900`. PR 2 was not ready, and is not counted as ready until `eaf90230`, which CI has now passed.

## 2. PR 1 report

### 2.1 Orders without `paymentDate`

A read-only census over every order document in production (counts only; no customer data left the script):

| | |
|---|---|
| Orders in total | 452, across 51 workspaces |
| Missing `paymentDate` | **4 (0.88 %)** |
| …of those, how many belong to a workspace | **0.** All four also lack `companyId`, `createdAt` and `status`: they are empty documents attached to no workspace |
| Orders that do belong to a workspace and lack `paymentDate` | **0** |

So the Sales list, which filters by `companyId` and orders by `paymentDate`, hides no real order today. The four empty documents are invisible to every workspace query, including the Orders screen, and were not touched.

**A second finding from the same census: `createdAtMs` is missing on 440 of 452 orders (97.35 %).** The row therefore reports `createdAtMs: 0` for almost every order, and the prepared `salesOrders` indexes must not be built on that field alone. The projection PR has to derive its own timestamp from `paymentDate` or `createdAt`. Recorded, not fixed here.

### 2.2 Cancelled orders and the active-order counter

| | |
|---|---|
| Active by today's rule (not deleted, not delivered) | 412 |
| …of which cancelled | **13 (3.2 %)** |
| Cancelled in total | 14 |

Today's `countActiveOrders` counts a cancelled order as active. The direction for Sales says a cancelled sale should not hold a slot. On the demo plan, whose limit is ten active orders, thirteen orders is the difference between a workspace being blocked and not. The limit engine is untouched in this PR; `salesCountsAsActiveOrder` states the intended rule and its test pins the difference beside today's counter.

### 2.3 Sales permissions against Orders and Inventory

| Area | Workflow-only member | Assigned-only custom member | Where |
|---|---|---|---|
| Orders | a finance-free view of their own assigned orders | the full order document, for their own orders | `firestore.rules` `siparisler` and `workflowOrders` |
| Inventory | reads every item, including cost | reads every item | `firestore.rules` `inventoryItems`: `canReadCompany` alone |
| **Sales (this PR)** | refused | refused | rules blocks plus the callable's own check |

Sales is consistent with Orders on money and stricter on scope. The blanket refusal for assigned-only members is a deliberate Faz 1 limitation, not a rule about what they may see: a later PR should give them the same filtered view Orders gives them. Inventory being readable by everyone, cost included, is a pre-existing finding from Faz 0 and is untouched here.

### 2.4 The shipped iOS/Mac 1.3 rewriting a whole order

No Sales field is added to the order document, so there is nothing on `siparisler` for that client to erase. The side documents live under `companies/{cid}/salesOrders`, `salesProducts` and `salesSettings`, which a write to `siparisler/{id}` cannot reach. What the rewrite does affect is the link between a sale line and an order line, and `functions/sales/links.js` defines exactly that. The new test rewrites the order the way 1.3 does — every line id reminted, one price edited — and asserts the outcome: the surviving line becomes a **proposal**, the edited one **missing**, neither may move stock, and each state carries the reason a person reads.

### 2.5 Old or mismatched links stay visible and inert

Six states, and only `linked` returns `allowsStockAction: true`. A reminted id with one look-alike is `suggested`, with several `ambiguous`, with none `missing`; an edited line is `changed`; a trashed order is `orphaned`. Array order is never the key, and a name or a SKU never matches on its own. Nine checks cover it.

### 2.6 Paging after filtering

Two emulator checks, against real Firestore rather than the fake one: two WooCommerce orders placed far apart in the list are both reached, one page at a time, with no repeat; and a filter that matches nothing on a page still hands back a cursor, so a client does not stop early. The cursor is the last order the page examined, never the end of the scan window. `hasMore` is true when the page stopped early or the scan window filled; `nextCursor` is null only at the end.

### 2.7 Client writes to the new collections

The rules test proves an owner cannot create a sale row, a member cannot invent a product, a member cannot flip the preference and an admin cannot delete a row, while members can read and a **control** shows the company wildcard still admits an ordinary subcollection — so the refusals come from the new blocks and the deny entries, not from a blanket lock. On the server side, the only code in the repository that writes any of the three collections is `setSalesVisibility`, and the callable test proves a member is refused there while an owner is not.

### 2.8 Side effects of `listSalesRows`

The emulator test lists every root collection before and after the call and requires the list to be identical, re-reads an order and requires its `updateTime` to be unchanged, and requires zero documents in `salesOrders`, `salesProducts`, `salesSettings`, `inventoryItems`, `inventoryMovements`, `notifications`, `retention`, `retentionMessages`, `feedbackState`, `deviceTokens`, `commerceEvents`, `commerceHealth`, `feedback`, `supportTickets` and `retentionLog`. No stock, payment, notification, activation or retention record is produced.

## 3. Problems found and fixed

1. **PR 2 failed real CI.** An e2e test pinned the older meaning of "supported" in Sync Health: Shopify stock read "never synced" because Shopify's API can read stock. The capability correction makes "supported" mean what this codebase syncs, so that entity is unsupported. Fixed in `eaf90230` by updating the assertion with its reason, keeping the neighbouring pins, and adding two that name Square's payouts as the one money feed. The orchestrator already used the same rule (`test/qa/orchestrator-envelope.test.js`).
2. **Two paging defects in PR 1**, both found by the emulator test and fixed before the first push: a cursor carrying more values than the query ordered by, which Firestore refuses outright, and a cursor taken from the end of the scan window, which skipped every order between the last row of a page and that end.
3. **A weak test of my own**: the first capability test re-read the registry instead of calling Sync Health. It now calls `health.supportedEntities` and pins the regression directly.

## 4. Still-open risks

1. `createdAtMs` is absent on 97 % of orders; the projection must not order by it (§2.1).
2. Etsy and Amazon never record sync health at all, so their rows show "never" even though Etsy orders do sync. That is a health-recording gap in those connectors, pre-existing and untouched.
3. Assigned-only members are refused Sales entirely (§2.3).
4. Classification stays `needs_review` for everything except a repair intake until product links exist.
5. The demo-quota difference: thirteen cancelled orders are counted active today (§2.2). The limit engine is unchanged.
6. Four empty order documents with no workspace exist in production; nothing reads them, and they were not touched.
7. `getSalesCapability` performs three reads per call; clients must cache it for ten minutes, as the feedback prompt is cached.

## 5. Deploy scope and rollback

Nothing below has been done.

| PR | Deploy scope | Rollback |
|---|---|---|
| PR 1, Sales server half | Merge, then deploy by name `getSalesCapability`, `setSalesVisibility`, `listSalesRows`; publish `firestore.rules` (three blocks plus six deny entries). The four prepared indexes may wait — the Faz 1 read uses the existing `(companyId, paymentDate)` index | Revert the merge; the three functions are inert while no workspace is listed, so they may also simply be left unopened. Rules revert with the file. Nothing to migrate |
| PR 2, capability correction | Merge, then deploy by name `getCommerceCapabilities` and `getCommerceHealth`; a web Round carrying `lib/studioflow/integrations.ts` | Revert the commit and redeploy the two names; revert the Round. No data changes either way |
| Opening a workspace | A single write to `appConfig/sales` after the deploy | The same write reversed. No redeploy |

The live pilot workspace is still unchosen, so the allowlist stays empty. Faz 2 stays closed behind `docs/sales/stock-hardening-plan.md`. PR 3 projection and backfill, PR 4 web tabs, PR 5 native entry, PR 6 stock hardening and PR 7 New sale remain separate pieces of work.
