# Verifying the assigned-scope index in production

**Procedure only. Nothing here has been run against production except the read-only listing in step 1, which was run on 12 September 2026 and is quoted below.**

The Faz 1 list runs one of two queries. A normal member gets

```
siparisler · where companyId == · orderBy paymentDate desc · orderBy __name__ desc
```

and an assigned-only member gets the same with `where assignedToUid ==` added. The first is served by an index that is already live. The second is the one this procedure is about.

## 1. Before the deploy — what is live today

Read-only, safe to run at any time:

```bash
gcloud firestore indexes composite list --project=eggcraft-studio --format=json
```

Measured on 12 September 2026: **three** composite indexes exist in the project, and the only `siparisler` one is

```
siparisler  READY  [companyId ASC, paymentDate DESC, __name__ DESC]
```

No index carries `assignedToUid`. `firestore.indexes.json` on `sales-faz1-server` declares four, so the file differs from production by exactly the one index this PR adds — nothing is being removed.

## 2. Acceptance shape

After `firebase deploy --only firestore:indexes`, the same listing must gain exactly one entry, and it must read:

```
siparisler  READY  [companyId ASC, assignedToUid ASC, paymentDate DESC, __name__ DESC]
```

Three details decide whether it actually serves the query, and all three are visible in that line:

* **the equality fields come first**, in the order `companyId` then `assignedToUid`;
* **`paymentDate` is DESCENDING** — an ASCENDING one serves nothing here;
* **`__name__` is DESCENDING**, following the last field. The query orders the document id explicitly and in that direction; a `__name__ ASC` tail would leave the query unserved however right the rest looks.

`state` must be `READY`. `CREATING` is not ready, and on 452 orders it should pass quickly, but do not move on while it says `CREATING`.

## 3. After the deploy — did the fallback stop?

The server does not fail when the index is missing. `defaultListOrdersPage` catches the `FAILED_PRECONDITION` (code 9, or a message matching `/index/i`), reads the workspace page instead and filters by `assignedToUid` before answering. The answer is identical; the cost is not. So "the list works" proves nothing. These do:

1. **The log line.** The fallback writes exactly one warning:

   ```
   sales: assigned-scope index missing, filtering on the server instead
   ```

   In Cloud Logging, `resource.labels.function_name="listSalesRows"` with that text. **Zero occurrences after a call by an assigned-only member is the pass.** One occurrence means the index is absent, still building, or shaped differently from section 2.

2. **Read volume.** With the index, the query returns only that member's orders. Without it, Firestore reads the whole workspace page and the filtering happens in the function. The response cannot tell you which happened — `scanned` is counted after filtering in both paths — so the difference shows up only in the project's Firestore read metrics, not in the payload. Treat this as corroboration, never as the primary signal.

3. **A negative control.** A member who is *not* assigned-only takes the workspace query and must never produce the warning, index or no index. If they do, something other than the index is wrong.

## 4. When this can be checked end to end

Steps 1 and 2 can be done the moment the index is deployed. Step 3 needs a real call from an assigned-only member, which needs the workspace to be open in `appConfig/sales` — a separate decision that is **not** part of the index release. Until a workspace is opened, verify sections 1 and 2 and record that section 3 is pending; do not write the flag document to create an opportunity to test.

The workspace used for step 3 must not be EGGcraft's real data, the retention pilot workspace, or the OpenAI review workspace.

## 5. If the index cannot be deployed

Leaving it out is a supported state, not a broken one: the fallback keeps the answer correct and the server still does the filtering, so no member ever receives an order outside their scope. The cost is reading rows that are then discarded, for assigned-only members only. Today one workspace in the census has assigned orders, so the exposure is small. Deploy it to remove the waste, not to make the feature correct.
