# eBay presentation fix — the five-platform record (11 Sep 2026)

Candidate branch `ebay-availability-fix` (worktree `~/Developer/studioflow-ebay-availability`), code commit **`8f63e803`**, CI `functions-tests` **success** (run 346051). Not deployed, not released, nothing uploaded. Approved scope (operator, 11 Sep ≈13:2xZ): add a workspace-availability field to `getEbayConnections` that shares the connect gate's decision, align native screens/hubs and web/mobile web, verify allowed / denied / connected workspaces with owner and member, phone flows beyond the login screen on local emulators first. Pilot workspace `GuglEFKS…` and `review@nivadesk.app` untouched (every account below is emulator-only).

## 1. What changed (product)

| Layer | Change |
|---|---|
| Server `functions/ebayConnector.js` | `getEbayConnections` returns `workspaceEnabled = connectorOn() && configured() && providerFlagOn() && workspaceEnabled(flags, "connectors", "ebay", companyId)` — the same four gates `beginEbayConnect` applies. `configured` keeps its meaning (keys present). The server stays the authority; the field only tells the client what the gate will answer. |
| Web `studioflow-web` | `lib/studioflow/ebay.ts` reads the field (absent → `true`); `EbayIntegrationSection.tsx` shows the "eBay is not available for this workspace yet." card instead of Connect; `integrations.ts` marks the hub card `planned` when the field is false and no live connection exists. Eleven languages. |
| Mac/iPhone `EGGcraft` | `EbayIntegration.swift` tuple gains `workspaceEnabled` (default `true`); `EbayIntegrationView.swift` not-available card before Connect; `NivaDeskIntegrations.swift` hub `.planned` when 0 connections and not enabled; `AyarlarView.swift` fills the signal from the callable; string in `DilMotoru.swift`. |
| Android | `StudioFlowRepository.kt` `workspaceEnabled` in `EbayConnectionsResult`; `SettingsScreen.kt` card before Connect + hub signal; `IntegrationsHub.kt` `Planned` when not enabled; `StudioTranslations.kt`. |
| Tests | `commerce-ebay-wiring.test.js` +1 (15), new `ebay-availability-mirrors.test.js` (4 text pins across server/web/Swift/Android), Android `IntegrationsHubStateTest` +2 (5), unit suite green. Web `tsc --noEmit` exit 0. |

**Old clients ignore the new field.** Every client reads it with a default of `true`, so an older store build against the new server behaves exactly as before (shows Available; the server still refuses `beginEbayConnect` with "eBay is not enabled for this workspace yet."). An older server (field absent) leaves the new clients on the previous behaviour. Nothing else in the response changed.

## 2. Server matrix (emulator, callable level) — `ebay-availability-emulator-2.out`

| Workspace / role | `getEbayConnections` | `beginEbayConnect` |
|---|---|---|
| allowed / owner | 200 configured true, **workspaceEnabled true**, connections 0 | 200 (state, scopes, startUrl) |
| allowed / member | 200 workspaceEnabled true | 403 "Only the workspace owner can run this billing action." |
| denied / owner | 200 configured true, **workspaceEnabled false** | 400 "eBay is not enabled for this workspace yet." |
| denied / member | 200 workspaceEnabled false | 403 owner-only |
| connected / owner | 200 workspaceEnabled true, connections 1 | 200 |
| connected / member | 200 workspaceEnabled true, connections 1 | 403 owner-only |

Emulator flags: `appConfig/commerce.connectors = { providers: { ebay: true }, workspaces: { "ebay:qa-ebay-allowed": true, "ebay:qa-ebay-connected": true } }`; `.secret.local` in the worktree carries a dummy `EBAY_CLIENT_ID` so `configured()` is true in the emulator only. Accounts: `qa-ebay-<allowed|denied|connected>-<owner|member>@nivadesk.app` (Auth emulator, password sign-in and custom tokens), `review@nivadesk.app` = `qa-review-uid` in the emulator only (workspace `qa-workspace`, not flagged → denied).

