# Native feedback screens (Mac / iOS / Android) — candidate branch, 11 September 2026

Branch **`native-feedback-screens`** (worktree `~/Developer/studioflow-native-feedback`), cut from the deploy branch head
`37025406`. **Nothing is deployed, submitted or released from it**: no store build, no TestFlight, no Play track, no
functions deploy. The overnight brief asked for the native "Send feedback" screens on the existing feedback callables,
design and translation systems, one platform built and tested first, no automatic-invitation expansion.

## 1. Scope built

* **The manual entry only.** "Send feedback" appears in the account menu (Mac/iPad avatar menu, iPhone navigation menu,
  Android compact and wide header menus) **only when the server says the feature is on for the workspace** — the client
  asks `getFeedbackPrompt` once per workspace per ten minutes and reads `enabled`; off is an answer, not an error, so the
  entry simply stays hidden. No first-success invitation card on native: that stays on the web (§34), as the brief asked.
* **The short form**, the web's wording and structure: *Overall* (required: Going well / It's okay / Struggling),
  *What is it about? (optional)* (Something isn't working / Something is missing / A suggestion — a second tap takes it
  back), *Tell us more (optional)* (2,000 characters, a counter under 200 left), the privacy line, Cancel / Send, then the
  thank-you. Cancel keeps the draft; only a successful send clears it (web behaviour). Errors are the web's four
  sentences chosen by the callable's code (`resource-exhausted`, `failed-precondition`, `permission-denied`,
  `invalid-argument`; anything else → "could not be sent").
* **What is sent:** `companyId`, `trigger: manual`, `experience`, `kind`, `text`, `page` (`mac/<tab>`, `ios/<tab>`,
  `android/<section>`), `clientKey` (a fresh UUID per open; the server's 24-hour idempotency key), `language` (the app
  language name, the same value the web sends), `platform`. Nothing else — no customer, order or bank record.

## 2. Files

| Platform | File | What |
|---|---|---|
| Server (candidate, **not deployed**) | `functions/lifecycle/feedback.js`, `functions/feedback.js`, `functions/test/qa/feedback.test.js` | `submissionShape` reads `platform` ∈ `web|mac|ios|android` (default `web`; anything else is refused as `platform`); the record stores it instead of the hard-coded `"web"`. Test: the five accepted values + a refused one. Without this deploy a native note is filed as `platform: web` in the admin inbox — see §5. |
| Mac + iOS (one target, one source set) | `EGGcraft/FeedbackCenterView.swift` (new) | `FeedbackCenterModel` (availability with the ten-minute cache, `send`, error mapping, client key) and `FeedbackCenterSheet` (the form + thank-you; cards side by side on the Mac, stacked on the phone; `NDSettings` tokens and `NDChoiceCard` from `SettingsDesignSystem.swift`). |
| | `EGGcraft/ContentView.swift` | `@StateObject feedbackCenter`, `feedbackSheetVisible`; `.sheet` next to the Quick Create sheet; `.task(id: companyId)` asks availability; the avatar-menu button and the iPhone menu row (`text.bubble`); `feedbackPageName`. |
| | `EGGcraft/DilMotoru.swift` | chunk `_make_studioFlowFeatureTranslations_17` (22 keys × 11 languages, generated from the web table `language.ts` "Feedback v1" block; `Sending…` and `You do not have access to this workspace.` completed by hand) + the `.merging` line. Duplicate-key scan over every chunk: 0. |
| Android | `features/feedback/FeedbackDialog.kt` (new) | `FeedbackAvailability` (ten-minute cache), `FeedbackDialog` (Material 3 `AlertDialog` like Quick Create; `NDChoiceCard`/`NDSettings` from `SettingsDesign.kt`), `feedbackErrorText`. |
| | `data/firebase/StudioFlowRepository.kt` | `feedbackAvailable(workspaceId)`, `submitFeedback(...)` → `FeedbackSubmitResult`. |
| | `features/shell/StudioFlowMainScreen.kt` | state + `LaunchedEffect(workspaceId)` + the dialog mount; `feedbackEnabled`/`onSendFeedback` on `StudioLargeTopBar` and `StudioMobileHeader` (defaults keep other callers unchanged); the menu item in both menus (`Icons.Filled.RateReview`). |
| | `language/StudioTranslations.kt` | `TR_FEEDBACK` (the same 22 keys) added to the `TRANSLATIONS` sum. |

## 3. Builds and tests

