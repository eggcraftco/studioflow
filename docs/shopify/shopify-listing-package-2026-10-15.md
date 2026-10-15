# Shopify App Store listing package — 15 October 2026

The final text for every Partner-portal listing field, to paste as it stands. It replaces the
proposals in `shopify-listing-diff-2026-10-14.md`. Nothing has been changed in the portal; the owner
makes the edits there. Shopify may review listing changes before they show.

**Order of work**
1. Publish the web build that adds `https://nivadesk.app/integrations/shopify` (branch
   `web-shopify-tutorial-2026-10-15`). Until it is live, that URL returns 404, so do not put it in the
   Tutorial or FAQ fields before then.
2. Paste the text fields (§A1–A5, A8–A11).
3. Upload the new screenshots after the full-flow run on `nivadesk-flow-test` (§A6). They need a
   connected test workspace with sample orders.
4. Privacy section: the owner or legal approves the draft in the 14 Oct diff (item 8) first.

## Sources (read on 15 Oct 2026)

| Source | What was read |
|---|---|
| Live listing | `apps.shopify.com/nivadesk-order-management`, read in the built-in browser with the description expanded. Details are **500/500** characters. The SEO meta description says "Free app for makers and custom orders." |
| Shopify App Store requirements | `shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements`. Applied below: 1.2.3 (upgrade and downgrade without contacting support or reinstalling), 4.2.2/4.2.3 (pricing **only** in Pricing details, never in images or other fields), 4.3.2 (list only languages the app UI supports), 4.3.3 (no stats or data in listing text), 4.4.3/4.4.4 (no Shopify marks in screenshots; no browser chrome; no logo-only feature images) |
| Embedded app | Cloud Run `nivadesk-connect-00011-ln4`, 100% of traffic. Source is `~/Developer/nivadesk-deploy-2026-10-14/shopify-plaintext-token/cloudrun-nivadesk-connect`. Read `app.tsx`, `app._index.tsx`, `app.connection.tsx`, `app.settings.tsx`, `app.import.tsx`, `app.plan.tsx`, `app.history.tsx`, `app.support.tsx`, `shopify.app.toml` |
| Live functions | `shopifyAppBridge` 00021-ter (its tree is `…/shopify-plaintext-token/L6-sep30`). It has `SHOPIFY_BILLING_PLANS` (Starter 12, Pro 25, Team 65, USD, `EVERY_30_DAYS`), `shopifyTrialDaysFor`, `commerce/capacity.js` (10 active orders on Free, 90-day parking) and `releaseHeldIntegrationOrders` 00021-wus. `shopifyCompleteConnect` 00004-cet was downloaded read-only |
| Web | Live `ffe0d065`, plus this branch (`/integrations/shopify`). `/privacy` still has **0** lines about Shopify. The public plan cards come from `components/PublicMarketing.tsx` and `lib/studioflow/plans.ts` |

## A. Final text for each field

### A1. App name
`NivaDesk Order Management` (25/30). Keep it. Per 4.1.1 it is similar to the TOML name `nivadesk-order-management`.

### A2. App introduction / card subtitle (94/100, "Shopify" is not allowed here)
> Turn store orders into organised production jobs with statuses, task checklists and assignees.

Keep it. It matches the product and contains no statistics.

### A3. App details (473/500)
> NivaDesk is an order management workspace for makers who build to order. Paid Shopify orders arrive as production jobs with the customer, line items and totals, plus your starting stage, task checklist and assignee. Payments, fulfilments, refunds and cancellations then update the job, and past orders can be imported. If your plan's order limit is full, new orders wait in NivaDesk until you make room. The app only reads your store. Works on web, Mac, iPhone and Android.

Why this wording:
- "Every paid order arrives" is no longer true on Free. New orders are parked when the limit is full.
- "Never overwritten" claimed too much. A fulfilment with a new tracking number replaces the old one.
- The app is read-only: its scopes are `read_*` only.
- There is no price, currency or USD/GBP sentence here (4.2.3). There are no numbers or speed claims (4.3.3).

### A4. Features (5 items, each ≤80 characters)
1. `New paid orders sync by webhook, with a regular catch-up check` (62)
2. `Starting stage, task checklist and assignee on every new order` (62)
3. `Import past orders by date range or order ID; synced ones are skipped` (69)
4. `Product, collection and tag filters choose which orders sync` (60)
5. `Fulfilments, refunds and cancellations update the job automatically` (67)

"Within seconds" is gone. It was a speed claim (4.3.3), and delivery timing is Shopify's.

### A5. Feature media (banner)
- Today's image is the "NivaDesk logo with tagline about order workflows". 4.4.4 does not allow feature images that only show the logo.
- Replace it with a real UI image: the NivaDesk web order list with jobs that came from the test store.
- No prices, no "Shopify" logo, no browser frame.
- Alt text: `NivaDesk order list with jobs that came in from the store` (57/64).

