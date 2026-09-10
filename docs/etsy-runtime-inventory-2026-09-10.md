# Etsy — runtime inventory, AC-ETSY acceptance matrix, panel status (10 September 2026, night)

Read-only. No application was submitted, no support e-mail sent, no production migration. The 9 Sep status
document (§4) asked for exactly this order: inventory → acceptance matrix → adapter/shadow parity → cross-client
source preservation → lifecycle tests → production acceptance.

## 1. The application panel — status uncertain

The Etsy session open in the operator's Chrome (`etsy.com/developers`, avatar "E") shows **"It looks like you
haven't registered any apps yet!"** on both Dashboard and Settings. That is not the account the `nivadesk`
Personal Access app lives on (approved 31 Aug 2026 on the EGGcraft shop account, with the first, banned
application also visible there — memory `etsy-api-application`, `etsy-api-credentials`). Signing in to the
other account was not done (login). **Status: uncertain until the operator opens `your-apps` with the EGGcraft
account**; nothing tonight suggests a change, and the connector's live functions keep working on the existing
keystring (§2).

## 2. Runtime inventory (production, read tonight)

| Layer | What exists |
|---|---|
| Cloud Run (europe-west2), all serving | `beginetsyconnect-00009-xel`, `disconnectetsyshop-00011-yew`, `etsyoauthcallback-00014-vux`, `etsywebhook-00022-peb`, `getetsyconnections-00007-xew`, `previewetsyimport-00016-wox`, `reconcileetsyconnections-00019-noj`, `resolveetsycustomermatch-00008-dos`, `runetsyimport-00018-new`, `syncetsynow-00018-xoy`, `verifyetsyconnection-00007-zam` — the eleven the memory names |
| Secret Manager | `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_TOKEN_KEY`, `ETSY_WEBHOOK_SECRET` (exist; values not read). A secret change means redeploying all eleven **by name** (the version is pinned at deploy) |
| Functions modules | `functions/etsy.js`, `etsyConnect.js`, `etsyCustomerMatch.js`, `etsySync.js`, `etsyWebhook.js`; the common-engine adapter under `functions/commerce/` (`commerce-etsy-adapter.test.js`) |
| Server-written source block | `etsySync.js:619` `orderRef.set({ etsySource: … }, { merge: true })` on every imported order |
| Web | `studioflow-web/app/etsy/callback` (OAuth return `nivadesk.app/etsy/callback`; the Cloud Functions domain is the second registered return and shows Etsy's phishing warning — memory) |
| Native | Apple `EGGcraft/EtsyIntegration.swift` (+ Settings/CommerceSyncHealth); Android `IntegrationsHub.kt`, `SettingsScreen.kt` — connection UI, **no source panel on any client** |
| Tests | 12 unit suites + 2 emulator-bound unit files + 4 e2e emulator suites (§3) |
| Limits | 5 QPS / 5,000 calls per day (assigned); content freshness 6 h (listings) / 24 h (other) per API Terms §1 |

## 3. Test evidence tonight (deploy branch `9cc985a6`, functions unchanged for Etsy)

| Suite | Result |
|---|---|
| `commerce-etsy-adapter`, `etsy-cancellation`, `etsy-schema-drift`, `etsy-connect`, `etsy-core`, `etsy-customer-match`, `etsy-mapping`, `etsy-quota-share`, `etsy-sync`, `etsy-timeout`, `etsy-webhook` | **all PASS** |
| `etsy-emulator`, `etsy-resync-preserves`, `etsy-relay-identity`, `commerce-etsy-shadow-emulator` (via `firebase emulators:exec --only firestore`) | **all PASS** (`E2E_EXIT 0`; "ETSY SHADOW GEÇTİ" last) |
| `etsy-rules.test.mjs`, `etsy-retention.mjs` (emulator-bound; they hard-set `FIRESTORE_EMULATOR_HOST`) | run under the emulator after the first attempt without one refused the connection — result in the night report's Task 5 row |

## 4. AC-ETSY acceptance matrix (`NivaDesk_Commerce_Integration_AI_Spec.md` §AC-ETSY)

| Criterion | State | Evidence / gap |
|---|---|---|
| **AC-ETSY-001** No automatic-path order is written without import approval | **holds in code** | preview → approve → `runEtsyImport`; `etsy-connect` + `etsy-emulator` cover the approval gate |
| **AC-ETSY-002** Webhook + reconciliation handle the same receipt without a duplicate | **holds in code** | `etsy-webhook` (replay protection), `etsy-sync`, `commerce-etsy-shadow-emulator` (common engine duplicate/stale/noop) |
| **AC-ETSY-003** A failed reconciliation does not advance the watermark | **holds in code** | `etsy-sync` / `etsy-timeout` (failure leaves the cursor); the eBay cursor-plan rule is the same shape |
| **AC-ETSY-004** Relay e-mail never produces a wrong automatic merge | **holds in code** | `etsy-relay-identity` (e2e), `etsy-customer-match` (scoring, manual resolve via `resolveEtsyCustomerMatch`) |
| **AC-ETSY-005** The Etsy source panel is visible on every client and survives a save | **PARTIAL** | *survives a save:* Apple update path merges since 2 Sep (`FirebaseManager.swift` `writeSiparisMerging`/`mergePayload`: "every field the model does not own survives") — **in the deploy branch, not in the store builds (1.3 / build 17, 22 Aug)**; Android write path **not verified**; web writes through callables (server-side merge). *Visible:* **no client shows `etsySource`** (blueprint screen 6 absent) — the open half |
| **AC-ETSY-006** The dashboard shows Etsy revenue under the right channel/currency | **not verified** | the Finance Engine's channel split and `orderTaxResponsibility` (Etsy = `unknown`) exist; no test names Etsy revenue on the dashboard specifically |
| **AC-ETSY-007** Account deletion token and the PII lifecycle complete | **holds in code (disconnect path)** | `etsy-retention.mjs` (buyer mirror deleted on disconnect, orders kept); Etsy has no account-deletion notification endpoint like eBay's — the lifecycle here is disconnect-driven |

## 5. Migration / parity gaps (status document §4.2), where each stands

| Gap | Tonight |
|---|---|
| `etsySource` consistent on web + Apple + Android | not visible anywhere; Apple preserves it on save (branch), Android unverified |
| Source metadata lost in client serialization | Apple: closed on the branch (2 Sep); Android: open question; a store release is what closes it for users |
| Workspace role / area access enforcement | unchanged; `etsy-connect` tests owner gating |
| Reconciliation watermark safety | AC-003 holds |
| Webhook + reconciliation duplicate prevention | AC-002 holds |
| Paid order vs settlement/ledger separation | unchanged (Finance Engine v4 / settlements phase) |
| Account deletion / token / PII retention lifecycle | AC-007 holds on disconnect |
| Dashboard channel/currency | AC-006 not verified |
| Migration to the common Commerce Apply Engine and parity | the shadow adapter exists and its emulator suite passes; the cutover (adapter as the only path) is the next work item, not tonight |

## 6. The "Mac etsySource loss" fix — prepared, and found already made

The memory note said the Apple client's full-document `setData(from:)` wiped `etsySource` on every save.
Tonight's read of `FirebaseManager.swift`: the **update** path is `updateSiparis` → `writeSiparisMerging` →
`mergePayload` + `setData(payload, merge: true)`, with explicit deletes only for fields the model owns and
cleared. The full write at `:2228` is the **create** path (no server block exists yet). So the isolated fix
the night asked for is already on the deploy branch (2 Sep audit) with the merge semantics documented in the
code; what remains is shipping it (store line) and verifying Android's write path the same way. The memory
note was corrected tonight.

## 7. Not done, by instruction

No application submission, no e-mail to `developer@etsy.com`, no production migration of the Etsy path
onto the common engine, no client change.
