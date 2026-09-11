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
| Runtime send from a native app | — | **not done tonight**: a send needs a signed-in session (an unsigned Debug build has no keychain session; the simulator has none); first thing in the morning with the operator's session — see §4/§5 |

## 4. What was deliberately not done

* No automatic invitation on native (no `getFeedbackPrompt` "show" handling, no `dismissFeedbackPrompt`) — the brief said no
  invite expansion; the manual entry is the whole surface.
* No store submission, TestFlight, Play upload or live release; no functions deploy (the `platform` change is a candidate).
* No emulator/production submission from a native app tonight — a send needs a signed-in session on a device or
  simulator; the form was verified by build only (see §3 for exactly what was built). The next check in the morning is
  one manual note from the Mac app signed in to the test workspace, then the admin inbox row with `platform: mac`
  (only after the server candidate is deployed; before that the row will say `web`).

## 5. Decisions for the morning

1. **Deploy the `platform` server change** (six feedback callables by name, same `.env`) so native notes are labelled
   correctly in the inbox — *recommended*, small, tested; or leave it and accept `web` labels for now.
2. **Which native app ships first with the entry:** the Mac/iOS build is one target (next App Store build carries it);
   Android goes with the next Play build. Both wait for the operator's store cadence — nothing here forces a release.
3. **Verification path before a store build:** one signed-in manual send from the Mac app (test workspace) — operator
   session needed.
