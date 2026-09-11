# Native store packages — one per platform (11 Sep 2026, 13:14Z; supersedes the release-prep note of 12:5xZ)

Nothing here was uploaded, submitted or deployed. No feedback was sent from the pilot account. Read-only checks only.

## 0. Evidence vocabulary used below

| Word | Means exactly |
|---|---|
| **build** | `xcodebuild build` / `gradlew assembleDebug` finished with BUILD SUCCEEDED / SUCCESSFUL — compiles and links, proves nothing at runtime |
| **simulator / emulator flow** | the app run in the iOS Simulator or an Android AVD with a signed-in session and a user action observed |
| **physical device test** | the app run on real hardware (the Mac app counts: it ran on this Mac with the real Firebase backend) |
| **unit test** | code-level test run by the toolchain (`gradlew testDebugUnitTest`; the Xcode project has **no** test target) |
| **distribution package** | an App Store archive / signed AAB produced with the distribution identity or the upload keystore — **none exists for this candidate** |
| "ad-hoc-signed simulator build" (earlier wording) | a **simulator-only** build code-signed with the identity `-` (`Signature=adhoc`) so Firebase Auth's keychain works in the Simulator; it is **not** installable on a physical iPhone and **not** a distribution package |

## 1. Real product diff (merge and docs commits excluded; app source only)

| Platform | Last store version → its commit | Candidate | Non-merge app-source commits | Files / lines |
|---|---|---|---|---|
| iOS + macOS (one target) | 1.3 (build 17), App Store review 22 Aug → `ad79d3da` | deploy branch `ff514cf8` (app sources unchanged since `c0deb2ba`) | 231 | 62 files, +38,244 / −2,379 |
| Android | 0.1.8 (versionCode 9), store → `0563fc9c` (18 Aug); a **0.1.9 (versionCode 10)** signed AAB was built 31 Aug (`3391e0a0`; `app-release.aab` 25.5 MB still on disk) — whether it was uploaded to Play is **unconfirmed** (needs the Play Console, see §5) | `ff514cf8` | 210 since 0.1.8 / 61 since the 0.1.9 package | 76 files, +35,856 / −1,991 since 0.1.8 (51 files, +9,200 / −1,151 since 0.1.9) |

**User-visible changes and their server dependencies** (both platforms unless noted; every callable the apps newly call
exists live — 33 new names on iOS/Mac, 32 on Android, checked against the 446 live functions, none missing):

| Area (date) | What the user sees | Server side it needs — state |
|---|---|---|
| Send feedback (11 Sep) | "Send feedback" in the account menu, the short form, thank-you | `getFeedbackPrompt`, `submitFeedback` — live for every workspace; `platform` accepted since `submitfeedback-00003-jez` |
| Onboarding & checklist (8–10 Sep) | wizard resumes where it was (Apple) / survives closing (Android); the workspace's own checklist with opening steps; "a shell is not a first project" | `getSetupChecklist` (v2.1, live 10 Sep), settings stamps — live |
| eBay screens (6 Sep) | eBay card no longer "Coming soon"; the eBay screen (12 languages) with Connect, marketplaces, sync health | `getEbayConnections`, `beginEbayConnect`, `verifyEbayConnection`, `updateEbayConnectionSettings`, `disconnectEbay…` — live; **connect is gated per workspace on the server** (§2) |
| Marketplace/engine (3–4 Sep) | totals, VAT and refunds computed exactly like the server (engine v4 mirrors), tax responsibility, commission shown from the shop | engine version stamps on orders (server live since 3–4 Sep); no new callable |
| Quick Create (3 Sep) | "+ Add Project" mini form on every platform; survives bad connection / refused create / delete | `quickCreateOrder` + project number counter — live |
| Settings redesign (3 Sep) | Branding, Financial, PDF Export, Customer SMS, Preferences/About in the new layout | settings callables — live |
| Seats (3 Sep) | who has a seat vs history only; suspended members | `suspendedMembers` fields — live |
| Sign-in fixes (3 Sep) | a sign-in screen you can get back into (Forgot password), sign-out clears the account's local data, 14-day trial on native sign-up | trial stamp (Stripe L1 fix live 10 Sep) — live |
| Saves (3 Sep) | order/customer saves merge instead of replacing; offline copy carries the whole order | rules — live |
| Refunds on the order card (2 Sep) | refund entries, bank row released | server live |
| Etsy Mac save fix (2 Sep) | the Etsy source panel survives a Mac save (was dropped in the 1.3 store build) | none |
| Everything 22 Aug–2 Sep (banking parity, inventory, invoice/VAT, home, production…) | already listed in DURUM.md per feature | live |

## 2. Features that are gated — what a non-pilot workspace sees

