# Activation Definition v2

**Status:** proposal, for per-domain approval
**Date:** 2026-09-08
**Supersedes:** the activation rules in `functions/lifecycle/activation.js` (`REQUIREMENTS`) and their two readers
**Evidence:** read-only pass over Firestore project `eggcraft-studio`, 63 live workspaces, 448 order documents, 278 customers, 1250 bank transactions, 12 inventory items, 11 inventory movements. Nothing was written. No code was changed by this document.

---

## 0. The one-paragraph version

v1's rule is, in practice, *an order document exists ⇒ activated*. That rule is wrong in a way we can now count: 33 orders belonging to 11 workspaces that v1 calls **activated** carry no money, no customer name, no design name, no tracking, and no dispatch — someone pressed New Order and closed the tab. v2 replaces the existence test with a **substance test** that all 33 of those orders fail, and re-labels each of the six activation domains honestly. The headline number: **v1 calls 24 of 63 workspaces activated; v2 calls 11.** Of those 11, one is the production fixture and one is the operator's own workspace, so the true external figure is **9**.

Two of v1's six domains were reported as unmeasurable. **They are not.** Both have live writers and are broken by a *reader* looking at the wrong field. That correction is the most valuable finding here, and it costs a field-path change rather than a telemetry project. Two other domains genuinely are unmeasurable, and this document declines to dress either of them in a proxy.

---

## 1. The empty-document problem

### 1.1 What a brand-new order already contains

`createWebOrder` (`functions/index.js:15029-15146`) is the single creation path for web *and* Android. It writes, unconditionally, before the user has typed anything:

`paymentMethod:"Card"` · `paymentDate: now` · `watchPurchasePrice:0` · `designLink:""` · `communication:[]` · `emailAddress/instagramUsername/whatsappNumber:""` · `designStatus/status:"Not Yet"` · `isDispatched/isDelivered:false` · `trackingNumber:""` · `courier:"Auto Detect"` · `deliveryCost:0` · `extraStatuses:{}` · `invBool1-4:false` · `invNotes:""` · `invoiceNumber:""` · `priority:"Normal"` · `risk:"None"` · `riskReason:"-"` · `customFields:{}` · `customToggles:{}` · `clientFiles/todoItems/workSessions:[]` · `historyLog:[ one "Order created" entry ]` · `createdAt/updatedAt` · `createdByUid/Email` · `source:"web"`

and derives, still without user input: `paymentFee` from the workspace fee percentage, `taxType`/`taxRate`/`taxAmount` from `companySettings` (so **`taxRate:20` arrives free**), and `assignedToUid`/`assignedToEmail` when the creator has restricted assigned-project scope (`index.js:15137`).

**The default order document is 43-54 fields wide and every one of them is written by the server or the client at creation.** Any predicate built on "field is present" or "field is non-default" is measuring our own defaults.

### 1.2 The 33 dead orders, field by field

11 workspaces (`2R4ltp, LdCRwO, MN8lHV, P5eI1V, RrFWqj, YeOKKh, Yl4v2S, Zr9KG4, omUX4b, qrOKIC, tNFtO5`), all v1-activated and dormant, 33 orders read one at a time:

| Field | Value across the 33 |
|---|---|
| `customerName` | `"New Project"` on **33/33** |
| money (`paidAmount`+`remainingAmount`+`watchPurchasePrice`+`orderValue`) | `> 0` on **0/33** |
| `finance.revenue` | `0` on 33/33 (the 26-key `finance` block is stamped on all 33) |
| `designName` | empty 33/33 |
| `lineItems` | field absent 33/33 |
| `trackingNumber` / `isDispatched` / `isDelivered` | 0 / 0 / 0 |
| contact channel (email, WhatsApp, Instagram) | 0 |
| `courier` / `paymentMethod` / `priority` / `risk` / `riskReason` | `Auto Detect` / `Card` / `Normal` / `None` / `"-"` on 33/33 |
| `deliveryTime` | `45` on 33/33 |
| `taxRate` | `20` on 10, `0` on 23 — both server-derived |
| `historyLog.length` | `1` on 26, `>1` on 7 |
| `status` | `Not Yet` 28, `Done` 5 |
| `updatedAt − createdAt > 5 min` | **0/23** of those carrying both timestamps |

### 1.3 Discriminator strength, measured

Fire rates across three populations: the 33 dead orders, 193 other non-fixture orders, and the 222-order production fixture.

