# Accepting the assigned-scope index in production

**Procedure only. Nothing here has been run against production except the read-only listing in §2, run on 12 September 2026 and quoted below. The live acceptance in §3 must not be run yet: it needs an open pilot workspace, and no pilot workspace has been chosen.**

The Faz 1 list runs one of two queries. A normal member gets

```
siparisler · where companyId == · orderBy paymentDate desc · orderBy __name__ desc
```

and an assigned-only member gets the same with `where assignedToUid ==` added. The first is served by an index that is already live. The second is what this procedure accepts.

## 1. Three proofs, and all three are required

The index is accepted only when **all three** hold at the same time. Any one of them alone is worthless, and the reasons are specific:

| # | Proof | Why it is not optional |
|---|---|---|
| **A** | the **real query's** collection, filters and sort fields match the declared index **field for field** | an index that looks close serves nothing. A wrong direction on one field is a miss, and the miss is silent until production |
| **B** | the index is **`READY`**, read from the API by machine, not from a console screenshot | `CREATING` is not ready, and a query against a building index behaves exactly like a query against a missing one |
| **C** | an authorised assigned-scope request actually **runs the indexed path** — `queryPath: "assigned_indexed"` | the two paths return **identical rows**, so a list that came back proves nothing at all |

Two things that are explicitly **not** accepted as evidence:

* **"The list returned rows."** The fallback returns the same rows. This is the trap the whole procedure exists to avoid.
* **"There was no warning in the log."** A silent log proves only that nothing spoke. A deploy that never happened, a filtered log view, a call that was never made and a working index all look identical from there.

And one more: **the emulator is not evidence about the live index.** Measured on 12 September 2026 — an undeclared composite query succeeds in the Firestore emulator, so the emulator does not enforce indexes at all. `sales-query.test.mjs` proves the query's *behaviour* (ordering, cursor arity, paging over shared dates, filtered paging, assigned scope). It can never prove that production has an index.

## 2. Proof A and B — before and after the deploy

Read-only, safe to run at any time:

```bash
gcloud firestore indexes composite list --project=eggcraft-studio --format=json
```

**Measured 12 September 2026:** three composite indexes exist in the project. The only `siparisler` one is

```
siparisler  READY  [companyId ASC, paymentDate DESC, __name__ DESC]
```

No index carries `assignedToUid`. `firestore.indexes.json` on the candidate declares four, so the file differs from production by exactly the one index this PR adds — nothing is being removed.

**Proof A, mechanically.** The query's own shape is not retyped here. `functions/test/qa/sales-index-match.test.js` runs the real `defaultListOrdersPage` against a recording client and compares what it asks Firestore for with `firestore.indexes.json`. Run it, then check the live listing against the same shape:

```
siparisler  READY  [companyId ASC, assignedToUid ASC, paymentDate DESC, __name__ DESC]
```

Three details in that line decide whether it serves the query, and all three are visible:

* **the equality fields come first**, `companyId` then `assignedToUid`;
* **`paymentDate` is DESCENDING** — ASCENDING serves nothing here;
* **`__name__` is DESCENDING**, following the last field. The query orders the document id explicitly and in that direction; a `__name__ ASC` tail leaves the query unserved however right the rest looks.

**Proof B** is the `"state": "READY"` in that same machine-read JSON. Do not proceed while it says `CREATING`.

## 3. Proof C — the live acceptance

`listSalesRows` names the query that served each answer. The field is `queryPath`:

| Value | Meaning |
|---|---|
| `workspace` | a member who sees the whole workspace; neither assigned path ran |
| `assigned_indexed` | **the pass** — the composite query served the request |
| `assigned_fallback` | the index was missing or unusable; the server read the workspace page and filtered |
| `none` | the workspace is closed, so no query ran |

The acceptance is: **an authorised assigned-only member calls `listSalesRows` for an open workspace and the answer carries `queryPath: "assigned_indexed"`.** A single `assigned_fallback` fails the acceptance, whatever §2 said.

Two controls that must accompany it, so a pass cannot be an accident:

1. a member who is **not** assigned-only must return `queryPath: "workspace"` — if they report an assigned path, something other than the index is wrong;
2. the same assigned-only member must return rows that match what the Orders screen shows them. The point of the index is to make the scope cheaper, never to change it.

**This cannot be run yet.** It needs the workspace to be open in `appConfig/sales`, which is a separate decision and is not part of the index release. Do **not** write the flag document to create an opportunity to test. Until a pilot workspace exists, complete §2, record §3 as pending, and say so plainly rather than reporting a partial pass as an acceptance.

The workspace used for §3 must not be EGGcraft's real data, the retention pilot workspace, or the OpenAI review workspace.

## 4. If the index is not deployed

The fallback keeps the answer correct — the server still does the filtering, so no member ever receives an order outside their scope — but it reads rows it then discards. **It is a safety net, not a way to run the pilot.** The release package therefore includes the index (see the runbook); running the pilot on the fallback is not an accepted configuration, and if the index has to be left out, that is a deliberate, recorded exception rather than the default.
