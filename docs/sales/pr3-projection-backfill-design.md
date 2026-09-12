# PR 3 — the `salesOrders` projection and its backfill: design only

**Design, not code. Nothing here is implemented, nothing has been deployed, and no document has been written to production.** PR 3 is the first Sales PR that writes anything, which is why it is being designed on paper before it is built.

## 1. Why a side document exists at all

The shipped iOS and Mac 1.3 (build 17, `ad79d3da`) replaces the **whole** order document on a paid plan — `setData(from:)`, not a merge. Anything the server adds to `siparisler/{orderId}` is therefore erased the next time one of those clients saves that order, silently and without conflict. Android 0.1.8 (`0563fc9c`) sends line items with no ids, so the server mints new UUIDs for them on every such save.

So the projection cannot live on the order. It lives at:

```
companies/{companyId}/salesOrders/{orderId}
```

written only by the server, never readable-writable by a client (the rules block from PR 1 already says `allow write: if false`, and the collection is in both company wildcard deny lists). The order document stays exactly as it is; the projection is derived from it and is always rebuildable.

## 2. The date the projection stamps, and where it comes from

From the production census of 452 orders (read-only, counts only):

| Field | Orders carrying it |
|---|---|
| `paymentDate` | 448 (99.1 %) |
| `createdAt` | 66 |
| `createdAtMs` | **12 (2.65 %)** |

`createdAtMs` is unusable as a sort key — it is absent on 97 % of orders, so an index on it would sort almost nothing. The projection therefore stamps **its own** `orderDateMs`, resolved in this order, with the source recorded beside it:

| `orderDateSource` | Value |
|---|---|
| `paymentDate` | `paymentDate.toMillis()` |
| `createdAt` | `createdAt.toMillis()`, when `paymentDate` is absent |
| `createdAtMs` | the raw number, when neither timestamp exists |
| `none` | `orderDateMs: 0` — the row sorts last and is marked for review; it is never guessed at and never silently dropped |

This is the one field the later Sales queries sort by, and it is why the four `salesOrders` indexes belong to this PR and not to PR 1: they index a field only this PR creates. They are held verbatim in `docs/sales/faz1-pr1-2026-09-12.md` under "PR 3". **When they come back, `functions/test/qa/sales-index-match.test.js` must be updated in the same commit** — it currently asserts that no `salesOrders` index exists, precisely so this cannot be forgotten.

## 3. Idempotency

Modelled on `stampOrderFinance`, which solved the same problem and whose loop protection is the reason it is safe (`functions/finance/stamp.js:76-107`).

* A trigger on `onDocumentWritten("siparisler/{orderId}")` computes the projection and compares it field by field with what is already stored — `sameProjection(stored, computed)` over a fixed `PROJECTED` list, the shape `sameFinance` already uses.
* **`projectedAtMs` is excluded from the comparison.** Including the stamp would make every computed document differ from the stored one, and the trigger would write on every pass for ever — the exact trap the finance stamp documents.
* If nothing in `PROJECTED` changed, **the trigger returns without writing.** A no-op order save costs one read and no write.
* `projectionVersion` is inside `PROJECTED`. Bumping it forces exactly one rewrite per order and then settles.
* The trigger **never writes to the order document.** Not only would that loop; a 1.3 client would erase it anyway.
* The document id is the order id, so the projection is a pure upsert. Replaying the same event any number of times converges on the same document — there is no counter, no append, no array push anywhere in it.

## 4. What the projection does with old and broken orders

| Case | Count today | Behaviour |
|---|---|---|
| No `companyId` | 4 (all four also lack `createdAt` and `status` — empty documents attached to no workspace) | **skip, write nothing.** There is no workspace to write under. They are invisible to every workspace query already |
| No date field at all | 0 today | `orderDateMs: 0`, `orderDateSource: "none"`, `needsAttention: true`. Shown as review-required, never hidden |
| Line items with no ids (Android 0.1.8) | unknown | link state `needs_review`. The projection records what it cannot match; it never matches by array position, name or SKU alone, and it **never moves stock** |
| Whole-document rewrite by a 1.3 client | ongoing | the write fires the trigger, the projection is recomputed from the new document. The side document is the durable home; the order is the source of truth |
| `isDeleted` / trashed | — | the side document is deleted, not left behind. A ghost row in Sales for an order the merchant has binned is worse than no row |
| Cancelled | 13 across 4 workspaces | projected normally, flagged cancelled. Sales must not change the active-order counter, which stays the billing engine's business |

## 5. The backfill

An owner-run callable, never a deploy-time migration, never automatic.

1. **Dry run first, and dry run is the default.** It returns counts only — would-create, would-update, unchanged, skipped-with-reason — and **no customer data of any kind**, not even to check whether a field looks like a placeholder.
2. Paged with the same ordering the list uses, `(companyId, paymentDate, __name__)`, so a page can never step over an order sharing a date with its neighbour.
3. The cursor is persisted in `companies/{cid}/salesSettings/main` so an interrupted run resumes instead of restarting, and a second invocation cannot double-process a page.
4. Bounded per invocation, and it writes only where `sameProjection` says the stored document differs — a re-run over already-projected orders writes nothing.
5. One workspace at a time, by explicit id. There is no "all workspaces" mode.
6. It writes nothing but `salesOrders` documents: no stock movement, no payment, no notification, no activation or retention event, no catalog record, no touch of the order itself.

## 6. Rollback

Easier than most, because the projection holds no information that does not exist elsewhere:

| Step | Way back |
|---|---|
| Trigger deployed | redeploy the previous version of the name. New orders stop being projected; existing documents are stale but harmless — nothing reads them unless Sales is open for that workspace |
| Backfill run | there is nothing to unwind. Every document is derivable from its order, so the fix for a bad projection is a corrected rebuild, not a restore |
| Documents unwanted | a separate purge callable, per workspace, itself dry-runnable. Not part of the trigger and not automatic |
| Indexes | delete the composite indexes; no query outside Sales uses them |

**No point in this PR requires a data migration**, and no order, stock level, payment or notification is written at any point. That is the property to preserve when it is built.

## 7. Decisions still open — for a person, not for me

1. **Does the trigger project for every workspace, or only for workspaces where Sales is open?** Recommended: **only where the flag is on**, with the backfill run as part of opening a workspace. It keeps writes at exactly zero until somebody decides to open one, which matches how the rest of Faz 1 was built. The cost is that opening a workspace is no longer instant — it needs a backfill pass first.
2. **Does a projected row survive its order being deleted for audit?** Recommended: no. Deleting keeps Sales honest with the Orders screen.
3. **Does the backfill get a per-workspace rate limit, or a global one?** 452 orders across 51 workspaces makes this theoretical today; it stops being theoretical at the first large import.
4. **`projectionVersion` bump policy** — who may bump it, and does a bump trigger a rebuild automatically or wait for an owner-run backfill? Recommended: never automatic.