| Check | Command / file | Result |
|---|---|---|
| Server contract test | `functions/test/qa/feedback.test.js` (worktree, node_modules linked from the main tree) | PASS 16 (the `platform` check inside "the record carries nothing the form did not ask for") |
| Server rules test | `functions/test/qa/feedback-rules.test.mjs` | not run — needs the Firestore emulator (`firebase emulators:exec`); the rules did not change |
| macOS build | `xcodebuild build -project EGGcraft.xcodeproj -scheme EGGcraft -destination 'platform=macOS' -derivedDataPath <scratch>/dd-ios CODE_SIGNING_ALLOWED=NO` | first run **BUILD FAILED** — `@Published` needs `import Combine` in the new file (member-import visibility); fixed; second run **BUILD SUCCEEDED**, exit 0, no warning from `FeedbackCenterView.swift` (log `xcodebuild-mac-feedback-2.log`, 03:11Z) |
| iOS simulator build (the phone branches of the same file) | `… -destination 'generic/platform=iOS Simulator' …` | **BUILD SUCCEEDED**, exit 0 (log `xcodebuild-ios-feedback.log`, 03:14Z) — the `#else` (phone) branches compile too |
| Android Kotlin compile | `JAVA_HOME=<Android Studio JBR> ./gradlew :app:compileDebugKotlin` (worktree needed `local.properties` and `app/google-services.json` copied from the main tree — both git-ignored) | **BUILD SUCCESSFUL** in 3m 22s, exit 0; the only warnings are the pre-existing `Locale` deprecations at `StudioTranslations.kt:23-24` |
| Android debug APK | `./gradlew :app:assembleDebug` | **BUILD SUCCESSFUL** in 1m 22s, exit 0; `app/build/outputs/apk/debug/app-debug.apk` 37.5 MB (03:14Z) — a debug APK, not a release build, not uploaded anywhere |
| DilMotoru duplicate-key scan | python over every `_make_studioFlowFeatureTranslations_N` literal | 0 duplicates (a duplicate aborts the app at launch, not at build) |
| **End-to-end on the emulators (11 Sep 11:04Z)** — the exact requests the native screens send, through the real `submitFeedback`/`getFeedbackPrompt`/`listFeedback`/`getFeedbackDetail` code of this branch, Firestore + Auth + Functions emulators, `functions/.env` = production flags | `docs/onboarding/native-feedback-2026-09-11-raw/native-feedback-emulator.mjs`, output `emulator-run-11-04Z.txt` | availability `enabled: true` (no invitation — `no_first_success`, so the menu entry shows and no card does); **Mac send** → record `platform: mac`, `companyId qa-fb-native`, `page mac/orders`, `language Türkçe`, status new; **Android send** → `platform: android`, `page android/orders`; **web-shaped send without `platform` (today's live web client)** → `platform: web` — the old client's behaviour is unchanged; `platform: windows` → HTTP 400 `Feedback could not be saved: platform.`; **admin inbox** `listFeedback` shows the three rows with `platform` mac / android / web and the workspace name; `getFeedbackDetail` carries `platform: mac`; the owner (not an admin) is refused 403. Nothing else in the record changed (allowed-field test still green). |
| Runtime send from a native app | — | **not done tonight**: a send needs a signed-in session (an unsigned Debug build has no keychain session; the simulator has none); first thing in the morning with the operator's session — see §4/§5 |

## 3a. Scope of the server change, and the old web client

`functions/lifecycle/feedback.js`: `PLATFORMS = ["web","mac","ios","android"]`; `submissionShape` reads `input.platform`
(lower-cased), **empty or absent → `"web"`**, anything else → problem `platform` (refused with the same
`invalid-argument` sentence pattern as the other fields). `functions/feedback.js`: the record's `platform` is
`value.platform` instead of the literal `"web"`. Nothing else: no change to the prompt, dismiss, list, detail or status
callables, the rate limit, the duplicate window, the allowed-field set, the rules or the inbox. The live web client
(`studioflow-web/lib/studioflow/feedback.ts` → `submitFeedback({ companyId, ...input })`) never sends `platform`, so its
records keep `platform: "web"` — proven by the web-shaped send above and by the unit test (`["", undefined] → "web"`).
Deploying this before the native apps ship is safe; deploying the native apps before it is also safe (their notes
would be filed as `web` until the server is updated — the only loss is the label).

## 3c. Deployed — `submitFeedback` only (11 Sep 11:27:57Z)

Approved by the operator 11 Sep ~11:15Z ("yalnız `submitFeedback`"). Merge `fd2a6648` on the deploy branch (normal
merge of `native-feedback-screens`; `functions/` byte-identical to the tested branch `c0deb2ba`; versus the live source
`37025406` only `feedback.js`, `lifecycle/feedback.js` and the test changed; no conflicts; the deploy branch had moved by
docs only). Pre-checks: the eight runbook ancestors present, tree clean, `functions/.env` present (57 lines, unchanged),
`feedback.test.js` green on the merged tree; branch pushed before the deploy.
`firebase deploy --only functions:submitFeedback --project eggcraft-studio` → "Successful update operation", exit 0.
Live: **`submitfeedback-00003-jez`**, 100 % traffic, created 11:27:57Z; previous **`submitfeedback-00002-jih`** (10 Sep
23:42Z, the general-release deploy) retained = the rollback target (`gcloud run services update-traffic submitfeedback
--to-revisions submitfeedback-00002-jih=100 --region europe-west2`). Environment of the new revision: the same names as the previous one plus the lines
added to the shared `functions/.env` since 10 Sep 23:42Z — `NIVADESK_RETENTION_EXCLUDE_WORKSPACES NIVADESK_RETENTION_IN_APP NIVADESK_RETENTION_SWEEP NIVADESK_RETENTION_WORKSPACES` — which are the retention pilot flags
(read only by the retention functions; `submitFeedback` does not read them); the only name present on the old revision and not the new one is `FUNCTION_SIGNATURE_TYPE`, a variable the deploy tooling injects (not in `.env`, not read by our code); no value of ours changed by this deploy. Nothing else deployed: the other five feedback callables,
rules, indexes, `.env` untouched; no store build, no native release. The **iOS** send shape is the same file as the Mac
one (`FeedbackCenterView.swift`, `#else` branch → `platform: "ios"`); the server side of `ios` is covered by the unit
test's accepted-values list (green, not re-run), the emulator run exercised `mac` and `android`.
Still owed: one send from a real native session (the operator's test account on a device/simulator) → inbox row
`platform: mac` — not a blocker for anything else.

## 3d. Real-device check — the Mac app (11 Sep 12:02Z), one message, kept

* **Build:** signed Debug build from the deploy branch at `ff514cf8` (native feedback merged), `xcodebuild … -destination 'platform=macOS'`
  with the normal automatic signing ("Apple Development: Gunes Gocmen", Mac Team Provisioning Profile `uk.co.eggcraft.studioflow`),
  BUILD SUCCEEDED; bundle `uk.co.eggcraft.studioflow` 1.3; launched from the scratch DerivedData (not installed, not a store build).
* **Account and workspace, verified before the send:** the app first opened on the operator's own session (a workspace with
  18 customers / 8 active orders — not the test one); the operator signed out and signed in as **`contact@nivadesk.co.uk`**
  (display name `test_account`); the Home screen then showed the test workspace's content (1 customer "Pilot Check Customer",
  £0 inventory, "Create your first project"), and a read-only Firestore check confirmed `users/GuglEFKS….activeCompanyId =
  GuglEFKSEKNTq1xibFpJav3EWkY2` ("test") and that this workspace's only customer is "Pilot Check Customer". No workspace
  picker appeared (the account owns one workspace).
