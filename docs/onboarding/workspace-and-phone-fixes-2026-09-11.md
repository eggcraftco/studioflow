# Workspace resolution, hub "Available" flash and phone-web layout — the record (11 Sep 2026)

Branch `ebay-availability-fix` (worktree `~/Developer/studioflow-ebay-availability`), on top of the eBay presentation candidate `8f63e803` / record `fc871006`. Commits, in order: **`8b1aadfb`** workspace resolution · **`0fed01cf`** hub tri-state · **`dd0c5283`** phone web layout · **`d92ca028`** CI pin. CI `functions-tests` **success** on `d92ca028` (the run on `dd0c5283` failed on the old shipped-web pin, fixed by the last commit). No deploy, no store upload, no Submit. Retention pilot workspace, `review@nivadesk.app` and production data untouched — every account below is an emulator-only QA account.

## 1. Workspace resolution (priority)

### Where the fault was, per platform and store version

| Platform | Source before this fix | In the last store build? |
|---|---|---|
| Mac/iPhone (`EGGcraft/AuthViewModel.swift`) | `resolveActiveCompany` ignored the `users/{uid}` read error and `validateCompanyAccess` answered `false` for *any* `companies/{id}` read error; `activateCompany` then wrote `activeCompanyId = uid`. The 8-second offline net also opened the personal workspace on an empty cache and wrote it. | **Yes** — byte-identical in iOS/Mac **1.3 (17)** (`ad79d3da`, `resolveActiveCompany` 2518–2531, `activateCompany` write at 2570, `validateCompanyAccess` 3069–3113). |
| Android (`StudioFlowRepository.kt`) | `loadWorkspace` treated an empty or cache-only user doc as "personal" and a missing/cache-miss company doc as "personal"; `ensureWorkspaceForUser` wrote `activeCompanyId = uid` whenever the read came back blank (fire-and-forget, so an offline read could be committed later). | **Yes** — identical in **0.1.8** (`0563fc9c`, `loadWorkspace` 180–190, `ensureWorkspaceForUser` 318–322). |
| Web (`lib/studioflow/firestore.ts`) | `loadWorkspaceContext` fell back to the personal workspace *in memory* on a refused/missing read; it never wrote. `AuthProvider.ensurePersonalWorkspace` writes only after a successful read. | Live web has the in-memory fallback (wrong workspace shown for that page load), no persistence. |

Observed on the emulators (record `fc871006` §4.5): Mac 14:28Z and iOS 14:42Z, both rewrote `activeCompanyId` to the uid after a transient read failure. Not observed on real users; the code path is the same in the shipped builds.

### What changed

One pure decision, mirrored three times and tested deterministically (same scenarios in each):

| Client | Decision module | Test | Result |
|---|---|---|---|
| Mac/iPhone | `EGGcraft/WorkspaceResolution.swift` | `scripts/check-workspace-resolution-swift.sh` (swiftc, no Firebase) | 16 checks pass |
| Android | `data/firebase/WorkspaceResolution.kt` | `WorkspaceResolutionTest` (JUnit) | 8 tests pass; full unit suite 44/0 |
| Web | `lib/studioflow/workspaceResolution.ts` | `npm run test:workspace` (`scripts/check-workspace-resolution.mjs`) | 12 checks pass |

Rules: a failed or cache-only read of the stored pointer → **retry** (nothing activated, nothing written); the stored workspace unreadable (network/cache) → **retry**; the server confirming no role, a missing document or a refused read (`permission-denied`) → **access lost**: the app shows it and the person chooses Retry or "Use my own workspace" — nothing switches on its own; only a server-confirmed *empty* stored value (first setup) records the personal workspace; reopening a stored workspace never writes; an explicit switch/join keeps writing as before; a late result from an earlier account or bootstrap generation is dropped.

The five required scenarios, each covered by the deterministic tests **and** run on the emulators (screenshots in `workspace-and-phone-fixes-2026-09-11-raw/screenshots/`):