## 3. The five-platform matrix (evidence vocabulary: `docs/release-checklist-platforms.md`)

Builds under test: Mac/iOS Debug builds of `8f63e803` from the worktree (`xcodebuild-mac-ebayfix.log`, `xcodebuild-ios-ebayfix.log`, both BUILD SUCCEEDED; Info.plist 1.3 (17), version bump is part of the store package, not this record); iOS simulator build signed ad-hoc (simulator-only, not a distribution package); Android `assembleDebug` APK of the same commit (37.5 MB). Web: the worktree's dev server on port 3100 with `NEXT_PUBLIC_FIREBASE_EMULATOR=1`, reached as `localhost` (Android via `adb reverse`, iOS Simulator Safari directly). Screenshots: `ebay-availability-fix-2026-09-11-raw/screenshots/`.

| Platform | Affected? (why) | Evidence type | What was run (account / workspace / steps) | Result | Missing |
|---|---|---|---|---|---|
| macOS app | yes — hub card state + eBay screen | **build + local run on this Mac** against the emulators (Debug build of `8f63e803`, launched with the emulator env; background UI automation) | `qa-review-uid` / `qa-workspace` (denied): Settings → Integrations; `qa-ebay-allowed-owner`: Settings → Integrations → eBay Set up; `qa-ebay-connected-owner`: Settings → Integrations → eBay Manage | denied: eBay **Coming soon**, card inert. allowed: **Available → Set up → "Connect your eBay account" section with Connect eBay** (not clicked). connected: **Connected · Manage → `qa_seller` · Sandbox · Read only** panel (Check/Sync not clicked). Screenshot 15. | not a signed distribution build; the not-available card *inside* the section is unreachable on Mac by design (no Set up when denied) — covered by the text-pin test |
| iOS app | yes — same Swift code, phone layout | **simulator (iPhone 17 Pro, iOS 26)** — ad-hoc simulator build of `8f63e803`, launched with the emulator env; Face ID gate passed with the simulator's match event | `qa-ebay-denied-owner`: menu → Settings → search "Integrations" → hub → search "eBay" → tap card; `qa-ebay-allowed-owner`: same path → Set up; `qa-ebay-connected-owner`: same path → Manage | denied: **Coming soon**, tap inert (08). allowed: **Available → Set up → Connect your eBay account / Connect eBay** (09, 10). connected: **Connected · 1 connected → Manage → qa_seller · Sandbox · Read only** (11, 12). | physical iPhone; TestFlight/App Store build; soft keyboard not shown in the simulator (hardware keyboard), so keyboard-open usability is unobserved on iOS |
| Android app | yes — hub card state + eBay screen | **emulator (AVD Pixel_9)** — `assembleDebug` APK of `8f63e803`, emulator marker file | `qa-review-uid` (denied): Settings → Integrations; `qa-ebay-allowed-owner`: hub → Set up → Connect screen; `qa-ebay-connected-owner`: hub | denied: **Coming soon** (01). allowed: **Available / Set up → Connect eBay screen** (02, 03). connected: **Connected · qa_seller · Sandbox · Manage** (04). Earlier in the same session on this build: sign-in, wizard → Orders, Quick Create with the keyboard open, project persisted after force-stop and relaunch. | physical Android phone; Play build; member role on the phone (server matrix only) |
| iPhone Safari | yes — web section + hub (mobile layout) | **iOS Simulator Safari** against the worktree web dev server (emulator mode) | `qa-ebay-allowed-owner@nivadesk.app` password sign-in → `/settings?section=integrations&ebay=1`; `qa-ebay-denied-owner@nivadesk.app` in a fresh tab → sign-in → Settings → Integrations → search "eBay" | allowed: **"Connect your eBay account" section with Connect eBay** (13). denied: eBay listed under **"Coming soon — Not connectable yet"** as an inert chip (14). | physical iPhone; see §4 for the layout defects seen while driving this |
| Android Chrome | yes — same web | **AVD Pixel_9 Chrome** via `adb reverse` to the same dev server | allowed owner: sign-in with the keyboard open → Settings → Integrations → eBay → Set up; sign out; denied owner: hub | allowed: **Available → Set up → Connect section** (05, 06). denied: **Coming soon** inert chip (07). | physical Android phone; see §4 |