* **eBay.** Server `beginEbayConnect` refuses any workspace that is not on the per-workspace flag ("eBay is not enabled for
  this workspace yet." — `failed-precondition`), and the connector itself runs in **sandbox** (`NIVADESK_EBAY_ENVIRONMENT=sandbox`)
  for the one allow-listed test workspace. But `getEbayConnections` answers every workspace with `configured: true`, so the
  native eBay screen shows the **Connect** button to everyone and the Integrations hub marks eBay **"available"** when a
  workspace has no connection; a user who taps Connect sees the server's refusal text. **Finding:** the gate holds (nothing
  can be connected), but the feature is *presented* as available. Two ways to close it, neither done: (a) server —
  `getEbayConnections` also returns `enabledForWorkspace` (the same flag `beginEbayConnect` checks) and the native hub/screen
  render "Not available for this workspace yet" when false (one function + a small client change → it would have to ride
  this release); (b) accept the refusal message for this release and note it in the review notes. **Recommended: (a) before
  the store build** — it is the one item that presents a closed feature as usable.
* **Amazon.** Catalogue entry `kind: "planned"` on both platforms → shown as coming soon, no action. Correct.
* **Retention e-mail / IMAP.** Server only, flags off; the native apps have no surface. Nothing to gate.
* **Retention in-app card.** The native apps have **no** retention reader (web only); pilot unaffected by the release.
* **WooCommerce / Square / Etsy / PayPal.** Live connectors; the hub reads real status. Woo was "planned" in the hub earlier
  and is live server-side since 2 Sep — the native catalogue state is whatever `IntegrationsHubStateTest` pins (3 tests green).

## 3. Tests against the product diff

Evidence mapped from the records (docs/, since the 22 Aug store build) and completed **only where a concrete gap could be
closed without a signed-in session** (13:16Z). "Build" rows are not runtime evidence.

| Flow in the product diff | Existing evidence (type, date, outcome) | Gap | Done now |
|---|---|---|---|
| Sign-in / sign-out / workspace | **physical device (Mac)** 11 Sep: sign-out → sign-in as the test account, workspace verified — pass; iPhone **simulator** sign-in 3 Sep (Settings walk) — pass | native sign-up + trial, multi-workspace picker, iOS/Android sign-in on the candidate: **no run** | needs your session (§5) |
| Order create / edit (Quick Create, merge saves, offline queue) | server transaction test + code review (3 Sep); `QuickCreateDatesTest` (Android unit) | no native runtime run on any platform | Android unit: **`QuickCreateDatesTest` 4/4** on `ff514cf8`; runtime needs a session **on a non-pilot workspace** (an order in the pilot workspace would remove the card the 12 Sep acceptance waits for) |
| Onboarding wizard + checklist | builds only (9–11 Sep); web scenarios A–K (browser); `OnboardingProgressTest` (Android unit, never recorded) | no native runtime run | Android unit: **`OnboardingProgressTest` 15/15**; runtime needs a session (a fresh throwaway workspace, not the pilot) |
| Plan / seat display, Settings redesign | iPhone **simulator** Settings walk 3 Sep — pass; seats: rules-emulator tests (server) | seat display on native never observed; Mac/Android Settings not visually checked | needs a session |
| Data preserved when updating from the store version | **no migration note, no upgrade test on any platform** | the whole item | **prepared**: the old store commits are being built for the Simulator (1.3 (17), `ad79d3da`) and the AVD (0.1.8, `0563fc9c`) so an install-old → sign in → install-new-over-it check can run on your word; **both built 13:20Z**: old iOS 1.3 (17) simulator app from `ad79d3da` BUILD SUCCEEDED (Info.plist 1.3 / 17, `Signature=adhoc`, simulator-only), old Android 0.1.8 debug APK from `0563fc9c` BUILD SUCCESSFUL (33.8 MB); the new builds are kept beside them (`sim-new/NivaDesk.app`, the 11 Sep `app-debug.apk`) |
| eBay / Etsy / Woo / Square screens, no-connection state | design + "compiles" claims; the 6 Sep gate says it ran no native build; `IntegrationsHubStateTest`/`EbayIntegrationCardTest` never recorded | native no-connection state never observed | Android unit: **`IntegrationsHubStateTest` 3/3, `EbayIntegrationCardTest` 5/5** on `ff514cf8` (pin the available/connected/attention states and the eBay card); Swift side: code read (§2) — no runtime |
| Finance engine mirrors | Swift + Kotlin vectors 3–4 Sep (19→23→36, agreeing), not re-run since | not run on the candidate | **re-run on `ff514cf8`: Swift mirror 36/36 (`scripts/check-finance-vectors-swift.sh`), Kotlin `FinanceEngineVectorsTest` 4 classes green** |
| Send feedback | Mac physical device 11 Sep; emulator **contract** run (a Node script against the Firebase emulators — not the Android app on an AVD) | iOS/Android app runs | after 12 Sep 12:20Z (pilot account) or now on another account |