| Candidate discriminator | dead | rest | fixture | Verdict |
|---|---|---|---|---|
| `customerName` ∉ placeholder set, non-empty | **0%** | 75.6% | 100% | **strong** |
| any money field `> 0` | **0%** | 70.5% | 100% | **strong** |
| `finance.revenue > 0` | **0%** | 69.4% | 100% | strong; 2 orders narrower than the row above |
| `designName` non-empty | **0%** | 65.3% | 100% | **strong today — expires, see 1.4** |
| `lineItems` non-empty | 0% | 15% | 0% | strong, low coverage (29 orders, 6 ws) |
| contact channel on the order | 0% | 26.9% | 0.5% | strong, low coverage |
| `isDispatched` / `isDelivered` | 0% | 44% / 12.4% | 86% / 0.9% | strong, late-stage only |
| `clientFiles` non-empty | 3% | 10.4% | 0% | **weak** |
| `historyLog.length > 1` | **21.2%** | 39.9% | 0% | **weak — fires on exploration** |
| `status != "Not Yet"` | **15.2%** | 55.4% | 92.8% | **weak — fires on exploration** |
| `deliveryTime != 45` | 0% | 47.2% | 71.6% | **rejected — separates client versions, not users** |
| `paymentFee > 0` | 0% | 55.4% | 100% | **rejected — derived from money, not independent** |
| `source` stamped | **72.7%** | 23.8% | 0% | **rejected — inverted; it is a client-version marker** |

**Why status and history are weak, with the case that proves it.** `LdCRwO`'s five "Done" orders were created on 2026-07-01 between **16:55 and 16:56**, and four carry an identical four-entry history stamp inside the same minute: `Order created` → `Design Status: Not Yet→Done` → `Order Status: Not Yet→Done` → `Customer approved design → Done` → `Order completed → Done`. Five orders created and completed in ninety seconds, all with zero money and the default name. That is one person clicking every toggle to see what they do. **The error direction is over-counting: status transitions and history growth fire hardest on exploration, which is exactly the population v2 exists to exclude.**

### 1.4 Three traps to write into the predicate

**(a) `designName` is being taken away from us.** `generatedProjectName()` (`functions/orders/projectNumber.js:73`) builds `"Project #N"` or `"<Customer> · Project #N"`, and both create paths auto-fill a blank `designName` with it (`index.js:15182` web/Android, `index.js:15962` Swift). Quick Create tells the user so. Today `designName` is still clean — 0 of 448 orders match the generated pattern and `projectNumber` appears on 0 of 448 documents, so no production order has yet come through Quick Create. **It stops being a discriminator on the first one.** v2 therefore uses `designName` only with the generated pattern excluded.

**(b) An empty `customerName` is not evidence of an empty order.** `index.js:15046-15050` uses key-present semantics: an absent key becomes `"New Project"`, but a key present and empty **stays empty, deliberately** — for stock, or for the window. So the test must be *"not a placeholder"*, never *"non-empty"* alone.

**(c) The placeholder list is incomplete in the code today.** The server knows four literals — `New Order, New Project, Yeni Sipariş, Yeni Proje` (`projectNumber.js:60-62`, duplicated at `index.js:13955` and `FirebaseManager.swift:4223`). But Swift creates orders with `t("New Project", lang:)` (`ContentView.swift:19385`), which `DilMotoru.swift:932` localises into 12 languages. A German-locale Mac writes `"Neues Projekt"`, which no placeholder list contains. **Zero such rows exist today, but the gap is live in shipped code**, so v2 specifies the 12-language set.

### 1.5 How cleanly the two strongest signals agree

Across all 448 orders: 87 carry a placeholder or empty name, spread over **39 workspaces** — of those, 2 carry money, 1 has a design name, 0 have line items. 361 carry a real name across 15 workspaces — 356 carry money, 347 have a design name, 313 have moved status.

Name and money disagree on **7 of 448 orders (1.6%)**: 5 real-name-without-money (4 of them in orphaned tenants outside the 63) and 2 placeholder-with-money. The two money-bearing placeholder orders (`vhCSyL`, `cDaMyi`) carry a hand-typed `watchPurchasePrice` — a material **cost** with no sale price yet. That is real work, which is why the money test includes `watchPurchasePrice` even though it is not revenue.

---

## 2. The shared substance test

