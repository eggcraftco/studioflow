# The independent items of the afternoon (10 September 2026, operator away)

Item 6 of the operator's instruction: Etsy read-only verification, the activation v2.1 cutover package, the retention
wiring gaps — "close the recorded open items, do not reproduce finished preparation". Each part names its branch and
commit; nothing here was deployed, published or sent.

## 6a. Etsy — what could be verified without the developer account

| Check | Result |
|---|---|
| Runtime vs code | the 11 deployed Etsy functions (`beginEtsyConnect` … `etsyWebhook`, all ACTIVE, deployed 6 Sep 01:48–03:04Z) are exactly the 11 exports in `functions/index.js`; **no commit since that deploy touches** `functions/etsy*.js`, `functions/etsyWebhook.js` or `functions/commerce/adapters/etsy.js` — the runtime is the code |
| Android order write path (recorded open item: could a native update drop server-written fields such as `etsySource`?) | **closed, safe by construction**: `StudioFlowRepository.updateOrderFields` calls the `updateWebOrder` callable with only the changed fields (`StudioFlowRepository.kt:909-919`); the server applies them with `transaction.update(orderRef, updates)` (`index.js:16187` block, line 364 of it) — a field-level update, never a document replace; Android has no direct `siparisler` write |
| Store builds | unchanged fact: the iOS/macOS 1.3 (build 17) store builds predate the 2 Sep merge fix; closes with the next store release — no store publish was made, per instruction |
| Developer account / app approval | **user session needed.** The Etsy session in Chrome belongs to a personal profile (`gunesgocmen`, display name shown as a person, "Purchases and reviews") whose developer dashboard offers only *Create a personal app* — no `nivadesk` app is listed, so this is not the EGGcraft shop's developer account that holds the approved Personal Access app (memory: approved 31 Aug). Nothing was signed in or out; the tab was closed |

## 6b. Activation v2.1 — the cutover package, corrected and re-measured

- **Re-measured read-only at 13:52Z** (`v21-dryrun.mjs`, ids only): 64 external workspaces; activated **23 (live) → 9 (v2.1)**;
  the same **16 shell-only workspaces flip** as in the night's run; 18 zero-order workspaces relabel `new → onboarding`.
- **The night's plan would have regressed the eBay change.** Carrying `derive.js` wholesale from `onboarding-retention`
  reverted `integration_connected` from `snapshot.ebayConnections` (merged with eBay on 10 Sep) and the eBay wiring test
  said so. The two files were **merged three-way** (base `bc26a7ba`) — clean — so the branch's `derive.js` now holds both.
- Branch **`activation-v21-cutover`**: `1fb4d17e` (the carry), `3f20e04f` (the package
  `docs/onboarding/activation-v2.1-cutover-2026-09-10.md`: numbers, the one deploy command for `getActivationFunnel`,
  the expected 9/64, rollback to `51ad6953`, the retention caveat). Full suite on the branch: **1,661 PASS, exit 0**.
- **Awaiting approval:** the merge and the by-name deploy of `getActivationFunnel`. No data changes anywhere.

## 6c. Retention — gaps 7 and 8 closed on `retention-wiring`, every flag still off

Commit **`55f6fa4d`** (pushed):

| Gap | What was done | Test |
|---|---|---|
| 7 — Firestore rules | `retention`, `retentionLog`, `retentionMessages`, `retentionInbound` added to both `companies/{cid}/{collectionId}` deny-lists; explicit blocks: state, log and inbound **server-only**, `retentionMessages` **readable by a member, never written from a client**; top-level `retentionReplyKeys` server-only | new `retention-rules.test.mjs` against the emulator: owner, member, outsider and anonymous — 4 closed paths × 4 operations each, message read allowed for member/owner only, no client write/dismiss/delete — green; full rules suite green |
| 7 — index | `firestore.indexes.json`: collection-group `retentionLog` (`status ASC, nextAttemptAtMs ASC`) — the outbox query `collectionGroup("retentionLog").where("status","==","failed").where("nextAttemptAtMs","<=",now)` in `retentionSweep` | declared; created when the index file is deployed |
| 8 — support-case stamp | `retention/writer.js`: `supportCaseOpenFrom(statuses)` (open / inProgress / waitingForUser count as open) and idempotent `markSupportCase`; `index.js`: `nvRetentionSupportCaseSync(companyId)` reads both ticket queues (`supportTickets` by `companyId`, `companies/{cid}/workspaceTickets`) and stamps `supportCaseOpenAtMs`, never throwing at the ticket; called after **all four** ticket paths (app create, workspace create, app status, workspace status) | `retention-writer.test.js` (+1 case: open once, idempotent, close once, context refuses with `support_case_open`), new `retention-support-case-wiring.test.js` (pins the helper and the four call sites); full unit suite on the branch green |

Still open there, by design of the gap list: 1 inbound route, 2 reply domain, 3 sender identity, 4 the two secrets —
**operator decisions**; 5 the in-app reader (a client feature) and 6 the copy in eleven languages — product work not
started here. Flags: none set; nothing deployed; no e-mail, no notification.

## CI

The three branch pushes trigger `functions-tests` (each touches `functions/`); status at the time of writing (14:00Z): ebay-workspace-allowlist 6566f9aa completed/success 2026-09-10T13:48:11Z run 34484927936; activation-v21-cutover 1fb4d17e completed/success 2026-09-10T13:57:19Z run 34485892871; retention-wiring 55f6fa4d in_progress/ 2026-09-10T14:00:34Z run 34486240190.
Re-read with `gh run list --workflow functions-tests.yml --branch <name>`.
