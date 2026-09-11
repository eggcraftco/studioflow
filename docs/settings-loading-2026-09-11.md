# "Loading your workspace" on Settings — measurements and the candidate (11 Sep 2026)

Candidate commits **`e3a7a46d`** + the Save gate (see §3a) on `ebay-availability-fix` (on top of Round 175's `eb77d083`). Web only; no function, rule, env or native change. **Not released.** No business data written, no feedback sent, no integration started; the retention pilot and OpenAI connection untouched. Every physical-phone number below comes from the operator's existing signed-in Chrome session on the Xiaomi 24040RN64Y (Android 16, Chrome 152) against the **live** site — the logs kept only stage names and times.

## 1. Where the time goes (live site, physical Android)

The live page holds the whole-page "Loading your workspace" screen until `loadWorkspaceContext` **and** five auxiliary loads (order/customer counts, settings overview, quick-reply settings, team data, support-ticket summary) have all resolved. The probe records when the loading UI appears, when the workspace has been confirmed (the first thing the page does with a confirmed workspace is start the team sync / support / count requests), and when the section list is on screen.

| Run (same session, same tab) | Loading screen shown | Workspace + access confirmed | Count queries sent | Section list on screen | Held by the auxiliary chain *after* the workspace was known |
|---|---|---|---|---|---|
| First open after a Chrome restart (tabs restored) | 0.77 s | 4.75 s | 6.08 s | **8.21 s** | **3.5 s** |
| Reopen, same tab, right after | 0.00 s (t₀) | 2.03 s | 2.16 s | **3.24 s** | **1.2 s** |
| Earlier reopen (probe 1) | 0.47 s | 2.71 s | 2.89 s | 3.99 s | 1.3 s |
| Earlier `/home` → `/settings` | 0.77 s | 2.81 s | 2.66 s | 4.21 s | 1.4 s |

Before the workspace is known the time is spent on: script boot until the loading UI (0.5–0.8 s), the Firebase Auth session restore (≈1.25 s on the reload run), the Firestore client start and the Listen channel (≈3.0 s on the reload run), then the `users/{uid}` and `companies/{id}` reads. That part is the auth + workspace validation and is **kept as it is** — it is the check that stops a wrong workspace from opening. What the candidate removes is only the wait *after* it: 1.2–3.5 s on this phone, mostly the support-summary callable and the count aggregation queries (on the emulator the support callable alone took 2.5 s on a cold function).

Not attributed to Firestore as a whole: the count queries are aggregation requests to the server (no cache), the support summary is a Cloud Function call, the overview/quick-reply reads came from the local cache within ~50 ms.

## 2. What the candidate changes (`studioflow-web/app/settings/page.tsx`, `app/globals.css`, `lib/studioflow/language.ts`)

* The loading screen clears as soon as `loadWorkspaceContext` succeeds; the section list shows then.
* The five auxiliary loads run afterwards. While they run, the open section shows a strip "Loading the details for this section…"; if any fails, "Some settings could not be loaded." with **Retry** (the cause goes to the console, not the screen). Sections that need those values keep their existing null-guards, so no section shows partial or placeholder numbers.
* Stage marks `performance.mark("nv:settings:<stage>")` — start, workspace, counts, overview, quickReply, team, support, auxiliary — name only.
* Kept: the workspace/access validation and the no-wrong-workspace rules. A failed context read still shows the page-level "Workspace not opened… Retry / Use my own workspace" banner with no section body. Every load (new account, retry) first clears the previous workspace, counts, settings, quick-reply and team values, so nothing from another account or workspace can be on screen; a result arriving after an account change is dropped (`cancelled`).

Rollback if released: `git revert e3a7a46d` (web files only).

## 3. Targeted checks (candidate on the local emulator stack, dev server :3006, emulator-only QA accounts)

| Check | How | Result |
|---|---|---|
| List before the auxiliary data | reopen `/settings`, stage marks | workspace 30 ms after start → list shown; auxiliary done 50 ms later (cold: support callable 2.5 s, list did not wait for it) |
| Auxiliary error shows no wrong content | count aggregation requests blocked in the page (XHR hook) → `/settings` via the drawer link | list shown; strip "Some settings could not be loaded. Retry"; counts never set (no numbers rendered); `overview`/`quickReply` marks present, `counts`/`auxiliary` absent |
| Retry after an auxiliary error | strip's Retry | the load ran again (marks restarted) |
| Account change while on Settings (desktop width, Branding open) | signed in as a second QA owner on the page, sampled every 100 ms for 4 s | name field showed the new workspace from the first sample on; the old name never reappeared; strip "Loading the details…" → cleared |
| Workspace unreadable (access lost) | QA owner's stored pointer set to a workspace it cannot read, reload; pointer restored afterwards | page-level banner with Retry / Use my own workspace, no section body (unchanged behaviour); stored pointer untouched |
| Types | `tsc --noEmit` | clean |

### 3a. The two pre-release checks the operator asked for

| Check | How | Result |
|---|---|---|
| A Save cannot post empty/default values while the details are loading or failed | count query delayed 8 s in the page; `/settings` opened via the drawer link; DOM sampled every 500 ms | while the strip said "Loading the details for this section…": section header only — **no editor, no input, no Save button**; the list and navigation usable (Support / Team Access rows present); when the details arrived: the editor mounted with the real values ("connected"/"subtitle-…"). Implementation: the ten sections whose editors start from counts / overview / quick-reply / team data (`SETTINGS_SECTIONS_NEEDING_DETAILS`) mount only when the auxiliary state is `ready`; a failed load leaves them unmounted with the strip's Retry. Sections that load their own data (Integrations, Support, Workflow Steps, Customer SMS, Message Settings, Customer Portal Domain, About) render as before. |
| Same user, two workspaces: the old workspace's late answer never reaches the new screen | QA owner given `workspaceAccess` to a second workspace; Team Access → Switch to it | the switch writes the pointer and then does a **full reload** (`navigation.type = reload`, new `timeOrigin`): every promise of the old document is discarded by the browser, nothing can be applied. After the reload Branding showed the second workspace's name and subtitle only. The switcher itself sits in a details-gated section, so it is reachable only once the current workspace's details have completed. (The "Use my own workspace" path in AppShell after access-lost is unchanged.) |

## 4. Before/after on the same phone — what is still open

"Before" is measured (table above). "After" on the **same phone with the same session** is not measurable before a release: the phone's signed-in session belongs to the `nivadesk.app` origin, and a dev build of the candidate would run on another origin, which would need a sign-in on the phone (no credentials are held here and no new account will be prepared). Expected after the change, from the same runs: the list would appear at ≈4.8 s on the first open and ≈2.0–2.8 s on a reopen (the "workspace confirmed" column), with the details strip for a further 1.2–3.5 s. Either the operator signs in once on a dev origin on the phone, or the after-numbers come from the phone right after a scoped web release (rollback listed above).

The iPhone Safari row stays with the operator's own check.
