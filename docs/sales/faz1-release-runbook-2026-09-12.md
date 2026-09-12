# Faz 1 release runbook — PR 1 and PR 2

**Written 12 September 2026. Nothing in this document has been carried out.** No branch was merged, no function, rule or index was deployed, no Round was published, and `appConfig/sales` does not exist in production. This is the order somebody would follow when the decision is taken, and the way back from each step.

## What is being released

| | PR 1 — `sales-faz1-server` @ `a8ffa6e9` | PR 2 — `commerce-capability-truth` @ `4115eb53` |
|---|---|---|
| Server | `functions/sales/*` (5 files), wiring in `functions/index.js` | `functions/commerce/capabilities.js`, `health.js`, `getCommerceHealth` in `functions/index.js` |
| Rules | **yes** — three blocks + six deny entries | no |
| Indexes | **yes** — one index | no |
| Web | none | `CommerceSyncHealthCard.tsx`, `integrations.ts`, `language.ts` |
| Functions to deploy **by name** | `getSalesCapability`, `setSalesVisibility`, `listSalesRows` | `getCommerceHealth` |

The two touch `functions/index.js` and `docs/nivadesk-current-handoff.md` in common. A dry merge computation (`git merge-tree`, which changes no branch) reports **no conflict** between `a8ffa6e9` and `4115eb53`.

## Order, and why this order

**PR 2 first, PR 1 second.** PR 2 is independent of Sales, its blast radius is one card, and it needs no rules and no index — so it proves the deploy path with the cheaper change. PR 1 carries the rules release, which is the only irreversible-feeling step of the two.

### Step 0 — before anything

1. Re-run the full set on the merge result: `npm test`, `npm run test:rules` + `test/run-e2e.sh` under the emulator, `npx tsc --noEmit`, `npm run build`.
2. Confirm GitHub CI is green on the exact commit that will be merged, and that the **rules + e2e job actually ran** — a path-filtered skip is not a pass. `gh run view <id> --json jobs`.
3. Confirm `firebase` and `gcloud` credentials are alive. All three (gcloud, Firebase CLI, ADC) expire together and a half-authenticated deploy is worse than none.

### Step 1 — PR 2 server

1. Merge `commerce-capability-truth` into the deploy branch.
2. Deploy **one name only**: `firebase deploy --only functions:getCommerceHealth`. A blind `--only functions` on this branch is not safe.
3. Verify: call `getCommerceHealth` for a workspace with a Woo or Square connection and confirm the response carries `card` with a `state`. Do this on a workspace that is **not** EGGcraft, not the retention pilot (`GuglEFKS…`), not the OpenAI review workspace.

Consequence to expect and not be alarmed by: `capabilities.js` gains a field that only `getCommerceHealth` reads, and only redeployed functions carry the new file. Every other function keeps the registry it was deployed with. Nothing else reads `healthInstrumented`, so this is a deliberate partial state, not drift.

### Step 2 — PR 2 web

4. Publish the next unused Round — **177** at the time of writing (`8bf514e` = Round 176 is live). Copy only the three web files this PR touches into the publish repo, at its root.
5. Verify in the live chunk, not the HTML, and decode the minifier's escapes before concluding anything is missing.
6. Look at one Etsy workspace's Sync health card: it must read **Not supported** with the sentence under it, not an empty box.

The web may go before the function without harm: with an old function the response carries no `card`, the card falls back to its previous words, and nothing breaks. The reverse is equally safe. They should still go the same night so no Etsy merchant sees the empty box in between.

### Step 3 — PR 1 server, rules, index

7. Merge `sales-faz1-server` into the deploy branch.
8. Deploy three names: `firebase deploy --only functions:getSalesCapability,functions:setSalesVisibility,functions:listSalesRows`. They are inert while no workspace is listed.
9. Publish the index: `firebase deploy --only firestore:indexes`. This **adds** `siparisler (companyId, assignedToUid, paymentDate)` and removes nothing — the file now declares exactly the three live indexes plus this one. Wait for state `READY` before step 11; see `assigned-index-live-verification.md`.
10. Publish the rules: `firebase deploy --only firestore:rules`. This is a whole-file release and needs the usual rules review. The change itself is three blocks plus six deny entries.

### Step 4 — opening it, later and separately

11. Opening a workspace is one hand-written document, `appConfig/sales` → `{ enabled: true, workspaces: { "<companyId>": true } }`. No redeploy. **Not part of this release.** Closing it again is the same write reversed.

## Rollback, per step

| Step | Way back | Cost |
|---|---|---|
| 4 · web Round | publish the previous Round | one publish; the card returns to its old words |
| 2 · `getCommerceHealth` | redeploy the name from the previous commit | one function, seconds |
| 8 · three Sales functions | redeploy the three names from the previous commit, **or simply leave them unopened** — with no flag document they answer "closed" and read nothing | none, if never opened |
| 9 · index | delete the composite index in the console or `gcloud firestore indexes composite delete`. Removing it does not break the list: the server falls back to reading the workspace page and filtering | extra reads for assigned-scope members only |
| 10 · rules | revert the file and redeploy it; it is a whole-file replace in both directions | one rules release |
| 11 · flag | delete the `appConfig/sales` document, or set the workspace entry to `false`. Cached for 60 s per instance | one write, one minute |

**Nothing to migrate in either direction.** Neither PR writes an order, a side document, a stock movement, a payment or a notification, so there is no data state to unwind — which is the whole reason the projection was kept out of Faz 1.

## What this runbook does not cover

* PR 3 (projection and backfill) — `pr3-projection-backfill-design.md`. It is the first PR that writes, and it needs its own runbook.
* PR 4 web tabs, PR 5 native entry, PR 6 stock hardening, PR 7 New Sale.
* Instrumenting Etsy and Amazon with `touchHealth` — a separate PR, and the reason their card says *Not supported* today.