**Android unit suite on the candidate (`./gradlew :app:testDebugUnitTest`, BUILD SUCCESSFUL in 5m 42s, exit 0):** 33 tests,
0 failures — HomeGridLayout 2, OnboardingProgress 15, QuickCreateDates 4, EbayIntegrationCard 5, IntegrationsHubState 3,
FinanceEngineVectors 4. **Xcode:** the project has no test target; the Swift finance mirror is the one scripted check (36 vectors, green).

**Runtime checks that need your session (listed, not run):** simulator "iPhone 17 Pro" and AVD `Pixel_9`, in this order per
platform — (1) install the OLD store build, sign in (an account that is not the pilot's), set a card layout/preference, queue
one offline edit if the build allows; (2) install the NEW build over it (same bundle id; simctl/adb keep app data); (3)
verify the session, layout and queued edit survived; (4) sign-up path with a fresh throwaway account (trial shown, wizard
resume after closing the app, checklist opens its steps); (5) Quick Create + edit on that throwaway workspace; (6) seats and
Settings screens; (7) the eBay screen and hub as a non-pilot workspace (expect "not enabled for this workspace" on Connect,
or the §2a change); (8) one feedback send — only after 12 Sep 12:20Z if the pilot account is used.

## 4. Versions and signing — verified on this Mac (values never printed)

| | Apple | Android |
|---|---|---|
| Version in tree | `MARKETING_VERSION 1.3`, `CURRENT_PROJECT_VERSION 17` = the build already in review since 22 Aug | `versionName 0.1.9`, `versionCode 10` |
| Recommended | **1.4 (18)** — must exceed 17; 1.4 fits the "1.4/0.1.9 package" already named in DURUM.md | keep **0.1.9 (10)** if the 31 Aug AAB was never uploaded; **0.2.0 (11)** if versionCode 10 is already in Play (Play rejects a reused code). Decided in the Play Console — see §5 |
| Store record check | **not possible from this session**: App Store Connect requires sign-in (the Chrome session is not signed in) | **not possible**: the Chrome Google session (gunes.gocmen@gmail.com) has no Play developer account — the console belongs to another Google identity |
| Signing identity | only **"Apple Development: Gunes Gocmen (2LQR97TM64)"**, team `5QG48AF86V`, automatic signing; **no Apple Distribution identity on this Mac** → an App Store archive cannot be exported here until Xcode (signed in with the developer Apple ID) creates/downloads it — an *access* gap, not necessarily a missing certificate in the account | upload keystore **present**: `~/nivadesk-upload.jks` (7 Jun) + `studioflow-android/keystore.properties` (git-ignored) → `bundleRelease` can sign here |
| Profiles | 11 Xcode-managed development profiles; none for distribution | n/a |
| Build products on disk | signed Debug macOS app (real device test done); simulator-only ad-hoc build (iPhone 17 Pro) | debug APK (11 Sep); the 31 Aug 0.1.9 release AAB |

## 5. The package per platform

### iOS + macOS (one Xcode target, one submission each)
* **Source:** deploy branch `ff514cf8` (tag it at release time). **Scope:** §1 (231 commits, 62 files) — everything since 1.3 (17).
* **Before the archive (recommended):** the eBay availability change (§2a) or the review-note alternative — your call.
* **Tests present / missing:** §3. **Missing and recommended before submit:** the iPhone simulator flow (sign-in as the test
  account, workspace, one order create/edit, checklist, one feedback send **after 12 Sep 12:20Z**) — the simulator build is ready to install.
* **Version:** 1.4 (18). **Signing:** needs the Distribution identity → **your Xcode sign-in** (Xcode → Settings → Accounts → the developer Apple ID → Manage Certificates), then `xcodebuild archive` + export for iOS and for macOS, upload, ASC submission (screenshots pipeline already in place).
* **Your steps:** confirm 1.4 (18) in ASC (no build 18 exists yet), sign in to Xcode/ASC, decide §2a, press Submit.

### Android
* **Source:** `ff514cf8`. **Scope:** §1 (210 commits since the store's 0.1.8; 61 since the 0.1.9 package).
* **Tests present / missing:** §3 + the unit suite (33 tests green, below). **Missing and recommended:** the Pixel_9 emulator flow (same list as iOS) — the debug APK is ready.
* **Version:** 0.1.9 (10) or 0.2.0 (11) — decided by what Play already holds.
* **Signing:** `./gradlew :app:bundleRelease` signs with the local keystore — can run here on your word; the **upload** and the release track are yours in the Play Console (the developer account is not the Google identity signed in on this Mac's Chrome).
* **Your steps:** tell me the Play state of versionCode 10, decide §2a, then upload/rollout.