* **The send:** account (avatar) menu read **Account · Send feedback · Sign Out** — the entry is live in the Mac app. Form:
  Overall = Going well, topic = A suggestion, note exactly `[NATIVE-FEEDBACK-QA] Mac uygulamasından manuel feedback doğrulaması.`
  (zoomed and checked before sending), Send → "Sending…" → thank-you ("Thank you / We read every note …") → Close.
* **Server (read-only):** exactly one record carries the marker across all workspaces — **`fb_uFGXmTi0BxcX`**: `companyId
  GuglEFKSEKNTq1xibFpJav3EWkY2`, `workspaceName test`, `uid GuglEFKS…`, `userEmail contact@nivadesk.co.uk`, **`source in_app`,
  `platform mac`, `trigger manual`**, `campaign ""`, `stage active`, `kind suggestion`, `experience easy`,
  `feedbackType general_feedback`, `page mac/home`, `language English`, `status new`, `createdAtMs 12:02:30.875Z`.
  `feedbackState` of the account: `lastSubmittedAtMs` 12:02:30.875Z, submissions 2 (this one and the 10 Sep pilot note).
  Function log: `submitfeedback` request 200 at 12:02:28Z (a cold start); one **warning** "Failed to validate AppCheck token"
  — the Debug build's App Check token is not a production one, the callable does not enforce App Check, the request succeeded;
  noted, not a defect of the form.
