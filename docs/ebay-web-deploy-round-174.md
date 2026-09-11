# Round 174 + `getEbayConnections` — the controlled release of the eBay availability candidate (11 Sep 2026)

**Status: RELEASE COMPLETE (server 16:46Z, web 17:00Z).** Behavioural closure is tracked separately below — it stays open until the signed-in production check with a non-pilot account and the physical-phone checks are done.

Approved by the operator (11 Sep ≈16:35Z) once the offline rule was pinned. Server first, then the web; nothing else.

| Step | Value |
|---|---|
| Offline rule (precondition) | Candidate commit `6e4c164e`: "Retry when the server cannot be reached" applies to every read that did not come back; the only reopen-from-cache is the 8-second net and it opens **only** the workspace this same uid last opened after a server-confirmed check (recorded per uid on confirmed activations and explicit switches). Empty, unconfirmed or changed cache → Retry stays. Never writes, never recorded as a confirmation. Android: no cache reopen (Retry + quiet re-read). Web: only the same uid's cached shell. Checks: `scripts/check-workspace-resolution-swift.sh` 18/18 (two new), Mac build green. |
| Source move | `ebay-availability-fix` @ `6e4c164e` merged normally into the deploy branch as **`b859a2fb`**; `functions/`, `studioflow-web/`, `EGGcraft/`, `studioflow-android/` trees identical to the candidate; Stripe fix `76c5e3c3`, native feedback `fd2a6648`, funnel `ff514cf8` remain ancestors; publish repo base for the nine web files = deploy branch base (only `package.json` differs, by test-script entries). |
| Pre-deploy checks | clean tree, `functions/.env` present (`NIVADESK_EBAY_CONNECTOR=1` — scope unchanged: the same four eBay functions carry it), `functions/` == origin deploy branch, mirror + wiring tests green. |
| Functions deploy | 16:45:48Z, `firebase deploy --only functions:getEbayConnections` → **`getebayconnections-00003-xec`** 100% Ready. **Rollback:** route traffic to `getebayconnections-00002-jur`. Revision env: same as the submitfeedback pattern — the shared `.env` adds the feedback/retention names, tooling dropped `FUNCTION_SIGNATURE_TYPE`; no eBay value changed. No other function deployed. |
| Web Round | Publish repo `main` **`599a6f0`** "Round 174" — nine files copied from `b859a2fb` (`app/globals.css`, `app/settings/EbayIntegrationSection.tsx`, `app/settings/page.tsx`, `components/AppShell.tsx`, `lib/studioflow/{ebay,firestore,integrations,language,workspaceResolution}.ts`); `package.json` and the two check scripts left behind (no dependency change); `npm run build` on the publish tree exit 0 before push. **Rollback:** `git revert 599a6f0 && git push origin main`. |
| Live (17:00Z) | `/`, `/login`, `/orders`, `/settings` 200. Live chunks (escapes decoded): `4401-…js` and `9589-…js` carry "Could not check", "Checking…", "Workspace not opened", "Use my own workspace", the retry banner class; `page-c666…js` carries "Checking…" ×4 and the not-available sentence; CSS `baa821…css` carries `is-unverified`, `pointer:coarse`, `body:has(.native-toolbar-nav.is-open)`, the compact segmented rules and `100dvh - 66px`. |

## What the authenticated live check still needs

The only production session available to this session is the retention pilot account (`contact@nivadesk.co.uk`, workspace `GuglEFKS…`) in Chrome, which the instruction excludes; no other owned non-pilot account has credentials this session can use (`test123@nivadesk.app` was deleted from Auth on 10 Sep). So the four signed-in checks — workspace opens correctly, eBay does not read "Available" while checking, a closed workspace is not offered Connect, "Send feedback" still present — are **not yet done on production**. They were done on the emulator stack with the same web code (Round 174 is byte-for-byte the candidate files). To close them: sign in on nivadesk.app with an owned non-pilot account (an owner of a workspace that is *not* on the eBay list) in the Browser pane, then this session reads the hub (no data created). Mobile-browser checks so far: **simulator/emulator only** (iPhone 17 Pro Simulator Safari, Pixel_9 emulator Chrome), no physical phone.

## Native

The same fixes are in the merge for Mac/iPhone/Android (`b859a2fb`) but the store builds (iOS/Mac 1.3 (17), Android 0.1.8) still run the old workspace fallback and the old hub; the web release changes nothing for them. Store package: `docs/onboarding/native-store-package-2026-09-11.md` (source now `b859a2fb`). No upload, no Submit.

## Behavioural closure (separate from the release)

| Group | What | State |
|---|---|---|
| A. Signed-in production check | `contact@eggcraft.co.uk` (non-pilot, real EGGcraft workspace, read-only): workspace opens and survives a reload; eBay never reads "Available" while checking and no Connect on a non-listed workspace; "Send feedback" present (not sent); menu and Settings navigation | open — operator signs in on the Browser pane, this session reads only |
| B. Mobile web on real phones (live site, no native build needed) | iPhone Safari + Android Chrome: drawer scrolls to Settings/Sign out; keyboard open on a safe field (settings search / login email) without horizontal overflow; hub badges/chips | open — physical phones needed; simulator/emulator evidence is not substituted |
| C. Native `b859a2fb` on physical phones | iOS + Android device runs of the merge (workspace resolution, hub, eBay gating) | open — see the per-platform list in the hand-off; no store upload, no Submit |

## Physical-phone steps (two groups, kept apart)

**Group 1 — mobile web on the live site (no native build, no signing):**
1. iPhone Safari: open nivadesk.app, sign in with a non-pilot owned account; open the hamburger drawer and scroll it to Settings and Sign Out; focus the settings search (safe field) — the page must not shift/clip horizontally with the keyboard up; open Settings → Integrations and look at the badges and filter chips; open the eBay card.
2. Android Chrome: the same four steps.
3. Send screenshots (or say what you saw); this session records them as *physical-device* evidence, separate from the simulator rows.

**Group 2 — native `b859a2fb` on physical phones (no store upload, no Submit):**
- iPhone: Xcode signed in with the developer Apple ID (Team 5QG48AF86V) — the Apple Development identity on this Mac suffices for a device build; phone connected by cable, Developer Mode on, trusted; scheme EGGcraft → Run on the device; sign in with a non-pilot owned account; flows: workspace opens and survives relaunch, Settings → Integrations hub (eBay Checking… → Available / Coming soon, no Connect on a non-listed workspace), Send feedback present (not sent), keyboard open in Quick Create.
- Android: `./gradlew :app:assembleDebug` from `b859a2fb` (debug signing; the upload keystore is only for the store bundle); phone with USB debugging, `adb install -r`; same flows.
- Store gate afterwards: Apple Distribution identity (Xcode → Accounts → Manage Certificates), ASC 1.4 (18), Play versionCode decision — operator steps, not started.
