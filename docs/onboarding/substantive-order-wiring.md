# Shell order → substantive first order: wiring `SUBSTANTIVE_ORDER` v2.1 as the one source of truth

Status: **design + isolated module, 9 September 2026.** Branch `onboarding-retention`. Nothing here is wired:
`functions/index.js`, `lifecycle/derive.js`, `lifecycle/checklist.js` and the clients are untouched, by
instruction, until the Stripe billing hotfix closes. What this branch adds is the predicate as one pure
module with its tests (§2), and this document, which says where the two readers plug into it and what
each client shows.

## 1. The problem, in the numbers we already have

Every order NivaDesk creates is a complete-looking document before anybody types: a placeholder customer
("New Project" in twelve languages), a status, a delivery window, tax and finance stamps. Anything that
counts documents sees an order. Two readers do:

| Reader | Today | Effect |
|---|---|---|
| `getSetupChecklist` (`functions/index.js:29544`) | `mark("order_created", !anyOrder.empty)` — a `limit(1)` existence probe | the dashboard ticks **"Create your first project"** the moment a shell exists; the person who opened a form and left is told the step is done |
| `lifecycle/derive.js:125-133` | every non-shop order pushes `order_created` | 33 abandoned shells in 11 workspaces counted as activation; v1 said 24 workspaces activated, the v2.1 baseline says **11** (`activation-definition-v2.md` §A.9) |

The two are already different implementations of the same rule and had drifted
(`activation-definition-v2.md` §2). Under the v2.1 baseline the "activated then went quiet" cohort turned
out not to exist: those workspaces created a shell and stopped
(`current-user-recovery-cohort-2026-09-08.md`). So the product problem is not re-engagement; it is that
the first order never became real, and nothing in the product says so or points back at it.

## 2. The single source of truth — done, on this branch

`functions/lifecycle/substantiveOrder.js`, pure (no Firestore, no clock), exporting:

| Export | What it answers |
|---|---|
| `isSubstantiveOrder(o)` | `SUBSTANTIVE_ORDER` v2.1 exactly as §A.6 states it: money · named customer (26-entry closed placeholder set) · line items · fulfilment · contact channel · payment recorded; any one holds; a deleted document holds none |
| `substantiveClauses(o)` | which clauses hold — so a checklist can say *why* a shell is still a shell without a second copy of the rule |
| `isShellOrder(o)` | live and not substantive: the state the checklist has to name |
| `firstOrderProgress(orders)` | `{state:"none"}` · `{state:"shell", shellId, shellCount}` · `{state:"substantive", orderId}` — `shellId` is the newest shell, the one the person was last looking at |
| `PLACEHOLDER_NAMES` | the 26 names no person typed (§A.3.2), lower-cased and trimmed |

