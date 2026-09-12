# Faz 1 release runbook — PR 1 and PR 2

**Nothing in this document has been carried out.** No branch was merged into the deploy branch, no function, rule or index was deployed, no Round was published, and `appConfig/sales` does not exist in production. This is the order somebody would follow when the decision is taken, and the way back from each step.

## What is being released

| | PR 1 — `sales-faz1-server` @ `71e41690` | PR 2 — `commerce-capability-truth` @ `4115eb53` |
|---|---|---|
| Server | `functions/sales/*` (5 files), wiring in `functions/index.js` | `functions/commerce/capabilities.js`, `health.js`, `getCommerceHealth` in `functions/index.js` |
| Rules | **yes** — three blocks + six deny entries | no |
| Indexes | **yes** — one index | no |
| Web | none | `CommerceSyncHealthCard.tsx`, `integrations.ts`, `language.ts` |
| Functions to deploy **by name** | `getSalesCapability`, `setSalesVisibility`, `listSalesRows` | `getCommerceHealth` |

Both tips are merged into the release candidate, which is where they are tested together.

## Order, and why this order

**PR 2 first, PR 1 second.** PR 2 is independent of Sales, its blast radius is one card, and it needs no rules and no index — so the cheaper change proves the deploy path before the one that carries a rules release.

### Step 0 — the pre-release checklist

1. Re-run the full set on the exact commit that will be merged: `npm run test:vectors`, `npm test`, the CI's own emulator line `firebase emulators:exec --only firestore,storage --project demo-nivadesk-ci "cd functions && npm run test:rules && bash test/run-e2e.sh"`, `npx tsc --noEmit`, `npm run build`.
2. Confirm GitHub CI is green on that commit **and that the `rules + e2e (Firestore emulator)` job actually ran**. The workflow is path-filtered; a skipped job is not a pass. `gh run view <id> --json jobs`.
3. **Re-verify the last live Round** against the publish repo on the day. No Round number is reserved in advance by this document — the number in a plan written days earlier is a guess, and publishing over a Round somebody else used is not recoverable by editing a file.
4. **`firestore.rules` and `firestore.indexes.json` are whole-file publishes.** Deploying either ships *everything* in that file, not only this PR's lines. Before publishing, diff the candidate's file against **what is actually live** — not against the deploy branch — and account for every difference:
   * `gcloud firestore indexes composite list --project=eggcraft-studio --format=json` for the indexes;
   * the Rules tab's deployed source, or `firebase firestore:rules:get` if available, for the rules.
   Any difference that did not come from PR 1 is a **non-candidate diff**: work from another branch that would ride along unannounced. Identify its owner and get it approved separately, or take it out before publishing. On 12 September 2026 the index side of this check was clean: production carries three composite indexes, the candidate declares those three plus the one this PR adds, and removes none.
5. Confirm `firebase` and `gcloud` credentials are alive. All three (gcloud, Firebase CLI, ADC) expire together, and a half-authenticated deploy is worse than none.

### Step 1 — PR 2, server and web, as one unit

PR 2 is **not complete until both halves are out.** The server half alone leaves the new card state unrendered; the web half alone renders a state the server never sends. Either order is technically safe — with an old function the response carries no `card` and the card falls back to its previous words; with an old bundle the server's extra field is ignored — but a stop in between is not a finished release. **Treat PR 2 as done only when the function is deployed and the Round is published.** If the window will not fit both, do not start it.

1. Merge `commerce-capability-truth` into the deploy branch.
2. Deploy **one name only**: `firebase deploy --only functions:getCommerceHealth`. A blind `--only functions` on this branch is not safe.
3. Publish the Round with only the three web files this PR touches, into the publish repo's **root**.
4. Verify in the live chunk, not the HTML, and decode the minifier's escapes before concluding anything is missing.
5. Look at one Etsy workspace's Sync health card: it must read **Not supported** with its sentence underneath, not an empty box. Use a workspace that is **not** EGGcraft, not the retention pilot, not the OpenAI review workspace.

Expected and not a fault: `capabilities.js` gains a field only `getCommerceHealth` reads, and a by-name deploy leaves every other function on the registry it was deployed with. Nothing else reads `healthInstrumented`, so this is a deliberate partial state, not drift.

### Step 2 — PR 1, server, index, rules

6. Merge `sales-faz1-server` into the deploy branch.
7. Deploy three names: `firebase deploy --only functions:getSalesCapability,functions:setSalesVisibility,functions:listSalesRows`. They are inert while no workspace is listed.
8. **Publish the index. It is part of this package, not an optional extra.** `firebase deploy --only firestore:indexes` adds `siparisler (companyId, assignedToUid, paymentDate)` and removes nothing. Then accept it by the three proofs in `assigned-index-live-verification.md`. The server's fallback — read the workspace page, filter on the server — is a safety net that keeps the answer correct; **it is not an accepted way to run the pilot**, and shipping without the index is a recorded exception, not the default.
   *This is a packaging decision. It is not permission to deploy the index; that decision is still open.*
9. Publish the rules: `firebase deploy --only firestore:rules`. Whole-file release, subject to step 0.4 and the usual rules review. The change itself is three blocks plus six deny entries.

### Step 3 — opening it, later and separately

10. Opening a workspace is one hand-written document, `appConfig/sales` → `{ enabled: true, workspaces: { "<companyId>": true } }`. No redeploy. **Not part of this release.** Closing it again is the same write reversed.

## Rollback, per step

| Step | Way back | Cost |
|---|---|---|
| Round | publish the previous Round | one publish; the card returns to its old words |
| `getCommerceHealth` | redeploy the name from the previous commit | one function, seconds |
| three Sales functions | redeploy the three names from the previous commit, **or simply leave them unopened** — with no flag document they answer "closed" and read nothing | none, if never opened |
| index | delete **that one composite index** by name, in the console or with `gcloud firestore indexes composite delete <name>`. The list keeps working on the fallback | extra reads for assigned-scope members only |
| rules | remove **the three blocks and six deny entries this PR added**, re-verify, and publish the corrected file | one rules release |

**Rules and indexes are shared, whole-file artefacts, and rolling either back by republishing an older copy of the file is forbidden.** An old `firestore.rules` silently reverts every rules change made by anyone since that copy was taken; an old `firestore.indexes.json` deploy can drop indexes other features depend on. Roll back by removing this PR's own lines from the current file and publishing that — the same review as a forward change — or by deleting the single index by name. Never by checking out yesterday's file.

**Nothing to migrate in either direction.** Neither PR writes an order, a side document, a stock movement, a payment or a notification, so there is no data state to unwind — which is exactly why the projection was kept out of Faz 1.

## Not covered here

* PR 3 (projection and backfill) — `pr3-projection-backfill-design.md`. It is the first PR that writes, and it needs its own runbook.
* PR 4 web tabs, PR 5 native entry, PR 6 stock hardening, PR 7 New Sale.
* Instrumenting Etsy and Amazon with `touchHealth` — a separate PR, and the reason their card says *Not supported* today.