### A6. Screenshots (desktop 1600×900, 6 images, alt text ≤64 characters)

Rules for every image:
- Capture only the app's content area. No browser chrome, no desktop background (4.4.4), no Shopify admin top bar or Shopify logo (4.4.3).
- **No prices** anywhere, so the embedded Plans page is **not** a screenshot (4.2.2). This replaces 14 Oct item 11.
- Use only generated dev-store data. No "Test"/"Review" names.
- The Home page shows the workspace e-mail, so use the neutral test-account address.
- Source: `nivadesk-flow-test`, after the full-flow run, linked to the new test workspace.

| # | Exact screen and state | Alt text |
|---|---|---|
| 1 | Embedded **Home**: "Connected" badge, workspace name, Sync overview, 3–5 Recent activity rows, nav showing Plans | `Home: store connected to a NivaDesk workspace, sync overview` (60) |
| 2 | Embedded **Sync settings**: filter = "Only orders with selected products" with one ID, Starting stage set, 3 task lines, assignee filled | `Sync settings: filters, starting stage, tasks and assignee` (58) |
| 3 | Embedded **Import orders**: after Preview count and Start import, the "Import finished" block showing created / skipped | `Import past orders: preview count, then created and skipped` (59) |
| 4 | Embedded **Sync history**: at least one success row; a failed row with its Retry button if there is one | `Sync history: every order event with its result and Retry` (57) |
| 5 | NivaDesk **web order detail** for an imported order: the Shopify strip ("View in Shopify"), status, task checklist | `A synced store order in NivaDesk with its status and tasks` (58) |
| 6 | NivaDesk **web Settings › Integrations › Shopify (Manage)**: the connected store, status, orders synced, last sync | `NivaDesk Settings: the connected store and its sync status` (58) |

Delete today's screenshots 1, 4 and 5:
- 1 (12 Aug) shows `review@nivadesk.app` and has no Plans link in the nav.
- 4 shows "OpenAI Review Test" and "Emma Testcustomer".
- 5 shows the old Settings screen with "Connect Shopify (manual webhook)".

Retake 2 and 3 with the build that is live today.

### A7. Demo screencast (reviewers only)
`https://nivadesk.app/shopify-review-demo.mp4` (20 Aug) shows the old UI and has no Plans step. Re-record it only if Shopify asks; it is not public.

### A8. Pricing details (Manual pricing, USD, every 30 days)

| Plan (handle) | Price | Trial | Plan features (each one line) |
|---|---|---|---|
| Free (`free`) | Free | — | `10 active orders at a time` · `Unlimited customers` · `1 user` · `New orders wait when the limit is full` |
| Starter (`lifetime-lite`) | $12 / month | 14 days | `Unlimited orders and customers` · `1 user` · `Timeline, notes and history` · `One free trial per workspace` |
| Pro (`pro-monthly`) | $25 / month | 14 days | `Everything in Starter` · `10 GB Client Files` · `Advanced finance and profit` · `One free trial per workspace` |
| Team (`team-monthly`) | $65 / month | 14 days | `Everything in Pro` · `5 users included` · `Team messages and roles` · `No extra seats or storage add-ons via Shopify` |

- Prices and trial come from the live `SHOPIFY_BILLING_PLANS` and `SHOPIFY_BILLING_TRIAL_DAYS`, which equal 14. Change nothing there.
- Why "One free trial per workspace": `shopifyTrialDaysFor` gives 0 days to a workspace that has already used a trial, and carries over the days left from a website trial. The card's "14-day free trial" therefore means *up to* 14 days. Shopify's approval screen shows the real figure.
- Team: extra seats and add-ons cannot be bought for a Shopify-billed workspace (`stripeBilling.js`: "add-ons are not for sale").
- Shopify adds "All charges are billed in USD" itself.

### A9. Languages and category
- **English** only (4.3.2). The embedded app is English-only.
- Do not add the "12 languages" line to the Details. It is optional, there is no room for it (500 characters), and it is risky under 4.3.2. The tutorial page says it instead.
- Category: keep Orders › Orders - Other.

### A10. Support and resources

| Field | Value |
|---|---|
| Support email | `contact@nivadesk.co.uk` |
| Support portal / contact page | `https://nivadesk.app/contact` |
| Support phone | leave empty |
| FAQ URL | `https://nivadesk.app/integrations/shopify#faq` (after step 1) |
| Tutorial URL | `https://nivadesk.app/integrations/shopify` (after step 1). Replaces `/guide`, which is paid-only and asks for a sign-in |
| Privacy policy URL | `https://nivadesk.app/privacy`. The URL stays the same; the "Shopify" section is added after the owner/legal approves it (14 Oct draft, item 8) |
| Website | `https://nivadesk.app` |
| Changelog | leave empty. `/changelog` is not about Shopify |