Every order-based domain below uses one predicate. Defining it once is deliberate: v1's rule is currently implemented **twice**, in `derive.js` and again by hand in `getSetupChecklist` (`index.js:29544`, `mark("order_created", !anyOrder.empty)`), and the two have already drifted.

> ### `SUBSTANTIVE_ORDER(o)`
>
> An order `o` with `o.isDeleted !== true` is **substantive** if **any** of the following holds:
>
> 1. **Money** — `Number(o.orderValue) > 0 || Number(o.paidAmount) > 0 || Number(o.remainingAmount) > 0 || Number(o.watchPurchasePrice) > 0`
> 2. **Named customer** — `trim(o.customerName) !== ""` **and** `lower(trim(o.customerName)) ∉ PLACEHOLDER_NAMES`
> 3. **Line items** — `Array.isArray(o.lineItems) && o.lineItems.length > 0`
> 4. **Design name, guarded** — `trim(o.designName) !== ""` **and** `!/^(.+ · )?Project #\d+$/i.test(trim(o.designName))`
> 5. **Fulfilment** — `o.isDispatched === true || o.isDelivered === true || trim(o.trackingNumber) !== ""`
> 6. **Contact channel** — `trim(o.emailAddress) !== "" || trim(o.whatsappNumber) !== "" || trim(o.instagramUsername) !== ""`
>
> where `PLACEHOLDER_NAMES` is the 12-language set, lower-cased and trimmed:
> `new order, new project, yeni sipariş, yeni proje, neues projekt, nouveau projet, nuovo progetto, nuevo proyecto, novo projeto, новый проект, 新規プロジェクト, 新项目, مشروع جديد, नया प्रोजेक्ट`

**Every one of the six clauses tests a field the server defaults to empty, zero, or false.** None can be satisfied by a document that was created and abandoned.

**Deliberately excluded, with reasons:** `status`/`designStatus` transitions and `historyLog` growth (fire on exploration, §1.3); `deliveryTime` (separates client versions — histogram 45×198, 30×143, 1×63, driven by four different defaults across Swift, the importers and the Android JSON path); `paymentFee` (an arithmetic consequence of money); `clientFiles` (3% of the dead cohort already has one); `source` (a client-version marker, inverted); `taxRate` (server-derived from workspace settings); `finance.*` other than nothing — the whole 26-key block is a server stamp present on all 33 dead orders.

### The result that matters

> **All 33 dead orders fail `SUBSTANTIVE_ORDER`. Not one of the six clauses fires on any of them: money 0/33, named 0/33, line items 0/33, guarded design name 0/33, fulfilment 0/33, contact 0/33.**

---

## 3. The six domains

Each is independently approvable. Counts are over the 63 live workspaces, computed read-only on 2026-09-08.

### 3.1 Commerce — **measurable and trustworthy**

**Predicate.** The workspace has ≥1 order where `o.commerce.provider` is a non-empty string **and** `SUBSTANTIVE_ORDER(o)`.

**Satisfied by: 1 of 63** (`QNxWP8` — 12 orders, all with money, all with line items, all provider-stamped).

**Reason.** `commerce.provider` is written only by the connector pipeline; a user cannot type it. Pairing it with the substance test keeps §7's rule that connecting a shop is not activation — `4hCx8H` has a live Etsy connection and zero imported orders, and correctly does not activate.

**One thing to accept.** v1's derivation treats `customFields.Source` as equivalent to `commerce.provider`. It is not: `customFields` is a user-editable string map (`normalizeStringMap`, `index.js:7056`), so a person can type `Source: Etsy` by hand. v2 excludes it from the commerce test. This costs `KSQide` its commerce label (5 `Source`-tagged orders, 0 provider-stamped, despite a live Shopify store) — but `KSQide` activates on the bespoke path anyway, so no workspace loses activation from this choice.

---

### 3.2 Bespoke studio — **measurable but weak proxy**

**Predicate.** The workspace has ≥1 order where `SUBSTANTIVE_ORDER(o)` is true **and** `o.commerce.provider` is absent or empty.

**Satisfied by: 10 of 63** (`395OJD, KSQide, aiVY7U, cDaMyi, dKncGl, iZFBJq, n06Uzp, test_s, vhCSyL, zIYkFB`).

**Why "weak proxy" and not "trustworthy" — the honest part.** The spec asks for *a customer AND a project*, and v1 encodes that as `customer_created AND order_created`. **That AND is not two facts.** `upsertCustomerForWebOrder` (`index.js:13953-13999`) creates a customer document *from the order's own `customerName`*, with `email`, `phone`, `address`, `streetAddress`, `city`, `postalCode`, `country`, `notes` and `profileImageUrl` all `""`. The customer is a by-product of the order, so requiring both is requiring one. That is why v2's predicate does not mention customers: keeping the clause would look like a stricter bar while adding nothing.

