# Feedback v1 — the pilot release package (10 September 2026, 22:30Z)

One approval turns this into the pilot: everything below is prepared, tested and committed on `onboarding-feedback`;
nothing is deployed or published. The pilot is one workspace — `GuglEFKSEKNTq1xibFpJav3EWkY2` ("test",
`contact@nivadesk.co.uk`) — and its eBay connection and settings are not touched by anything here.

## 1. Candidate commit and CI

| | |
|---|---|
| Candidate | **`4f6f47ed`** on `onboarding-feedback` (code, tests, screenshots); this package document is the docs-only commit on top. Base: deploy branch `493afa0d` (carries the Stripe fix `76c5e3c3`) |
| CI | `a2776adf` (the first version): run 34527912548 **success** — unit, relay, rules+e2e. **`4f6f47ed`: run 34530331738 success** — unit (fake Firestore), eBay relay vectors, rules + e2e (Firestore emulator), all three jobs green |
| Local | `functions/test/qa/feedback.test.js` 16 checks green; `feedback-rules.test.mjs` 20 checks green on the emulator; full `npm test` green (a2776adf tree; only the feedback files changed since); `tsc --noEmit` clean; no lint config in the web project |

## 2. The six functions (exact names)

`getFeedbackPrompt`, `dismissFeedbackPrompt`, `submitFeedback`, `listFeedback`, `getFeedbackDetail`, `updateFeedbackStatus`
— all gen2 `onCall`, region `europe-west2`, default runtime service account, no secrets. New functions: no earlier
revision exists to fall back to (rollback in §6).

```bash
npx firebase deploy --project eggcraft-studio --only functions:getFeedbackPrompt,functions:dismissFeedbackPrompt,functions:submitFeedback,functions:listFeedback,functions:getFeedbackDetail,functions:updateFeedbackStatus
```

## 3. Rules and indexes — the exact difference from live

The live Firestore release is ruleset `8256326f` (released 10 Sep 12:52Z) and its source is byte-identical to the deploy
branch's `firestore.rules` (read back through the Rules API at 22:1xZ). The branch adds **14 lines and nothing else**:

- `match /companies/{companyId}/feedbackState/{document=**} { allow read, write: if false; }` (explicit block);
- `&& collectionId != 'feedbackState'` in **both** wildcard deny-lists of `companies/{companyId}/{collectionId}`;
- `match /feedback/{document=**} { allow read, write: if false; }` (root).