### A11. SEO
- Title tag (52): `NivaDesk Order Management: orders to production jobs`
- Meta description (145): `Sync paid store orders into NivaDesk as production jobs with stages, task checklists and assignees. Read-only store access and past-order import.`
- The live meta says "Free app…", which has been wrong since paid plans arrived. There is no price in the new text (4.2.3).
- Search terms: keep the 5 (`custom orders`, `order management`, `production workflow`, `made to order`, `order sync`).

## B. The 17 items rechecked against today's live product

| # | Item | 15 Oct status | Where it lands |
|---|---|---|---|
| 1 | "Every paid order arrives" (not true on Free) | **Still wrong**: parking is live, and so is `releaseHeldIntegrationOrders` 00021-wus | A3 |
| 2 | "Never overwritten" | **Still wrong** | A3 |
| 3 | No read-only sentence | **Still missing** | A3 |
| 4 | "Within seconds" | **Still there** (and conflicts with 4.3.3) | A4 |
| 5 | Plan cards have no features | **Still empty** | A8 |
| 6 | Team seats/add-ons | **Still not stated** | A8 |
| 7 | Tutorial → paid-only `/guide` | **Still there**. The public page is ready (step 1) | A10 |
| 8 | Privacy has no Shopify section | **Still 0 lines** (ffe0d065). Owner/legal | A10 |
| 9 | No support links | **Still none** | A10 |
| 10 | Screenshot 1 is old and shows the review e-mail | **Still there** | A6 |
| 11 | Plans screenshot | **CHANGED: do not add.** 4.2.2 bans prices in images | A6 |
| 12 | Screenshot 4 has test names | **Still there** | A6 |
| 13 | Screenshot 5 shows the old settings | **Still there** | A6 |
| 14 | Embedded Home heading "NivaDesk — Custom Order Management" | **Still there** in 00011-ln4 (`app._index.tsx`). Embedded release, not the listing | D |
| 15 | USD/GBP sentence in Details | **CHANGED: do not add.** 4.2.3 allows pricing only in Pricing details; the tutorial FAQ explains it | Tutorial |
| 16 | 12-language line | **CHANGED: do not add** (4.3.2 and the character budget) | A9 |
| 17 | Embedded "Pushing tracking numbers … coming soon" | **Still there** in 00011-ln4 (`app.settings.tsx`) | D |

New items found today:
- **N1.** The SEO meta says "Free app" → A11.
- **N2.** The feature image is logo-only (4.4.4) → A5.
- **N3.** The embedded Home error banner says `support@nivadesk.co.uk`, while the Support page and listing use `contact@nivadesk.co.uk`. Whether `support@` exists was not checked → D.
- **N4.** The embedded Support page's "NivaDesk user guide" link goes to paid-only `/guide` → D.
- **N5.** Requirement 1.2.3: the Plans page lists only paid plans, so getting back to Free means uninstalling (`app.plan.tsx`: "Cancel any time from Settings › Apps"). Moving between paid plans works. A return to Free without reinstalling needs an embedded change plus a bridge change (for example `appSubscriptionCancel`). Shopify approved the app this way, but the rule requires it → D.
- **N6.** The "14-day free trial" label versus one trial per workspace → A8 bullet.

## C. Consistency check (listing / tutorial page / embedded app / website)

| Fact | Listing (after A) | `/integrations/shopify` | Embedded app (00011-ln4) | Website (ffe0d065) |
|---|---|---|---|---|
| $12 / $25 / $65 USD every 30 days | Pricing details | Plans section | Plans page (from the server) | `/integrations` card: "billed by Shopify, in US dollars" (no amounts) |
| Up to 14-day trial, once per workspace | Card + bullet | trialNote | "Your first N days are free" | — |
| Free 10 active orders, waits + Import | Free card + A3 | Limit section | — | `integrations.detail.shopify` (same wording) |
| Read-only | A3 | Reads / never changes | toml `read_*` | Card detail |
| Support `contact@nivadesk.co.uk` | A10 | Contact section | Support page (but Home banner says `support@`, N3) | — |
| FAQ / tutorial | A10 → `/integrations/shopify` | the page itself | Support → `/guide` (N4) | Shopify card → "Setup guide, plans and FAQ" link (this branch) |

## D. Embedded app items for a separate release (not the listing)

These are the owner's choice. None of them is in this branch.
- Item 14: Home heading → "NivaDesk Order Management".
- Item 17: change the settings text to "NivaDesk does not write tracking numbers back to Shopify."
- N3: replace `support@` with `contact@`.
- N4: Support link → `https://nivadesk.app/integrations/shopify`.
- N5: add a "Switch to Free" path (requirement 1.2.3).
