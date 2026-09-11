# Round 175 — Settings on phones scrolls again (11 Sep 2026, 19:21Z)

| Item | Value |
|---|---|
| Change | One rule: `@media (max-width: 980px) .settings-workspace { height: auto; min-height: 0; overflow: visible; }` — the trailing `height: 100%` from 28 Aug (`61465d75d`) is gone. Nothing else: no function, no env, no other feature. |
| Source | candidate `eb77d083` → deploy branch merge **`7f4fa2c2`** (normal merge, only `studioflow-web/app/globals.css`); publish repo **`e98f1da`** "Round 175" — the publish repo's CSS was byte-identical to the pre-merge deploy CSS, so the diff is exactly the rule above. |
| Pre-push build | `npm run build` on the publish tree: exit 0 (compiled with the usual warnings). |
| Rollback | `cd ~/Developer/studioflow-hostinger-publish-20260530 && git revert e98f1da && git push origin main` |
| Live CSS | `987cd22f0836df65.css` (new hash) carries `.settings-workspace{height:auto;min-height:0;overflow:visible}` inside the phone block; the base rule unchanged. |
| Desktop check (Browser pane 1280×800, live) | grid `275px 971px`, height 615 px, `overflow: hidden`, sidebar and pane still scroll inside (1313/613, 1141/613) — desktop layout preserved. |
| **Physical Android (Xiaomi 24040RN64Y, Android 16, Chrome 152, DevTools over USB, no override)** | `.settings-workspace` now 1307 px / `overflow: visible`; the shell's scroll area scrolls to the **last row "Support / Tickets"** (screenshot `phone-android-pa-175-list-bottom`); Integrations opens (13 cards, 4502 px) and scrolls **below ChatGPT** to Square, Open Banking, QuickBooks (`phone-android-pa-175-hub-below-gpt`); eBay stays a "Coming soon" chip, 0 Connect buttons. |
| Status | **Android + desktop verification CLOSED (11 Sep 19:4xZ).** |
| iPhone Safari (physical 16 Pro) | **OPEN — operator verifies in normal Safari** (list to the bottom, hub below ChatGPT, drawer to Sign Out, load time). No automation re-attempt. |

## "Loading your workspace" — tracked separately, not fixed by this round

Measured again on the Android phone after Round 175: `/settings` shows the loading screen for **≈8.6 s** (earlier run 6.3 s). Resource timing shows no single slow request: auth iframe/lookup ≈1.2–1.5 s, then the page's callables (`syncWorkspaceAcceptedJoinRequests`, `getSupportTicketUnreadSummary`, `getRetentionMessage`, `getFeedbackPrompt`, `listMessageThreads`) all start at **≈8.7 s** and take 150–320 ms each. The 1.5 s → 8.7 s gap is the Firestore part of the settings chain (`loadWorkspaceContext`, then `loadDashboardCounts` + `loadWorkspaceSettingsOverview` + `loadQuickReplySettings` + `loadTeamAccessData` in parallel — `app/settings/page.tsx` 594–640) over the Firestore WebChannel, which resource timing does not itemise. Next step if it is to be fixed: instrument those five awaits with `performance.mark` on a candidate and read the marks on the phone; likely levers are rendering the section list before the counts/team data arrive (they gate the loading screen today) and the EGGcraft workspace's team/counts reads. Not changed in this round.
