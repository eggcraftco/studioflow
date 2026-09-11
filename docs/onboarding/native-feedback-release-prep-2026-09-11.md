# iOS / Android — remaining device checks and store-release preparation (11 Sep 2026, 12:53Z)

Prepared while the retention pilot waits for its 12 Sep ≈12:20Z acceptance. **Nothing here was executed against a store or
a live user: no feedback sent, no archive uploaded, no Play track touched.** The Mac real-device check is done (native
feedback record §3d); this page is about the two platforms that only have build/emulator evidence.

## 1. Candidate commit and what the next store builds would carry

* **Source:** the deploy branch at **`ff514cf8`** (native feedback merged at `fd2a6648`, funnel at `ff514cf8`; later commits are
  docs only). App sources on that tree = the candidate for both stores. Nothing native has changed since `c0deb2ba`.
* **Versions as they stand in the tree (not bumped — the bump is part of the release, not of this preparation):**
  iOS/macOS `MARKETING_VERSION 1.3`, `CURRENT_PROJECT_VERSION 17` — the same 1.3 (17) that went to App Store review on 22 Aug,
  so a new submission needs **1.4 (18)** or at least build 18; Android `versionName 0.1.9`, `versionCode 10` (already ahead
  of the 0.1.8 the store has, so no bump strictly required — decide with the release).
* **What goes into the release (app-source commits since the 22 Aug store builds: 232 touching `EGGcraft/`, 206 touching
  `studioflow-android/`), grouped:**
  - Native feedback screens — "Send feedback" in every account menu + the short form (this work; `c0deb2ba`).
  - Onboarding: the wizard remembers its place / survives the app closing, the workspace's own checklist with opening steps,
    "a shell is not a first project" (v2.1) — 8, 10 Sep.
  - eBay screens on Mac/iPhone/Android in twelve languages, "Coming soon" removed, the card promising only what is imported — 6 Sep.
  - Marketplace/engine: Amazon/eBay pure half, engine v4 (tax responsibility, refund not taken off twice), engine mirrors on
    all three clients held to the server's vectors, VAT settings reaching the clients, commission from the shop — 3–4 Sep.
  - Quick Create on all four platforms (and its bad-connection/refused/deleted handling) — 3 Sep.
  - Settings redesign (shell, Branding, Financial, PDF Export, Customer SMS, Preferences/About) on Mac, iPhone, Android — 3 Sep.
  - Seats: who has a seat and who only has a history — 3 Sep.
  - Audit fixes: a sign-in screen you can get back into, merge-not-replace saves, sign-out takes the account's data with it,
    the fourteen-day trial on native sign-up, the new wording in eleven languages — 3 Sep.
  - Order card refunds and the bank-row release; the "Syncing…" duplicate-key launch abort fixed — 2 Sep.
  - Earlier (22 Aug–2 Sep): banking parity, inventory phases, invoice/VAT, home screen, production board, etc. — already in
    the 1.3 line's later commits; see `git log --since=2026-08-22 -- EGGcraft studioflow-android`.
  - **Known-fixed-since-store item to call out in release notes:** the Etsy Mac save that dropped the source (merge write since 2 Sep).

## 2. Existing test evidence, per platform (nothing re-run here)

| Platform | Build | Contract / behaviour | Real device |
|---|---|---|---|
| Mac | signed Debug BUILD SUCCEEDED (11 Sep) | — | **done**: `fb_uFGXmTi0BxcX`, platform mac, closed (§3d) |
| iOS | simulator BUILD SUCCEEDED (worktree, 03:2xZ); **ad-hoc-signed simulator build from the deploy branch BUILD SUCCEEDED (12:58Z; `Signature=adhoc`, bundle `uk.co.eggcraft.studioflow`, ready to install on "iPhone 17 Pro")** | same Swift file as Mac, `#else` branch → `platform: "ios"`; server accepts `ios` (unit test) | **not done** |
| Android | compileDebugKotlin + assembleDebug BUILD SUCCESSFUL (03:2xZ, debug APK 37.5 MB) | emulator run 11:04Z: android send → record `platform android` → inbox row | **not done** |

## 3. The remaining device checks — steps, and what is yours

**Rule until the pilot acceptance is done:** no feedback send from the pilot account (`contact@nivadesk.co.uk`) on any
platform — every send moves the retention hold by 24 hours. So the iOS/Android sends happen **after** the 12 Sep ≈12:20Z
acceptance (recommended, same test account, one message each, same marker style `[NATIVE-FEEDBACK-QA] …`), or earlier only
from a different account you name (the EGGcraft workspace is real business data; one QA record there was tolerated on 10 Sep —
your call, not assumed).

*iOS (simulator "iPhone 17 Pro", ad-hoc signed so Firebase Auth's keychain works):*
1. I install and launch the ad-hoc build in the simulator and open the live panel.
2. **You** sign in as the test account in the simulator (credentials are yours; I type none).
3. I verify the workspace shown, open the account menu → Send feedback, send one marked message, read the record
   (`platform: ios`, `page ios/<tab>`), find it in the admin inbox, close it with a test note; counts before/after.

*Android (AVD `Pixel_9` exists; `app-debug.apk` from the worktree build, or a fresh one from the deploy branch):*
1. I boot the emulator, install the debug APK, launch it.
2. **You** sign in as the test account.
3. Same send/verify/close sequence; record shows `platform: android`, `page android/<section>`.

## 4. Store-release preparation — what is ready, what needs you

* **Apple (App Store Connect):** archive needs the **distribution** signing identity and an App Store Connect session — the
  Mac has "Apple Development: Gunes Gocmen"; whether a distribution certificate/profile is present was not checked (it would
  be checked at archive time with `xcodebuild -exportArchive`). Steps when you say go: bump to 1.4 (18), `xcodebuild archive`
  for iOS and macOS, export, upload (Transporter or `xcrun altool`/notarytool as configured), then the ASC submission with the
  release notes above and the 12-language screenshots pipeline already in place (memory: store-screenshots-pipeline). **Your
  part:** the ASC sign-in, the review-notes/contact fields, and pressing Submit.
* **Google Play:** `./gradlew :app:bundleRelease` needs the upload keystore + its passwords (not in the repo, never in this
  session); Play Console upload and rollout are yours. versionCode 10 / 0.1.9 already exceed the store's 0.1.8.
* **Not part of any release:** the retention e-mail stage (server only), the OpenAI/Stripe/eBay/Google threads.

## 5. Decisions / steps that are yours
1. When: iOS/Android device sends after the 12 Sep acceptance from the test account (recommended), or now from an account you name.
2. Version bump: 1.4 (18) for Apple; keep 0.1.9 (10) or bump for Android.
3. Sign-ins: test account in the simulator/emulator; ASC and Play Console for the uploads; distribution keys.