**How it can be wrong, and in which direction.** It **over-counts**: a studio that types one real order and never returns satisfies it. It cannot under-count for anyone who has typed a genuine order. Direction of error is therefore the same as v1's, just very much smaller — v1 admits 24, this admits 10, and the 14 it excludes have been read individually.

**A stricter variant, if the operator wants it.** Add: *and* the workspace has ≥1 customer with a non-empty `email`, `phone`, `address` or `notes`. **Satisfied by: 6 of 63** (`KSQide, aiVY7U, dKncGl, iZFBJq, vhCSyL, zIYkFB`). This restores a genuine second fact and drops `395OJD`, `cDaMyi`, `n06Uzp` and the fixture `test_s`. Estate enrichment is thin — of 278 customers, 46 carry an email, 32 a phone, 28 an address, 11 notes — so this variant is defensible but harsh. **Recommendation: approve the 10-workspace version;** the enrichment signal is better used as a quality gradient than as an activation gate.

**A separate bug worth knowing.** `createdAt` exists on only **14 of 278** customer documents, and `derive.js:89` requires it — so `customer_created` cannot fire for 95% of the customers that exist. That is a missing timestamp, not missing behaviour, and it is one more reason not to build the bespoke predicate on customer documents.

---

### 3.3 Finance — **measurable and trustworthy** (0 satisfiers today)

**Predicate.** The workspace has ≥1 document in `companies/{cid}/bankTransactions` where `trim(linkedOrderId) !== ""`, on a bank connection that is not `demo: true`.

**Satisfied by: 0 of 63.**

**This corrects the brief.** `bank_match_completed` was reported as an event nobody can satisfy. **It has six live writers** — `functions/bankFeed.js:1058, 1171, 1202, 1225, 2035, 2055` — each setting `linkedOrderId` when a person links a bank row to an order. The signal is real, dated, and exactly what §8 asks for: the moment money meets a job. **Zero workspaces satisfy it because nobody has ever done it**, not because it cannot be recorded. That is an honest zero, and it is a product finding rather than a measurement gap.

Context for why the zero is unsurprising: of the 3 bank-connected workspaces, `KSQide` and `RLedvf` are `demo: true` on the connection and on all 52 of their transactions. Only `iZFBJq` (the operator) holds real ones.

**Two reader bugs that must be fixed alongside, or the predicate stays unreadable in production:**

1. `getActivationFunnel` (`index.js:29633-29650`) builds its snapshot **without `bankTransactions` at all**, so `derive.js`'s bank-match branch is unreachable in the shipped admin reader. (Verified inert today: re-running derive with a full snapshot changes no workspace's state, because there are no matches to find.)
2. `getSetupChecklist` (`index.js:29554`) queries `.where("linkedOrderId", "!=", "")`. Firestore **excludes documents that lack the field**, and `linkedOrderId` is not present as a field on a single one of the 1250 transactions. The query would return empty even after a match was recorded, unless the writer had touched that row before. The same structural bug sits at `index.js:29559`.

**Weaker signals deliberately not used.** `receiptPath` is non-empty on 265 non-demo transactions and `reviewedAt` on 6 — both are real human bank work, but neither is *money meeting a job*, and promoting them would repeat v1's mistake of accepting adjacent effort as activation.

---

### 3.4 Inventory — **measurable and trustworthy** (0 satisfiers today)

**Predicate.** The workspace has ≥1 document in `companies/{cid}/inventoryMovements` where `kind === "used"` **and** `trim(ref) !== ""` (`ref` carries the order id).

**Satisfied by: 0 of 63.**

**This also corrects the brief, and it is the sharpest finding in this document.** `derive.js:120-124` tests `item.consumedQuantity > 0 || item.lastConsumedAtMs`, and `getSetupChecklist` (`index.js:29559`) queries `consumedQuantity > 0`. **Neither field is written by anything, anywhere.** A grep across `functions/` returns only those two readers and their tests. The fields do not exist on any of the 12 inventory items. `quantity` is an object (`{onHand, reserved, incoming, unit}`), not a number.

