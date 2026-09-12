# PR 3 — the `salesOrders` projection and its backfill: design only

**Design, not code. Nothing here is implemented, no backfill has been run, and no document has been written to production.** PR 3 is the first Sales PR that writes anything, which is why it is being designed on paper first.

## 1. Why a side document exists at all

The shipped iOS and Mac 1.3 (build 17, `ad79d3da`) replaces the **whole** order document on a paid plan — `setData(from:)`, not a merge. Anything the server adds to `siparisler/{orderId}` is erased the next time one of those clients saves that order, silently. Android 0.1.8 (`0563fc9c`) sends line items with no ids, so the server mints new UUIDs on every such save.

So the projection lives at `companies/{companyId}/salesOrders/{orderId}`, written only by the server, with `allow write: if false` in the rules from PR 1 and the collection in both company wildcard deny lists. The order document is untouched; the projection is derived and always rebuildable.

## 2. The date fields, by evidence

**`paymentDate` is the field the existing list sorts by. It is not the order's creation date, and PR 3 must not relabel it as one.** The code says so in both directions:

| Evidence | What it shows |
|---|---|
| `functions/index.js:10931`, `:15288` — `paymentDate: admin.firestore.Timestamp.fromDate(paymentDate)` | some paths store a date a person chose |
| `functions/index.js:19949`, `:21088`, `:21523` — `paymentDate: createdAt` | other paths seed it with the creation time, so the same field means different things by route |
| `functions/finance/engine.js:197-201` | the finance engine reads it as a *payment* date, for the VAT milestone |

So the honest name for what the projection stamps is **"the date this workspace's Orders list has always sorted this order by"** — neither "created" nor "paid". `orderDateMs` keeps Sales ordering identical to Orders, which is the only property that matters for the list; anything that needs a true creation time must read `createdAt` and handle its absence.

| Field | Type | Present (of 452, census 12 Sep 2026) | Notes |
|---|---|---|---|
| `paymentDate` | Firestore `Timestamp` | 448 (99.1 %) | meaning varies by path, per the table above |
| `createdAt` | Firestore `Timestamp` (`FieldValue.serverTimestamp()`, e.g. `functions/index.js:614`) | 66 | a real creation stamp where present |
| `createdAtMs` | plain `number` (`Date.now()`, e.g. `functions/index.js:11299`) | **12 — missing on 440 of 452 (97.35 %)** | unusable as a sort key; an index on it would sort almost nothing |

**Resolution order, with the source recorded beside the value:**

| `orderDateSource` | `orderDateMs` |
|---|---|
| `paymentDate` | `paymentDate.toMillis()` |
| `createdAt` | `createdAt.toMillis()` when `paymentDate` is absent |
| `createdAtMs` | the raw number when neither timestamp exists |
| `none` | **`0`** — sorts last, `needsAttention: true`, shown as review-required |

**An unknown date is never filled with today's date**, nor with the backfill's run time, nor with any other stand-in. A row whose date is unknown says so.

The four `salesOrders` indexes held in `faz1-pr1-2026-09-12.md` come back with this PR, because they index a field only this PR creates. **`functions/test/qa/sales-index-match.test.js` must be updated in the same commit** — it currently asserts that no `salesOrders` index exists, precisely so this cannot be forgotten.

## 3. One projection contract, two callers

The live trigger and the backfill **compute the projection with the same function**. Neither has a private path, and the contract is:

* it reads the order and the workspace's settings, and writes **one** document: `companies/{cid}/salesOrders/{orderId}`;
* it writes **nothing else**. No order document, no stock movement, no payment, no notification, no activation or retention event, no catalog record. The projection is derived data and emits no business event of its own;
* it never re-enters itself: the trigger listens on `siparisler/{orderId}` and writes to a different collection, so a projection write cannot fire the projection.

## 4. Idempotency, ordering and concurrency

Modelled on `stampOrderFinance`, whose loop protection is why it is safe (`functions/finance/stamp.js:76-107`).

1. **Field-by-field comparison.** `sameProjection(stored, computed)` over a fixed `PROJECTED` list. If nothing in it changed, **no write happens** — a no-op order save costs one read.
2. **The stamp is excluded from the comparison.** Including `projectedAtMs` would make every computed document differ from the stored one and the trigger would write for ever. This is the documented trap in the finance stamp.
3. **Monotonic source stamp.** Every projection carries `sourceUpdatedAtMs`, taken from the order's `updatedAt`. The write happens in a transaction that **refuses to apply a stamp older than the one already stored.** This is what makes the three dangerous cases safe:
   * a **late trigger event** arriving after a newer one cannot overwrite the newer projection;
   * a **backfill** running while somebody edits the order cannot write its older snapshot over the live trigger's newer result;
   * a **re-run** of an old backfill cannot resurrect anything, because its stamps are all older.
4. Upsert by order id. Replaying any event any number of times converges on the same document — no counter, no append, no array push anywhere in it.

## 5. The bin, permanent deletion and restore — three different things