* **Admin inbox (contact@eggcraft.co.uk, /admin → Customer Feedback):** the record is the first row (11 Sept 2026, 13:02 local,
  test, contact@nivadesk.co.uk, the marker text, New). Detail page shows **PAGE `mac/home · mac · English`**, WORKSPACE
  `test (GuglEFKS…)`, TRIGGER Manual. Status set to **Closed** with the internal note "Test tamamlandı — native Mac QA
  (NATIVE-FEEDBACK-QA), 11 Eyl 2026 12:02Z; müşteri talebi değildir, kayıt korunur." → "Saved.", history New 13:02 → Closed
  13:04. Server: `status closed`, `adminNote` as typed, `statusHistory` [new 12:02:30Z by GuglEFKS…, closed 12:04:48Z by the
  admin uid]. **The record is kept.**
* **No side effects:** `submitFeedback` contains no mail or push call (code check: 0 matches for sendMail/messaging/push);
  no new document in any other subcollection of the workspace after 12:02Z; orders 1 / customers 1 before and after; the
  synthetic order `YFFB4Xqi8zSfFgPEN48t` still in the bin (`isDeleted: true`). No store build, no deploy, no store release.
* **Not covered by this check:** iOS and Android. Their evidence stays what §3 says — iOS simulator build + the shared Swift
  code path (`platform: "ios"`), Android compile/assemble + the emulator contract run — no real-device send on either.

## 3b. Release package — as prepared before the deploy (kept for the record)

* **Source:** branch `native-feedback-screens` (code `c0deb2ba`, records on top), from the deploy branch head `37025406`;
  the `functions/` diff against the deploy branch is the three files in §2. Merge into the deploy branch first (normal
  merge, docs included), then deploy from the deploy branch as the runbook requires.
* **Functions, by name — only what changed:** `submitFeedback` (the one function whose behaviour changed; `lifecycle/feedback.js`
  is only required by the six feedback callables, and only `submitFeedback` calls `submissionShape`). The other five
  feedback callables keep their current revisions; their code paths are byte-identical in behaviour. No `.env` change,
  no rules, no index, no secret.
* **Command (from the deploy branch, after the merge, after the runbook pre-checks incl. the Stripe/OpenAI/allowlist/checklist/feedback/activation/retention ancestors):**
  `firebase deploy --only functions:submitFeedback --project eggcraft-studio`
* **Verify live:** one manual send from the web (unchanged client) → inbox row `platform: web`; one from the Mac app once a
  signed-in session exists → `platform: mac`.
* **Rollback:** route `submitfeedback` traffic back to the previous revision (the `-00002-*` revision of the general-release
  deploy; exact name to be read with `gcloud run revisions list --service submitfeedback --region europe-west2` at deploy
  time — tonight's gcloud/firebase credentials had expired, so it was not read) or redeploy `submitFeedback` from `37025406`.
  Records already written with a native platform label stay as they are.
* **Store builds:** not part of this package. The native entry ships with whatever App Store / Play build the operator
  cuts next; nothing here forces one.
* **Blocker for any deploy this morning:** `firebase login --reauth` and `gcloud auth login` on this Mac (both CLIs report
  expired credentials, 11 Sep 11:0xZ) — the operator's sign-in.

## 4. What was deliberately not done

* No automatic invitation on native (no `getFeedbackPrompt` "show" handling, no `dismissFeedbackPrompt`) — the brief said no
  invite expansion; the manual entry is the whole surface.
* No store submission, TestFlight, Play upload or live release; no functions deploy (the `platform` change is a candidate).
* No send from a real native app session tonight — that needs a signed-in device/simulator session; the contract the apps use was exercised end to end on the emulators instead (§3). The next check in the morning is
  one manual note from the Mac app signed in to the test workspace, then the admin inbox row with `platform: mac`
  (only after the server candidate is deployed; before that the row will say `web`).

## 5. Decisions for the morning

1. **Deploy the `platform` server change** (six feedback callables by name, same `.env`) so native notes are labelled
   correctly in the inbox — *recommended*, small, tested; or leave it and accept `web` labels for now.
2. **Which native app ships first with the entry:** the Mac/iOS build is one target (next App Store build carries it);
   Android goes with the next Play build. Both wait for the operator's store cadence — nothing here forces a release.
3. **Verification path before a store build:** one signed-in manual send from the Mac app (test workspace) — operator
   session needed.