Meanwhile `consumeInventoryForOrder` (`functions/inventory.js:2702-2772`) — the real, shipped consumption path — writes exactly what §9 asks for, into a collection `derive.js` never opens:

```
recordMovement(tx, companyId, {
  item, itemId: ref.id, kind: "used",
  delta: roundSigned(-consuming),
  unitCost: ..., at: now, uid, email, ref: orderId, note: ""
});
```

A movement with `kind:"used"` and `ref` set to an order id **is** stock consumed by a job — the definition, not a proxy for it. `inventoryMovements` also carries a declared kind vocabulary (`inventory.js:278-291`) in which `used` is documented as "consumed on a job".

**So inventory activation was never unmeasurable. It was unread.** The estate's 11 movements are all `kind: "openingStock"` with positive deltas and empty `ref`, so the zero is genuine: three workspaces hold stock, none has consumed any against a job. `vhCSyL` is the closest — 1 item, `status:"reserved"`, `quantity.reserved: 20`, `reservedOrderIds:["ImRE2V…"]` — stock promised to a specific order but not yet drawn down. Reserving is not consuming (`inventory.js:1920` says so explicitly), and v2 does not count it.

**Optional widening, if the operator wants it:** also accept `kind === "sold"` with a non-empty `ref`. It changes nothing today (0 such movements) and it slightly blurs §9's "consumed by a job". **Recommendation: approve `used` only.**

---

### 3.5 AI — **currently unmeasurable**

**Predicate: none can be written.**

**Satisfied by: not computable. 0 of 63 workspaces are currently routed to this path.**

`REQUIREMENTS.ai = { all: ["grounded_ai_answer"] }`. That event, and `ai_business_data_connected` alongside it, are **written by nothing**. `derive.js:141-154` names them itself as underivable, and a grep across `functions/`, `studioflow-web/`, `EGGcraft/` and `studioflow-android/` finds **zero references outside `functions/lifecycle/`**. There is no document that an assistant answer touches, so there is nothing to derive from.

**No proxy is offered.** The available adjacent facts — that a workspace has an OpenAI key configured, or that the chatbot corpus exists — measure our configuration, not their value, and §7 rules out exactly that substitution. "We cannot tell" is the correct answer, and §4 below says what to do with it.

**Mitigating fact:** `GOAL_PATHS` contains no goal that maps to `ai`, so this path is reachable only by setting `profile.activationPath` explicitly. Nobody is on it today, and nobody can arrive on it through the wizard. The unmeasurability is real but currently harms no one.

---

### 3.6 Accounting — **currently unmeasurable**

**Predicate for activation: none can be written.**

**Satisfied by: not computable. 0 of 63 workspaces are routed to this path.**

`REQUIREMENTS.accounting = { all: ["accounting_connected"] }` (`activation.js:42`). **The bar is connecting**, which contradicts §7 and the file's own header comment ("Activation is not connecting something"). Its only satisfier in the whole estate is `iZFBJq`'s pair of developer connections — QuickBooks Online on `env: sandbox` and Xero on `env: demo` — both in `mode: "shadow_read"`, which by definition writes nothing to a ledger.

The signal that *would* mean activation — a NivaDesk document successfully pushed into the customer's ledger — does not exist, because ledger writing is not built. `primary_write` is a declared connection mode (`functions/accounting/core/adapter.js:16`) with no shipped writer behind it; that work is QuickBooks/Xero phases 3-7.

**The honest recommendation is to remove `accounting` as an activation path** rather than leave a definition that certifies a sandbox connection as delivered value. Keep the connection as a **setup** event, which it already is (`SETUP_EVENTS` includes `accounting_connected`), and let those workspaces activate through whichever other domain their real work lands in.

---

### 3.7 General (the fallback path) — **measurable but weak proxy**

**Predicate.** Any of §3.1-§3.4 is satisfied.

**Satisfied by: 11 of 63.**

**Weak because of what it inherits**, not because of its own logic: 10 of its 11 satisfiers come through §3.2, so it carries §3.2's over-counting. It is nonetheless the right fallback — 56 of 63 workspaces are on `general`, and holding them to a domain they never chose would manufacture failures.

---

### 3.8 A structural rule that applies to all six: **the declared path must never deny activation**

`QNxWP8` has 12 imported orders, all carrying money and line items, and 7 enriched customers. **v1 calls it unactivated** — its declared path is `bespoke_studio`, which demands a *typed* `order_created`, and its orders derive as `external_order_imported` instead. Real value delivered, real evidence on disk, classified as a failure by routing alone.