Evidence: binning sets `isDeleted: true` with `deletedAt: serverTimestamp()` (`functions/index.js:9605-9606`, the same shape used when one order is merged into another); restoring sets `isDeleted: false` and `deletedAt: FieldValue.delete()` (`:15736-15737`); permanent purge is a separate sweep, 30 days after binning.

| Event | Projection |
|---|---|
| **Binned** | the side document is **kept and marked** `binned: true` with the same `sourceUpdatedAtMs` rule, and **excluded from the normal Sales list**. It is not deleted, so a later event cannot "recreate" it from nothing and a restore does not have to rebuild it |
| **Restored** | the trigger fires on the restore write and clears `binned`. The row returns to the list |
| **Permanently purged** | the side document is **deleted**, and a small tombstone keeps the order id with its last `sourceUpdatedAtMs`. Any later write carrying an older stamp — a late event, an old backfill page — is refused by rule 4.3 and the row cannot reappear |
| **Merged into another order** | the source order is binned by the same code path, so it follows the binned row above |

A binned order must never appear in the normal Sales list, and a deleted one must never come back. The tombstone exists for exactly the second half of that sentence.

## 6. The feature flag: off is not "delete everything"

* **The trigger projects only for workspaces explicitly enabled** in `appConfig/sales`. A workspace nobody opened gets no writes at all, which keeps the blast radius at zero until somebody decides otherwise.
* **Switching the feature off stops writing. It does not delete anything.** Existing projections are kept. Bulk-deleting a workspace's rows because a flag moved would turn a reversible switch into a destructive one, and the rows hold nothing that is not derivable anyway.
* **While off**, nothing reads them: `listSalesRows` already answers `enabled: false` before it reads a row.
* **On re-enable, the projections are stale by exactly the orders that changed while it was off**, and there is no way to know which without looking. So re-enabling is **not instant**: it requires a catch-up backfill pass before the list is trusted. That pass is cheap, because unchanged documents are skipped by rule 4.1, and safe, because older snapshots are refused by rule 4.3.

## 7. The backfill

An owner-run operation, never a deploy-time migration, never automatic.

1. **Dry run is the default**, and it returns counts only — would-create, would-update, unchanged, skipped-with-reason — and **no customer data of any kind**.
2. Paged with the same ordering the list uses, `(companyId, paymentDate, __name__)`, so a page cannot step over an order sharing a date with its neighbour.
3. **Two limits, both enforced:** a per-workspace ceiling and a global ceiling across all concurrent runs, so one large workspace cannot consume the project's write budget.
4. **Pause and resume.** The cursor and the run's state live in `companies/{cid}/salesSettings/main`; a paused run stops at a page boundary and resumes from the cursor. An interrupted run never restarts from the beginning, and a second invocation cannot double-process a page.
5. One workspace at a time, by explicit id. **There is no "all workspaces" mode.**
6. It writes only `salesOrders` documents, through the same contract as the live trigger (§3), so a backfilled row and a triggered row are identical and neither emits a second order, finance, activation or retention event.

## 8. `projectionVersion`

`projectionVersion` is part of the stored document and of `PROJECTED`, so an order written after a bump carries the new version — **on its own next write, one order at a time.**

**A version bump never starts a bulk rebuild.** Rebuilding every existing row is a separate, explicitly invoked operation with the same dry run, the same two limits and the same pause/resume as the backfill. Readers must therefore tolerate a mixed population of versions, which is the price of not having a deploy silently rewrite every row in the project.

## 9. Rollback

| Step | Way back |
|---|---|
| Trigger deployed | redeploy the previous version of the name. New orders stop being projected; existing rows go stale but are read by nothing while Sales is closed |
| Backfill run | nothing to unwind. Every row is derivable from its order, so the fix for a bad projection is a corrected rebuild, not a restore |
| Rows unwanted | a separate purge operation, per workspace, itself dry-runnable. Not part of the trigger, not automatic, and not triggered by the flag |
| Indexes | delete the composite indexes **by name**. Never by republishing an older `firestore.indexes.json`, which would drop indexes other features depend on |

**No point in this PR requires a data migration**, and no order, stock level, payment or notification is written at any point.

## 10. The cancelled-order observation, as at 12 September 2026

A read-only census that day found **13 cancelled orders still counted as active, across 4 workspaces**, and **no demo user was blocked by it** — two workspaces sat at or over the demo limit, and none was pushed over solely by cancellations.

This is a **dated observation, not a standing fact**: it moves with every new order, cancellation and plan change. It belongs to the **limit engine**, not to Sales. PR 3 changes no counter behaviour, and the projection's `countsAsActiveOrder` continues to state the intended rule beside today's counter without altering it.

## 11. Decisions still open — for a person

1. Does a purged order's **tombstone** expire, and after how long? Keeping them for ever is small but unbounded; expiring them reopens the resurrection window for an event older than the expiry.
2. Does the catch-up backfill on re-enable run **automatically when a workspace is opened**, or does opening a workspace simply refuse until somebody has run it?
3. The global backfill ceiling's actual number. 452 orders across 51 workspaces makes it theoretical today; it stops being theoretical at the first large import.
4. Who may bump `projectionVersion`, and does a bump require the rebuild to be scheduled before it is allowed?