| Scenario | Deterministic test | Runtime evidence |
|---|---|---|
| Read error → active workspace and business data unchanged | Swift 1–4, Kotlin `aFailedStoredReadChangesNothing`/`anUnavailableWorkspaceRead…`, web 1–3 | `users/qa-ebay-allowed-owner.activeCompanyId` pointed at `qa-ebay-denied` (unreadable for that owner): Mac (01), iOS (03), Android (05) and iPhone Safari web (07) all showed "Workspace not opened … access changed" with Retry; the stored value stayed `qa-ebay-denied` on every platform (read back after each launch). No business write happened (the UI never mounts before `isWorkspaceReady` / `workspace != null`). |
| Retry opens the right workspace | Swift 5, Kotlin `aRetryWithAGoodRead…`, web 4 | Stored value restored to `qa-ebay-allowed`; Retry on Mac (02), iOS (04), Android (06) and the web banner opened the allowed workspace ("Good afternoon, allowed"); stored value still `qa-ebay-allowed` afterwards (not re-written). |
| Explicit workspace change updates the right record | Swift 7, Kotlin/web "explicit switch … activate" | Unchanged code path (`switchToWorkspace` / `switchActiveWorkspace` / web `switchActiveWorkspace`), still validated before the write; exercised by "Use my own workspace" on the web (writes `activeCompanyId = uid` only on the person's tap). |
| First setup works | Swift 8, Kotlin `firstSetupConfirmedByTheServer…`, web 6 | Server-confirmed empty pointer → personal workspace recorded (the seeded QA path); iOS/Android/Mac opened fresh emulator sessions into the stored workspaces without a wizard. |
| Late result after an account change is not applied | Swift 13–16, Kotlin `aLateResult…`, web 9–12 | Generation guard on every Swift callback; Android compares the result's uid with the current user; web effect cancels on user change. |

Both other cases operators asked about: a listener error on the open workspace no longer bounces to the personal workspace (Mac/iPhone `startActiveCompanyListener`), and the offline safety net opens only what the cache remembers, without writing, and never after the server has answered.

### Residual
* Android's `ensureWorkspaceForUser` still fires-and-forgets the profile merge; it now only includes `activeCompanyId` when the user document was read from the server and is blank (first setup).
* The web banner appears once; a page that loaded from the cached shell keeps the cached workspace (unchanged).

## 2. Hub "Available" flash

`NivaDeskIntegrationSignals.ebayWorkspaceEnabled = true` (Swift), `IntegrationSignals.ebayWorkspaceEnabled = true` (Android) and `ebay.status === "fulfilled" ? … : true` (web) drew **Available + Set up** before the server had answered and after a failed read. Now a tri-state (unknown / enabled / disabled / failed → Checking… / Available / Coming soon / Could not check); Checking and Could not check offer no Set up; a live connection still ignores the gate. Evidence: Mac hub first frame "Checking…" without a button, then "Available/Set up" once `getEbayConnections` returned (app screenshots 15:1xZ; the Android hub test pins the first frame as Checking and a failed read as Unverified; the shipped-web test and the four-source mirror test pin the same).

## 3. Phone web layout

| Defect | Cause | Fix | Evidence |
|---|---|---|---|
| iPhone Safari: page shifts left / clips when a field is focused | iOS Safari zooms into a focused field under 16px (settings search 13/14px, hub search, `.input` 14px) | 16px fields on `(pointer: coarse)` ≤980px; pinch zoom kept (no `maximum-scale`) | Simulator Safari, sign-in form focused with the soft keyboard up: no shift (09) |
| iPhone Safari: drawer's last entries (Settings, Sign out) unreachable | drawer box not scrollable at 402pt (page scrolled behind it) | `max-height: calc(100dvh - 82px)`, `overflow-y: auto`, `overscroll-behavior: contain`, `touch-action: pan-y`; `body:has(.native-toolbar-nav.is-open) { overflow: hidden }` | Simulator Safari: drawer scrolled to Sign Out and Sign Out tapped (10); emulated Chrome 412×915: body overflow hidden while open, drawer scrollTop moves, page stays |
| Android Chrome hub: badge on the title, chips stacked | `.settings-segmented.is-compact` is `inline-grid; width: fit-content` → `auto-fit` resolves to one column; badge fought the nowrap title in the same flex row | ≤640px: badge on its own line under the title; compact group is a wrapping flex row | Pixel_9 Chrome hub (11): four chips in one row, badge under the title |

Keyboard-open usability: iPhone Safari sign-in with the soft keyboard (09, Done submits), Android Chrome sign-in with the keyboard (12). Zoom and accessibility: no viewport `maximum-scale`; only field font sizes changed.

## 4. Platform evidence (five platforms, each its own line)

| Platform | Evidence type | What was run | Result |
|---|---|---|---|
| macOS app | Debug build of `dd0c5283`+ on this Mac against the emulators (background UI automation) | allowed owner with an unreadable stored workspace → Retry after restore; Settings → Integrations first frame | access-lost screen, stored id untouched, Retry opened the allowed workspace; hub "Checking…" → "Available" |
| iOS app | iPhone 17 Pro simulator (ad-hoc simulator build), soft keyboard now enabled on the simulator | same access-lost/Retry flow; allowed owner hub eBay Available/Set up; **member** (`qa-ebay-allowed-member`) launched into the workspace | access-lost screen + Retry ✓; hub ✓; member: hub eBay Available → Set up → "Only the workspace owner can connect or disconnect an eBay account." (no Connect) (18); soft keyboard up in the settings search (19) |
| Android app | Pixel_9 emulator, `assembleDebug` of the final commit | access-lost/Retry flow; allowed owner hub; **member**: hub eBay Available → Set up → "Only the workspace owner can connect or disconnect an eBay account." (no Connect) | all ✓ (05, 06, 16, 17) |
| iPhone Safari | Simulator Safari on the worktree dev server | access-lost banner + Retry; keyboard-open sign-in without zoom; drawer to Sign Out; **connected owner** hub "1 connected · Connected · qa_seller · Sandbox" | ✓ (07, 09, 10, 15) |
| Android Chrome | Pixel_9 Chrome via adb reverse | hub chips/badge; keyboard-open sign-in; **connected owner** hub Connected → Manage → `qa_seller` panel | ✓ (11, 12, 13, 14) |

Mobile-web connected/Manage and the member role on phones are now UI-verified (not only the server matrix). Physical devices: still none — every line above is simulator/emulator/local Mac, not a device result.

## 5. Left open (release blockers per finding)

| Finding | Remaining blocker |
|---|---|
| Workspace resolution | Ships only with the next store builds (iOS/Mac 1.3 (17) and Android 0.1.8 carry the old fallback) and the next web deploy; physical-device run not done. (During the iOS member run a mis-tap opened the feedback sheet; it was cancelled, nothing was sent.) |
| Hub flash | Same store/web release gate. |
| Phone web | Web deploy of the candidate; a real iPhone/Android check of the 16px rule and the drawer is still owed. |
| eBay availability (earlier commit) | Unchanged: merge, deploy `getEbayConnections`, then the store package. |

Emulator side effects to note: the QA owner accounts had their `activeCompanyId` pointed at `qa-ebay-denied` for the test and restored to their own workspaces afterwards; the simulator's hardware-keyboard connection was switched off (device preference) so the soft keyboard shows.