> **Rule.** A workspace is activated if **its declared path's predicate is satisfied, OR any other domain's predicate is satisfied.** The declared path decides what we *guide* the workspace toward and what we measure its progress against — never what counts as having been served.

Under this rule `QNxWP8` activates on the commerce predicate while remaining on the `bespoke_studio` path for messaging purposes. It is the single **GAIN** in the migration below.

---

## 4. The unmeasurable guard

### The rule

> **A workspace must never be scored at-risk, dormant, or churned on the basis of an activation path whose predicate cannot be evaluated from existing documents.**
>
> Let `measurable(path)` be true for `commerce`, `bespoke_studio`, `finance`, `inventory` and `general`, and false for `ai` and `accounting`.
>
> Then, before any risk or lifecycle judgement:
>
> 1. If `measurable(declaredPath)` is false **and** no other domain's predicate is satisfied, the workspace's activation state is **`unknown`** — not `activated`, and explicitly **not** unactivated.
> 2. A workspace in state `unknown` is **exempt from the `notActivatedPoints` and `stillNotActivatedPoints` terms entirely** (`risk.js:69-72`). Those two terms may only be applied when `measurable(path)` is true.
> 3. A workspace in state `unknown` carries risk level **`unknown`**, not `low` — a low score is a claim of health, and we are not entitled to it. Other risk terms (repeated integration failures, open blocker feedback, cancellation-page visits) still apply, because those are directly observed.
> 4. `unknown` must never be an input to retention messaging, dormancy campaigns, or any churn-risk list. It is an input to **one** queue: the list of paths we cannot yet measure.

### The correct state, said plainly

**"We do not know" is a legitimate state and it is better than a false one.** A workspace on the AI path that has been quietly getting grounded answers every day looks identical, in our data, to one that signed up and vanished. Calling that workspace `at_risk` is not a cautious guess — it is an assertion we have no evidence for, and it would put a real customer into a win-back campaign for a crime we invented.

### Why the guard is needed even though the state machine looks safe

The lifecycle state machine **is** safe on its own: `at_risk` and `dormant` are reachable only from `activated`, so an unmeasurable-path workspace can never be labelled dormant. All 6 current `at_risk` and all 12 `dormant` workspaces are on `general`.

**It is the risk score, not the state, that manufactures the false negative.** `risk.js:69-72` awards `notActivatedPoints + stillNotActivatedPoints` = **50 points, "high"** to any workspace not activated 14+ days after signup, with no reference to whether its path is measurable. Today **28 of the 39 unactivated workspaces are high-risk, every one of them for the single reason `not_activated_after_two_weeks`.**

Two workspaces are on zero-satisfier paths and are spared only by their age: **`a374UI`** (path `inventory`, 10 days old, holding 0 inventory items) and **`jVVwNj`** (path `finance`, 5 days old, holding 0 bank connections). Both cross the 14-day line within the week. `QNxWP8` — 12 real imported orders — sits at medium and `setup_started` on the same trajectory, and is rescued by §3.8 rather than by this guard.

### An uncomfortable consequence that must be stated

Under v2, unactivated rises from 39 to 52 workspaces, and the activation term of the risk score therefore fires more, not less. Holding all other risk terms constant and varying only the activation flag:

| Risk level (activation term only) | v1 | v2 |
|---|---|---|
| high | 28 | **40** |
| medium | 10 | 11 |
| low | 25 | 12 |

**12 workspaces move to high risk under v2**: `2R4ltp` (74d), `LdCRwO` (68d), `MN8lHV` (68d), `P5eI1V` (70d), `RrFWqj` (130d), `YeOKKh` (36d), `Yl4v2S` (100d), `Zr9KG4` (52d), `omUX4b` (43d), `p5bfCb` (19d), `qrOKIC` (117d), `tNFtO5` (69d) — eleven of them previously labelled `dormant`, which under v1 scores lower than never-activated.

This is the correct outcome: these workspaces created an order document and nothing else, months ago. But it means **v2 makes the recovery queue larger and more urgent, not smaller**, and the queue should be resourced before v2 ships. The guard in this section keeps *unmeasurable* workspaces out of that queue; it does not, and should not, keep *genuinely unactivated* ones out.

---

## 5. Migration: v1 versus v2 over the real 63 workspaces

Computed read-only on 2026-09-08 by re-running the shipped `derive.js` + `activation.js` for the v1 column and applying §2-§3.8 for the v2 column.