Nothing above is a store build, a physical device, or a production deploy. "Simulator/emulator" and "local Mac run" are the only evidence types in this record.

## 4. Defects and observations found while driving the flows (not part of this fix)

1. **iPhone Safari — content shifts/clips horizontally when a field is focused.** With the settings search or the hub search focused, the page becomes wider than the viewport and the content shifts left; headers and the left edge of cards clip (visible in 13/14). Reproduced on `/settings` and on the Integrations hub. Reported earlier today on the native-store package; confirmed again here.
2. **iPhone Safari — the navigation drawer's lower items are unreachable.** The hamburger drawer is taller than the 402 pt viewport and does not scroll on its own; a drag scrolls the page behind it, so *Settings* and *Sign out* at the bottom cannot be reached. Sign-out for the second account was only possible by opening a new tab. Needs its own fix.
3. **Android Chrome — hub layout.** Category badge overlaps the card title; the filter chips stack vertically (reported earlier today, still present).
4. **Native hubs show "Available" for about a second before the server signal arrives.** `NivaDeskIntegrationSignals.ebayWorkspaceEnabled` (Swift) and `ebayResult?.workspaceEnabled ?: true` (Android) default to `true` until `getEbayConnections` returns, so a denied workspace sees the card flip Available → Coming soon on first open. Harmless (the server still refuses), but if the flash matters the default for the *unknown* state should be `planned` until the signal lands — a follow-up, not changed here.
5. **Native workspace resolution falls back to the personal workspace on any read error and persists it.** `AuthViewModel.resolveActiveCompany` → `validateCompanyAccess` treats *any* `companies/<id>` read failure as "no access" and `activateCompany` then writes `users/<uid>.activeCompanyId = uid`. Seen twice with emulator token launches (Mac 14:28Z for the connected owner, iOS 14:42Z for the allowed owner; Firestore `updatedAt` stamps): the user landed in a fresh personal workspace with the first-run wizard, and the real workspace id had been overwritten. Restored by hand in the emulator (`activeCompanyId` back to the workspace; `memberUids` added to `companies/qa-ebay-connected`). A transient permission or network error at launch could do the same to a real user; worth a separate item (fail closed to "keep the stored id, show the loading state", not "switch and persist").
6. **Emulator note.** The Auth emulator lost the password accounts mid-session (`EMAIL_NOT_FOUND` on sign-in while `getUser` still found the uids); passwords were re-set with a small admin script and custom tokens regenerated (emulator-only users, nothing outside the emulator).
7. The iOS hub card for a `planned` provider has empty space under the badge (no description shown) — cosmetic, present before this fix.

## 5. Left out and why

* Physical iPhone / Android phone runs: no device available to this session; the release checklist lists them as required store-gate evidence.
* Member role on phones: the server matrix proves the member answer (403 owner-only on begin); the hub/section for members was not driven on iOS/Android in this pass.
* The Mac not-available card inside the eBay section: unreachable in the product when denied (no Set up), so only the mirror text test covers it.
* No deploy of `getEbayConnections`, no store upload, no Submit. The package for those is `docs/onboarding/native-store-package-2026-09-11.md` §5 plus this record.

## 6. Timeline (UTC, 11 Sep)

13:3x emulator seed (three eBay workspaces, owner/member users) and server matrix (`ebay-availability-emulator-2.out` 13:34Z) · 13:37–13:47 Android app flows · 13:48–14:03 Android Chrome flows · 14:0x–14:16 iOS app flows (QA account) and iPhone Safari allowed owner · 14:1x Mac denied + allowed · 14:2x–15:00 Mac connected (blocked twice by the persisted-fallback workspace, §4.5, then verified), iPhone Safari denied, iOS denied/allowed/connected (last captures 15:00Z) · 15:0x record written.