`functions/test/qa/lifecycle-substantive-order.test.js` pins it: the empty document as each of the
four creation paths writes it holds no clause; each clause fires on exactly the field it names; the
rejected signals (`status`, `historyLog`, `notes`, `customFields`, `clientFiles`, `designName`,
`deliveryTime`, `taxRate`, `finance.*`) do not count; a deleted order is evidence of nothing; and — the
guard §A.10 asked for — the `New Project` / `New Order` rows of **all four translation tables**
(`DilMotoru.swift`, `StudioTranslations.kt`, `language.ts`, `macTranslations.ts`) are read and every
value must be in the set, the Swift row must cover every language in `studioSupportedLanguages`, and the
guard is shown not to be vacuous (removing Android's `新建项目` from the set names exactly that value).
Adding a thirteenth language fails this test before it can widen activation.

What the module deliberately does **not** do: no `designName` clause, no `projectNumber` clause, no
localised-placeholder heuristics beyond the closed set, no money requirement — a workflow-only member
cannot write money at all (`index.js:15058`, `15939`, `24036`), so a money-only test would deny
activation to any workspace whose work is done by that role. The disjunction is the design.

## 3. Wiring plan — where the two readers import it (when wiring is allowed)

### 3.1 The funnel: `lifecycle/derive.js:125-133`

```js
const { isSubstantiveOrder } = require("./substantiveOrder");
for (const order of list(snapshot.orders)) {
  …
  if (!isSubstantiveOrder(order)) continue;          // a shell is not an event
  if (fromShop) push("external_order_imported", createdAt, id);
  else push("order_created", createdAt, id);
  …
}
```

One line. `external_order_imported` takes the same test on purpose: §3.1's commerce predicate is
"provider-stamped **and** substantive", and an importer that writes an empty envelope should not activate
a workspace either (today none does — every imported order carries money — but the rule is the rule).
`order_delivered` stays as it is: a delivered order is substantive by clause 4 anyway.

**No new event.** The shell state is not an activation event and must not become one: `events.js` stays
untouched, `activationWeight` tables stay untouched, and the funnel's "activated" count moves exactly to
the v2.1 baseline (24 → 11) that the operator accepted on 9 September. The tests that pin it:
`lifecycle-derive.test.js` gains "a shell order derives no order_created" and "a shop-imported shell
derives no external_order_imported"; `lifecycle-activation.test.js` is unchanged because activation
never knew what an order looked like.

### 3.2 The checklist server: `getSetupChecklist` (`functions/index.js:29516-29563`)

Replace the one `limit(1)` order probe with a **bounded read of the newest orders** and hand the pure
module the answer:

```js
const recentOrders = await db.collection("siparisler")
  .where("companyId", "==", companyId)
  .orderBy("createdAt", "desc").limit(50).get()
  .catch(() => db.collection("siparisler").where("companyId", "==", companyId).limit(50).get());
const firstOrder = substantiveOrder.firstOrderProgress(recentOrders.docs.map((d) => ({ id: d.id, ...d.data() })));
mark("order_created", firstOrder.state === "substantive");
…
const checklist = lifecycle.setupChecklist({ profile: settings, events, firstOrder });
```

- **Why bounded, and why 50.** The function's own comment rules out reading a workspace's whole order
  book on every dashboard load. Fifty is the newest page: for the population this step exists for — a
  workspace with a handful of shells — it is the whole book; for a workspace with a real order buried
  under more than fifty later shells it would misreport "complete your first project" for a step that
  is done, which is the one direction of error a checklist can afford (it asks for work already done,
  never credits work not done). If that edge case is ever observed, the fix is a stamp written by the
  existing order-write paths (`createWebOrder`/`updateWebOrder`/`createSwiftOrder`/`nvChatGPTCreateOrder`)
  the first time the predicate holds — not a trigger, and not a composite index: the `.catch` fallback
  above exists because a missing composite index fails as "no orders", the shape of wrongness that tells
  somebody to do a thing they have already done.
- **`companyId ==` + `orderBy createdAt`** needs a composite index; the fallback drops the ordering
  (then "newest" is list order and `shellId` is best-effort). Add the index to `firestore.indexes.json`
  in the same change so the fallback is not the steady state.

### 3.3 The checklist model: `lifecycle/checklist.js`

`setupChecklist(input)` gains `input.firstOrder` (optional; absent means today's behaviour). Only the
`order_created` step reads it, and only when the step is not done:

| `firstOrder.state` | title | detail | action | target |
|---|---|---|---|---|
| `none` / absent | Create your first project *(today's copy)* | One real job, so the board has something to hold. | `new_order` | — |
| `shell` | **Complete your first project** | You started one — add the customer, what it is worth or what it contains, and it counts. | `open_order` | `{ orderId: shellId }` |
| `substantive` | *(step is done; copy irrelevant)* | | | |

The step keeps `key: "order_created"` so `doneCount`, `complete` and the activation table are
untouched; only the words and the destination change. `target` is a new optional field on a step;
every existing step has none. `lifecycle-checklist.test.js` gains three cases (none / shell / substantive)
and `checklist-translations.test.js` gets the new title and detail in all twelve languages — this is copy
in the four translation tables, not a placeholder, so the §A.10 guard is unaffected.

### 3.4 The clients: `open_order` with a target, or nothing actionable

The rule the last gate established stands: **an actionable card always has a valid target, or it is not
rendered as actionable.**

| Client | Change |
|---|---|
| Web `lib/studioflow/setupChecklist.ts` | `setupStepHref(action, target)`: `open_order` + `target.orderId` → `/orders?orderId=<id>` (the orders page already reads `orderId` from the query, `app/orders/page.tsx:177`); `open_order` with no id → `""`, so the step stays a statement. `dashboard/page.tsx:151` and `HomeCardBodies.tsx:2211` pass `step.target`. `dashboard-checklist.test.js` gains the two cases |
| Android `setupStepDestination` (`HomeCardBodies.kt:507`) | `"open_order"` → Orders, opening the order when a `target.orderId` is present; otherwise the Orders list |
| Apple `HomeView.swift:90`, `HomeCardBodies.swift:328` | same mapping; label "Open project" |

No new screen, no new card: the same card, one different line and one different destination.

### 3.5 What is explicitly out

- No nudge, no e-mail, no push, no win-back — the continuation lives on the card the person already sees.
- No new analytics and no PII: the target is an order id in the workspace that owns it.
- No `designName` or `projectNumber` signal anywhere in the chain, and no requirement to enter money.
- No change to `events.js`, no new activation weight, no change to `activation.js`.

## 4. Order of work, when the freeze lifts

1. Land §3.1 and §3.3 (pure modules) with their tests — no deploy needed to merge.
2. Land §3.2 with the index; deploy **`getSetupChecklist` by name** (and `getActivationFunnel`, which
   picks up §3.1 through `derive.js`), from a clean main checkout, never `--only functions`.
3. Web §3.4 in the next web round; native §3.4 with the next store release lines.
4. Verify on the emulator before deploying: a workspace with one shell shows "Complete your first project"
   linking to that order; adding a customer name flips the step to done on the next load; the seed
   workspace (real orders) is unchanged.

## 5. What the operator can expect to see

Under the v2.1 baseline (`cohort-rerun-2026-09-08.md`): 11 activated workspaces are unchanged; the
workspaces whose only orders are shells — the eleven with 33 dead orders among them — stop showing a
ticked first step and start showing the way back to the order they abandoned. The funnel's activated
count reads 11 instead of 24, which is the number the operator already accepted as the baseline; the
checklist and the funnel then disagree about nothing, because they read one function.

## 6. Wired — 10 September 2026 (night), on this branch

The freeze lifted with the Stripe fix live and carried, so §3 was executed as written, with one
deviation the data forced.

| Step | Done | Where |
|---|---|---|
| §3.1 the funnel | `derive.js` skips an order that is not substantive before it can push `order_created` / `external_order_imported`; `order_delivered` untouched | `functions/lifecycle/derive.js`; `lifecycle-derive.test.js` "a shell order derives no order_created…", "a shop-imported shell derives no external_order_imported either" (the file's earlier order fixtures were shells by v2.1 and now carry `orderValue`) |
| §3.2 the checklist server | `getSetupChecklist` reads the newest fifty orders, hands them to `firstOrderProgress`, ticks `order_created` only for `state: "substantive"`, passes `firstOrder` to the model; fallback to the unordered `limit(50)` read if the index is missing | `functions/index.js` `getSetupChecklist` |
| §3.3 the model | `setupChecklist({ …, firstOrder })`: for `order_created`, not done, `state: "shell"` with a `shellId` → "Complete your first project" / `open_order` / `target: { orderId }`; same key, same `doneCount` | `functions/lifecycle/checklist.js` (`SETUP_SHELL_COPY` exported); `lifecycle-checklist.test.js` three cases (shell / none-or-absent / substantive); `checklist-translations.test.js` walks the two new strings — added to `language.ts` in all eleven languages |
| §3.4 web | `setupStepHref(action, target)`: `open_order` + id → `/orders?orderId=<id>`, no id → `""`; the dashboard card and the Home card pass `step.target`; the response mapper keeps `target.orderId` | `studioflow-web/lib/studioflow/setupChecklist.ts`, `app/dashboard/page.tsx`, `components/home/HomeCardBodies.tsx`; `dashboard-checklist.test.js` "the way back to a shell order carries the order id…" |
| §3.4 native | `open_order` → the Orders list on Android (`setupStepDestination`) and Apple (`homeSetupDestination`), so the step is never a dead row; opening the exact order (the `target`) is left for the store lines, with the models | `HomeCardBodies.kt`, `HomeView.swift` |
| index | `siparisler (companyId ASC, paymentDate DESC)` added to `firestore.indexes.json` and created in production with `gcloud firestore indexes composite create` (operation started 02:14 UTC) | |

**Deviation: the bounded read orders by `paymentDate`, not `createdAt`.** A read-only census of 450
production orders across 51 workspaces on 10 September: `paymentDate` on 446, `createdAt` on 65,
`createdAtMs` on 12, neither creation stamp on 373. Firestore's `orderBy` drops documents without the
field, so `orderBy("createdAt")` would have read only 65 of 450 and told most workspaces they have no
first project — the direction of error the checklist can afford only in the rare case, not as the rule.
`paymentDate` is the order date every creation path writes (`nvOrderDefaults` stamps it from the input
or `now`). The four in 450 without it fall to the fallback read's list order.

**Scope kept out, on purpose (§3.5 and the night's authorization):** no new event, no activation weight,
no message trigger, no backfill. The deploy that follows is `getSetupChecklist` by name only; the funnel
(`getActivationFunnel`) keeps its 1.x derivation in production until the v2.1 dry-run comparison and
rollout package are accepted — see `docs/onboarding/activation-v2.1-rollout-2026-09-10.md`.