### Headline

| | v1 | v2 | change |
|---|---|---|---|
| **Activated** | **24** | **11** | **−13** |
| Unactivated | 39 | 52 | +13 |

Composed of **14 lost**, **1 gained**, 10 unchanged-activated, 38 unchanged-unactivated.

### By v1 lifecycle state

| v1 state | workspaces | still activated under v2 | lost |
|---|---|---|---|
| `new` | 35 | 0 | 0 (none were activated) |
| `dormant` | 12 | 1 | **11** |
| `at_risk` | 6 | 5 | 1 |
| `activated` | 5 | 3 | 2 |
| `setup_started` | 4 | 1 (**gained**) | 0 |
| `engaged` | 1 | 1 | 0 |

### The 14 that lose activation

Every one holds only shell orders — zero substantive orders by the §2 test.

| Workspace | v1 state | path | orders | substantive | enriched customers | age |
|---|---|---|---|---|---|---|
| `2R4ltp` | dormant | general | 1 | 0 | 0 | 74d |
| `61nNqj` | activated | general | 1 | 0 | 0 | 8d |
| `Jro4NL` | activated | bespoke_studio | 1 | 0 | 1 | 10d |
| `LdCRwO` | dormant | general | 5 | 0 | 0 | 68d |
| `MN8lHV` | dormant | general | 1 | 0 | 0 | 68d |
| `P5eI1V` | dormant | general | 1 | 0 | 0 | 70d |
| `RrFWqj` | dormant | general | 1 | 0 | 0 | 130d |
| `YeOKKh` | dormant | general | 1 | 0 | 0 | 36d |
| `Yl4v2S` | dormant | general | **17** | 0 | 0 | 100d |
| `Zr9KG4` | dormant | general | 1 | 0 | 0 | 52d |
| `omUX4b` | dormant | general | 3 | 0 | 0 | 43d |
| `p5bfCb` | at_risk | general | 1 | 0 | 0 | 19d |
| `qrOKIC` | dormant | general | 1 | 0 | 0 | 117d |
| `tNFtO5` | dormant | general | 1 | 0 | 0 | 69d |

`Yl4v2S` is worth a second look: **17 orders, none substantive.** v1 counted it as activated seventeen times over.

### The 10 that keep activation

| Workspace | v1 state | orders | substantive (typed / imported) | enriched customers |
|---|---|---|---|---|
| `iZFBJq` | engaged | 80 | 80 (80 / 0) | 21 |
| `test_s` | dormant | 222 | 222 (222 / 0) | 0 |
| `KSQide` | activated | 24 | 23 (23 / 0) | 15 |
| `n06Uzp` | activated | 5 | 5 (5 / 0) | 0 |
| `zIYkFB` | at_risk | 4 | 4 (4 / 0) | 3 |
| `395OJD` | at_risk | 3 | 3 (3 / 0) | 0 |
| `vhCSyL` | activated | 2 | 2 (2 / 0) | 1 |
| `aiVY7U` | at_risk | 8 | **1** (1 / 0) | 1 |
| `cDaMyi` | at_risk | 1 | 1 (1 / 0) | 0 |
| `dKncGl` | at_risk | 1 | 1 (1 / 0) | 1 |

### The 1 that gains activation

| Workspace | v1 state | why v1 was wrong |
|---|---|---|
| `QNxWP8` | setup_started | 12 imported orders, all with money and line items, 7 enriched customers — denied by path routing alone (§3.8) |

### The number the operator should hold onto

**Two of the 11 are not customers.** `test_s` is the production fixture (a company document with no fields, 222 backdated orders) and `iZFBJq` is the operator's own workspace. **External, genuinely activated workspaces: 9 of 63 — 14%.** v1's 24 implied 38%.

### Per-domain satisfier counts under v2

| Domain | Label | Satisfiers of 63 |
|---|---|---|
| Commerce | measurable and trustworthy | 1 |
| Bespoke studio | measurable but weak proxy | 10 (strict variant: 6) |
| Finance | measurable and trustworthy | 0 |
| Inventory | measurable and trustworthy | 0 |
| AI | currently unmeasurable | n/a |
| Accounting | currently unmeasurable | n/a |
| **Any (activated)** | | **11** |

---

## 6. What v2 deliberately does not fix

### 6.1 The five never-emitted events, and whether documents could stand in

`derive.js:141-154` names them. Verified by grep across all four surfaces: **0 references outside `functions/lifecycle/`.**