`firestore.indexes.json`: **no change** — `listFeedback` orders by the single field `createdAtMs` and filters the page in
memory. Deploy: `npx firebase deploy --project eggcraft-studio --only firestore:rules` (rollback: redeploy the deploy
branch's file, which re-releases the `8256326f` content).

## 4. Web — files and publish order

Seven files under `studioflow-web/`, to be carried to the publish repo and pushed as the next Round:

| File | What |
|---|---|
| `components/FeedbackCenter.tsx` | the invitation card, the form, confirmed showing, draft, focus, Escape |
| `components/AppShell.tsx` | mounts FeedbackCenter; "Send feedback" in the account menu (desktop) and the mobile navigation, both only when the server says the feature is on for this workspace |
| `components/AdminFeedbackInbox.tsx`, `components/AdminInsightsHub.tsx` | the Customer Feedback inbox page and its sidebar entry |
| `lib/studioflow/feedback.ts` | the callable wrappers |
| `lib/studioflow/language.ts` | 54 new keys in all eleven languages |
| `app/globals.css` | the feedback styles (appended block) |

Order: **rules → the six functions → web**. Until the functions exist the web shows nothing (the availability call fails
silently, the entry stays hidden); until the web is published the functions are unused. Either order is safe; this one
avoids a window where a published entry has no server behind it.

## 5. Flags and pilot settings (`functions/.env`, read at deploy time by the six)

```
NIVADESK_FEEDBACK=1
NIVADESK_FEEDBACK_WORKSPACES=GuglEFKSEKNTq1xibFpJav3EWkY2
NIVADESK_FEEDBACK_INVITE_FROM_MS=<the deploy instant in ms, e.g. $(date +%s)000 taken right before the deploy>
```

- `NIVADESK_FEEDBACK` — the global switch. Unset: `getFeedbackPrompt` answers `enabled:false`, the writes refuse,
  the web shows neither the card nor the entry. The inbox is not behind it.
- `NIVADESK_FEEDBACK_WORKSPACES` — the pilot list. Empty means nobody (the global switch alone opens no workspace);
  `*` means every workspace (the general launch, where the manual entry then appears for existing users too);
  otherwise exact workspace ids, comma-separated. A workspace not on the list sees the feature as off.
- `NIVADESK_FEEDBACK_INVITE_FROM_MS` — the launch instant. The invitation is shown only for a first success **after**
  it, and only when that time is known (§7). Unset means no automatic invitation at all, manual entry unaffected.
- The shared `.env` rides on every later functions deploy; these three lines are read only by the six.
- The pilot workspace's eBay connection, its `appConfig/commerce` entry and its `autoSync: false` are untouched by any
  of this — the feedback code reads only `siparisler` (the newest fifty by `paymentDate`) and its own two collections.

## 6. Rollback

| Layer | How |
|---|---|
| Fastest | the **web**: revert the Round in the publish repo (`git revert`, push); the entry and the card are gone for everyone within the Hostinger build time; the functions stay idle. (Narrowing `NIVADESK_FEEDBACK_WORKSPACES` also works but needs a redeploy of the six — the env is baked at deploy time) |
| Functions | `firebase functions:delete` the six, or redeploy them with `NIVADESK_FEEDBACK` removed; nothing else calls them |
| Rules | redeploy the deploy branch's `firestore.rules` (the `8256326f` content) |
| Data | the pilot's rows: `feedback/*` with `companyId == GuglEFKS…` and `companies/GuglEFKS…/feedbackState/*` — delete by script if the pilot is abandoned; otherwise keep (they are the point) |

## 7. The rules the invitation follows (documented for the operator; all tested)

- **First success** = the workspace's first *substantive* order — `lifecycle/substantiveOrder.js`, the same predicate
  the setup checklist and the v2.1 funnel use (no copy): money, or a named customer, or line items, or a shipment, or
  a contact channel, or a recorded payment. An opened, empty "New Order" shell and a workspace with no order never
  qualify.
- **Its time** = the earliest creation stamp (`createdAt` server timestamp or `createdAtMs`) among the substantive
  orders. `paymentDate` is never used (it is the order's own date and can be typed). If any substantive order has no
  creation stamp the time is *unknown* and **no invitation is shown** — never a guess from the signup date. Orders
  created through the web (`createWebOrder`) and imported orders carry a stamp; orders created by older native
  paths may not, and then simply do not invite.
- **After the launch**: the first-success time must be at or after `NIVADESK_FEEDBACK_INVITE_FROM_MS`. Existing users
  whose first success predates the launch are never invited automatically; the manual entry is theirs at the general
  launch.
- **Shown** counts only when the card is on screen: the web asks, renders, then confirms (`shown`); the seven-day cap
  (`messaging.js feedbackPromptMaxPer7d`) is counted from confirmed showings. Two tabs confirming inside a minute
  count once (server-side debounce); the state document is updated in a transaction.
- **Closed** ("Not now" on the card, or the form opened from it closed without sending): `feedback_prompt_dismissed`,
  and the card stays away for **30 days** (`messaging.js dismissalCooldownDays`).
- **Unanswered** (shown, neither closed nor sent): it may come back after **7 days**, once per seven days.
- **Sent**: `feedback_submitted`; the campaign is answered and the automatic invitation **never returns** for that
  person in that workspace. A second answer sent from a card another tab still shows is kept as a note; the campaign
  stays answered once.
- **Manual entry** (account menu, mobile navigation): independent of all of the above — never held back by a
  dismissal or the cap; closing it records nothing; only the abuse limits apply (5 per hour, 20 per day per person
  per workspace; a retry under the same client key inside 24 h or the same words inside 10 minutes returns the earlier
  note). A draft survives a close and is cleared only when sent.

## 8. Access — who reads the inbox, and where it is checked

- The inbox callables (`listFeedback`, `getFeedbackDetail`, `updateFeedbackStatus`) require a signed-in, **verified**
  address in `SUPPORT_ADMIN_EMAILS` (`functions/index.js` line ~3172): `nivadesk@gmail.com`, `eggcraftco@gmail.com`,
  `contact@eggcraft.co.uk`. The check is `isAdminRequest` in the feedback wiring (`functions/index.js`, next to
  `getSetupChecklist`) — the same gate as `getActivationFunnel` and the other admin callables. No admin was added.
- The `/admin` page itself is gated on the web by `isNivaDeskAdminEmail` (`components/AdminInsightsHub.tsx`,
  `NIVADESK_ADMIN_EMAILS` — the same three addresses); a non-admin is redirected.
- The pilot list has no bearing on the inbox: an admin reads every workspace's notes whether or not the workspace is
  on the list; a pilot member has no path to any note (`feedback` and `feedbackState` are server-only in the rules,
  proven by `feedback-rules.test.mjs`; a removed member is refused by `requireWorkspaceForBilling`, proven in
  `feedback.test.js`).

## 9. End-to-end check for the pilot (run after the three deploys, by the operator in the pilot workspace)

| # | Step | Expect |
|---|---|---|
| 1 | As `contact@nivadesk.co.uk` in the "test" workspace, reload; open the avatar menu | **Send feedback** is listed (desktop) / in the mobile navigation |
| 2 | Send a manual note: *It's okay* → *A suggestion* → a line of text → *Send* | "Thank you"; `feedback/fb_…` written with `trigger: manual`, `workspaceName: test`, `userEmail: contact@nivadesk.co.uk`; no e-mail, no push (the code has no such path) |
| 3 | As an admin address at `/admin` → **Customer Feedback** | the note listed newest-first with workspace, sender, preview, status *New*; *Open* shows the full note; change to *Reviewing* + an internal note → *Save* → "Saved."; the history shows New → Reviewing |
| 4 | Synthetic first success: in the "test" workspace create an order through the web with a customer name and an amount (after the deploy instant) | `createWebOrder` stamps `createdAt`; within ten minutes (or on the next sign-in) the corner card appears: "How is it going so far?" |
| 5 | *Give feedback* → *Struggling* → *Something isn't working* → text → *Send* | "Thank you"; the card is gone for good; `companies/GuglEFKS…/feedbackState/GuglEFKS…` has `shows[1]`, `done: [first_success_feedback]`, events shown + submitted; the note is in the inbox with `trigger: first_success` |
| 6 | Negative: sign in to any other workspace (e.g. the EGGcraft workspace) | no card, no menu entry (`not_in_pilot`); the inbox still lists the pilot's notes |
| 7 | The eBay card in the pilot workspace's Settings | unchanged: connected, `autoSync` off |

If step 4 shows no card: `getFeedbackPrompt` answers with a named reason (`first_success_time_unknown`,
`first_success_before_launch`, `invite_window_unset`, `already_sent`, `dismissed_recently`, `already_answered`) —
read it from the browser's network panel before changing anything.

## 10. Evidence (this branch)

- `docs/onboarding/feedback-v1-2026-09-10-raw/screenshots/`: `01-invitation-on-orders`, `02-form-empty`,
  `03-form-filled`, `04-sent`, `05-account-menu-entry`, `06-manual-form`, `07a-mobile-menu-entry`, `07-mobile-form`
  (390×844, dialog inside the viewport, no horizontal overflow), `08-admin-inbox-list`, `09-admin-inbox-detail`,
  `10-admin-status-saved` — one synthetic note ("The order card lost my customer notes after saving.", Struggling,
  Something isn't working) from the form to the list to the detail, with the admin note "Reproduced on the order
  card; fix queued."; `run-findings.txt` holds the checks the run made (confirmed showing recorded once, Escape
  closes the manual form with no dismissal and the draft kept, focus back on the account button after closing, Save
  disabled until a change, "Saved." gone once the note changes again).
- The dev overlay's "1 Issue" badge in the preview: two Firestore listener errors from the **emulator seed shape**, not
  from this change — a `users/{uid}` read the rules allow only for the same uid (L443) and the `messageThreads` list
  rule hitting a null `memberUids` on the seeded company (L865/L876). Both pre-exist this branch (they fired in the
  first preview too), touch nothing in the feedback paths, and are not hidden. Not fixed here: they are seed data
  gaps, and the rules in question are not this package's.

## 11. What stays out of this package

Native screens, the §36/§37 prompt types (need trustworthy activation data — the v2.1 cutover package, kept separate),
retention e-mail, category/impact editing, export. OpenAI review surface, Stripe, production data: untouched. The
eBay manual stage stays paused where the hand-off records it.
