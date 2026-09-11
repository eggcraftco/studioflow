# Web Round 176 — Settings shows the list once the workspace is confirmed (11 Sep 2026)

**Released 20:12Z**, live at **20:14:51Z**. Publish repo commit **`8bf514e`** (`~/Developer/studioflow-hostinger-publish-20260530`). **Rollback: `git revert 8bf514e` in the publish repo, `npm run build`, push.** Deploy branch merge `e60999ed` (candidate `e3a7a46d` + `496247e4` from `ebay-availability-fix`); product diff = candidate diff = publish diff, byte-for-byte on the three files (`app/settings/page.tsx`, `app/globals.css`, `lib/studioflow/language.ts`). Publish-repo build exit 0. No function, rules, env or native store change. Measurements and the pre-release checks: `docs/settings-loading-2026-09-11.md`.

Live verification: the new settings chunk `page-6509f2b43137e257.js` carries the stage marks, the strip class and the strip text; the CSS carries `.settings-auxiliary-state`.

## Physical Android after the release (same phone, same session: Xiaomi 24040RN64Y, Android 16, Chrome 152, `contact@eggcraft.co.uk`, workspace EGGcraft; stage names and times only)

| Run | Loading screen | Workspace + access confirmed | List + details strip on screen | Details complete (strip gone) | Before (Round 175, same phone) |
|---|---|---|---|---|---|
| First open after a Chrome restart, run 1 | 0.45 s | 4.88 s | **4.94 s** | 7.83 s | list at 8.21 s |
| First open after a Chrome restart, run 2 | 0.16 s | 2.55 s | **2.57 s** | 3.89 s | — |
| Reopen, same tab | 0.00 s (t₀) | 2.27 s | **2.34 s** | 3.56 s | list at 3.24 s |

**How to read the times.** The two first-open rows count from navigation start. The reopen row counts from the moment the loading screen appeared, the same reference as the Round 175 reopen row; from navigation start the same run reads loading 0.90 s, workspace 3.17 s, list 3.24 s, details 4.46 s. The raw probe files carry two events that do **not** mark the list becoming visible: `listOnScreen` (first-open run 1) fires when the list text is in the DOM underneath the loading overlay, and `loadingScreenGone_listVisible` (the other two runs) fires in the short gap between the sign-in loading screen and the page's own loading screen (the Branding sampling shows the overlay gone at 0.95 s and back at 1.32 s). The list-visible moment is `detailsStripShown`, which renders in the same React commit that removes the overlay.

"List on screen" is the moment the details strip renders (the list and the strip are in the same commit, right after the workspace mark). The workspace-validation part is unchanged; the list no longer waits for the details. The variance between the two first opens (4.9 s vs 2.6 s) is in the validation part (auth restore + Firestore channel), not in the change.

Branding reopen sampled every 100 ms: loading overlay → strip "Loading the details…" with **no Save button** (2.15 s) → editor with Save (3.27 s). Raw probe outputs: `settings-loading-2026-09-11-raw/probe176-*.json`.

## Scroll and content checks on the same phone (live Round 176, read-only)

| Check | Result |
|---|---|
| Settings list to the end | "Support / Tickets" row fully inside the viewport at the bottom (`r176-android-list-end.png`) |
| Integrations hub below ChatGPT | inner scroller reaches "Coming soon" with the Dropbox chip visible; headings after ChatGPT: Shopify, WooCommerce, Square, Etsy (`r176-android-hub-bottom.png`) |
| Loading / error indicators | strip shown while details load, gone when done; the error state was exercised on the emulator only (no way to force it on the live site without touching data) |

Nothing saved, no feedback sent, no integration started. The INTEGRATIONS group was collapsed on this phone; the row was reached via the search filter as before.

## Open
* iPhone Safari: the operator's own check (list end, hub below ChatGPT, drawer to Sign Out, loading time, device/iOS/Safari version).
* Native store builds unchanged.