| Event | Derivable from existing documents? |
|---|---|
| `integration_connect_started` | **No.** Nothing persists an abandoned connect attempt. A started-but-failed OAuth leaves no row — the connection document is written only on success. |
| `bank_connect_started` | **No.** Same shape. |
| `accounting_connect_started` | **No.** Same shape. |
| `ai_business_data_connected` | **No.** No document changes when the assistant is pointed at workspace data. |
| `grounded_ai_answer` | **No.** No document changes when an answer is produced. |

**"Tried to connect and gave up" — the exact population recovery work hunts — leaves no trace anywhere.** That is the largest gap in this system and v2 does not close it. Closing it needs a new emitter; per the constraints of this exercise, **that is noted here and is not proposed as a prerequisite for v2.** v2 ships without it and is honest about the resulting blind spot.

One partial exception worth recording: `squareConnections` and `wooConnections` retain rows with `status: "disconnected"` (`QNxWP8` holds two). A disconnected connection is evidence that somebody connected and then stopped — **not** the same as abandoning a connect flow, but the closest existing artefact, and cheap to surface on the recovery list without any new collection.

### 6.2 Other things v2 does not fix

**The two readers still disagree about onboarding.** `getActivationFunnel` reads `settings.businessOnboardingCompletedAt` (timestamp); `getSetupChecklist` reads `settings.businessOnboardingCompleted` (boolean). Live: **40 workspaces have the timestamp, 18 have both, 0 have the boolean alone, 23 have neither.** So 22 workspaces have completed onboarding according to the admin funnel and have not according to the user-facing checklist. v2 does not touch onboarding measurement.

**Skip is still counted as completion.** Of the 40 stamped workspaces, `businessOnboardingCompletedAction` is **`skip` on 22**, `wizard` 7, `standard` 6, `smart` 5 — and `derive.js:69` ignores the action entirely. Twenty-two Skip-presses are reported as completed onboarding. v2 leaves this alone because §142 forbids treating navigation as engagement, and fixing it belongs with the onboarding work, not the activation definition.

**Activation is still not stored.** `activationProgress()` (`activation.js:158`) recomputes from documents on every read. v2 keeps that — recomputation is what made this audit possible retroactively — but it means the definition changing silently rewrites history for every workspace, so any dashboard built on it must record which version produced a number.

**The predicate will live in two places unless someone stops it.** `getSetupChecklist` re-implements activation by hand (`index.js:29544`). Any v2 predicate written into `derive.js` and not into the checklist will drift exactly as v1's did. **The predicate should be one exported pure function that both readers import** — the same lesson already recorded for the finance engine.

**Orphaned tenants are out of scope.** 51 distinct `companyId`s appear on orders; **24 belong to companies with no company document** (largest: `fmVbKr` 10 orders, `2UCFl8` 9). They are invisible to every reader here, including this audit's 63.

---

## 7. Approval sheet

Each line can be accepted or rejected on its own.

| # | Decision | Effect if approved |
|---|---|---|
| 1 | Adopt `SUBSTANTIVE_ORDER` (§2) as the shared order test | 33 dead orders stop counting as activation |
| 2 | Commerce predicate (§3.1) — provider-stamped **and** substantive | 1 satisfier; `customFields.Source` no longer counts as commerce |
| 3 | Bespoke predicate (§3.2) — substantive typed order, customer clause dropped | 10 satisfiers |
| 3b | *(alternative to 3)* add the enriched-customer requirement | 6 satisfiers |
| 4 | Finance predicate (§3.3) — `linkedOrderId` on a non-demo transaction | 0 satisfiers; requires the two reader fixes |
| 5 | Inventory predicate (§3.4) — `inventoryMovements.kind === "used"` with `ref` | 0 satisfiers; retires the two never-written fields |
| 6 | Declare AI **currently unmeasurable** (§3.5) | no predicate; guard applies |
| 7 | Remove `accounting` as an activation path (§3.6) | connection stays a setup event |
| 8 | Path-never-denies rule (§3.8) | `QNxWP8` activates |
| 9 | Unmeasurable guard + `unknown` state (§4) | AI/accounting paths exempt from the 50-point activation penalty |
| 10 | Accept the migration (§5) | activated 24 → 11; high-risk 28 → 40 |

**If only one line is approved, it should be #1.** Everything uncomfortable in this document follows from it, and it is the line the 33 orders were read to justify.
