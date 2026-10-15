# Shopify App Store listing vs. the current product (14 October 2026)

Read-only comparison. Nothing was changed in the Partner portal; every change
below is a proposal for the owner to make there.

## Sources (what was read, and when)

| Source | How it was read | Key facts |
|---|---|---|
| Public listing | Built-in browser pane, 14 Oct 2026, `https://apps.shopify.com/nivadesk-order-management` (found via `apps.shopify.com/search?q=NivaDesk`) | Name "NivaDesk Order Management", developer EGGcraft Limited, launched October 12, 2026, 0 reviews, Languages: English, Category: Orders - Other |
| Live billing catalogue | `gcloud functions describe shopifyAppBridge` → source archive generation 1791553489113529 (deployed 2026-10-09 13:46Z), read-only download | `SHOPIFY_BILLING_PLANS` (index.js:32590): Starter `lifetime_lite` 12, Pro `pro_monthly` 25 (recommended), Team `team_monthly` 65, `EVERY_30_DAYS`; `SHOPIFY_BILLING_CURRENCY = "USD"`; `SHOPIFY_BILLING_TRIAL_DAYS = AUTOMATIC_TRIAL_DAYS` = 14 (index.js:2748) |
| Live webhook / sync code | Same archive (`shopifyAppWebhook` runs generation 1791553578333537, same date) | Topics routed (index.js:34546): orders create/updated/paid/cancelled, orders/fulfilled + fulfillments create/update, refunds/create, customers create/update; `shopifyReconcileOrders` every 15 minutes (index.js:35410, Cloud Scheduler job ENABLED) |
| Live connect | `shopifyCompleteConnect` archive generation 1790640879769075 (29 Sep) | No `appConfig` / per-workspace gate: only shop + one-time code + install checks |
| App scopes | `nivadesk-order-management/shopify.app.toml` (last change 28 Aug) | `read_orders,read_customers,read_products,read_fulfillments` — read-only |
| Embedded app UI | `nivadesk-order-management` @ 4c019b98 (Cloud Run `nivadesk-connect-00010-p9f`, ready 29 Sep 08:55Z, built after that commit) | Nav: Home, Connection, Sync settings, Import orders, Sync history, **Plans**, Support; Home heading "NivaDesk — Custom Order Management" |
| Website pricing | `https://nivadesk.app/pricing`, browser pane, 14 Oct 2026 | Free (10 active orders, 1 user), Starter £9, Pro £19, Team £49 (5 seats, +£5/seat), 14-day trial, storage add-ons |
| Tutorial / privacy links | `https://nivadesk.app/guide`, `https://nivadesk.app/privacy`, browser pane, not signed in | /guide shows "Sign in to read the guide" (paid plans only); /privacy (last updated 28 Sep 2026) has 0 lines mentioning Shopify |

What could not be read: the number of real (non-dev, non-review) stores
installed today — a read-only production query was refused by the session's
permission classifier. Nothing below depends on it.

## What matches (no change needed)

| Listing claim | Evidence |
|---|---|
| Starter $12 / Pro $25 / Team $65 per month, billed in USD every 30 days | `SHOPIFY_BILLING_PLANS` amounts + `EVERY_30_DAYS` + `SHOPIFY_BILLING_CURRENCY = "USD"` |
| 14-day free trial on each paid plan | `SHOPIFY_BILLING_TRIAL_DAYS = AUTOMATIC_TRIAL_DAYS` = 14 |
| Free plan available | The embedded Plans page offers no charge for Free; the website Free plan exists |
| Automatic sync of paid orders | `applyShopifyOrderEventLive`: unpaid skipped unless `importUnpaid` (index.js:34166) |
| Starting stage, task checklist, assignee per order | `defaultStatus`, `todoTemplate`, `assigneeUid` + `productWorkflows` rules (index.js:34172–34178) |
| Historical import by date range, already-synced orders skipped | Embedded Import page; `shopifyImportOrders` |
| Product / collection / tag filters | `filterMode` include_products / exclude_products / include_collections + include/exclude tags (index.js:34024–34040) |
| Fulfilments set dispatched + courier + tracking number | `applyShopifyFulfilmentEvent` (index.js:34279) |
| Refunds and cancellations follow | `applyShopifyRefundEvent` (refundedAmount, paidAmount), cancellation → status Cancelled (index.js:34309, 34261) |
| Works on web, Mac, iPhone and Android | Shipping clients (iOS 2.0, Play vc11, web) |

## Mismatches and proposed changes

| # | Listing field | Current listing text / asset | Problem (evidence) | Proposed |
|---|---|---|---|---|
| 1 | Description, sentence 2 | "Every paid Shopify order arrives as a production job with customer details, line items and totals, and gets your chosen starting stage, task checklist and assignee." | On the Free plan a workspace keeps 10 active orders; a new order beyond that is parked in `heldIntegrationOrders` (commerce/capacity.js, "plan_limit_reached") and comes in only when the owner presses Import on the Orders screen (`releaseHeldIntegrationOrders`, oldest first, as far as room allows); parked rows carry a 90-day `expireAt`. "Every … arrives" is not true on Free. | "Every paid Shopify order arrives as a production job with customer details, line items and totals, and gets your chosen starting stage, task checklist and assignee. On the Free plan up to 10 orders are active at a time; when that limit is full, new orders wait in NivaDesk until you make room and import them." |
| 2 | Description, sentence 4 | "Fulfilments, refunds and cancellations stay in sync, and your own edits are never overwritten." | Order updates patch only Shopify's own fields (index.js:34241 comment), but a fulfilment with a different tracking number replaces the job's tracking number (index.js:34300). "Never" is too wide. | "Payment status, fulfilments, refunds and cancellations follow from Shopify; your own edits to the job (design, notes, workflow stage) are kept. Every 15 minutes NivaDesk also checks the store for anything a webhook missed." |
| 3 | Description (missing) | — | The app is read-only (scopes `read_*` only; `pushTracking` / `pushTags` exist as settings but nothing writes to Shopify). Saying so pre-empts the most common question. | Add: "NivaDesk only reads your store. It does not change products, prices, stock or orders in Shopify." |
| 4 | Feature bullet 1 | "Automatic sync — new paid orders appear in NivaDesk within seconds" | Webhook path is near-real-time, but delivery timing is Shopify's; there is a 15-minute safety net. | "Automatic sync — new paid orders arrive by webhook, with a 15-minute catch-up check" |
| 5 | Pricing → plan cards | Free: "Free" only; Starter/Pro/Team: price + "14-day free trial", no features | A merchant cannot tell the plans apart. Website feature list (nivadesk.app/pricing) is the source. | Free: "10 active orders at a time · unlimited customers · 1 user". Starter: "Unlimited orders and customers · 1 user · timeline, notes and history · card customisation". Pro: "Everything in Starter · advanced finance and profit · 10 GB Client Files · workspace branding". Team: "Everything in Pro · 5 users included · team messages and Quick Replies · roles and to-do assignment · 50 GB Client Files". |
| 6 | Pricing → Team | (nothing about seats) | Website Team sells extra seats (£5) and storage add-ons; a Shopify-billed workspace can buy neither ("Shopify's Billing API sells the plans only, so its add-ons are not for sale anywhere for now" — stripeBilling.js:1570). | Team card: "5 users included. Extra seats and storage add-ons are not available for Shopify-billed workspaces." |
| 7 | Resources → Tutorial | `https://nivadesk.app/guide` | /guide is paid-plan only: an installing merchant (not signed in, or on Free) sees "Sign in to read the guide … part of Starter, Pro and Team". | Point Tutorial to a public page: `https://nivadesk.app/integrations` (Shopify card now says what the app does, with the install link) or `https://nivadesk.app/faq`. Long term: a public `/shopify` help page. |
| 8 | Resources → Privacy policy | `https://nivadesk.app/privacy` | Listing says "Learn why in the developer's privacy policy", but the policy (28 Sep 2026) never mentions Shopify, and its payment-provider list names Stripe, Apple, Google only. | Add a "Shopify" section (draft below) and add "Shopify (for workspaces installed from the Shopify App Store)" to the payment-provider list. Legal text: owner's decision. |
| 9 | Support | "App support provided by EGGcraft Limited." — no e-mail, no contact or FAQ link on the public page | The embedded Support page already gives `contact@nivadesk.co.uk`; the public listing gives a merchant nothing to click before install. | Fill the listing's support fields: e-mail `contact@nivadesk.co.uk`, contact page `https://nivadesk.app/contact`, FAQ `https://nivadesk.app/faq`. |
| 10 | Screenshot 1 "App dashboard: connected workspace and sync overview" | Dev store, dated 12 Aug 2026, shows `review@nivadesk.app`, nav without "Plans" | The embedded nav now has a Plans page (app.tsx:26). The review account e-mail is visible. | Retake on the dev store with the current build: Home with "Connected" + sync overview, nav showing Plans; use a neutral workspace e-mail. |
| 11 | Screenshots (missing) | — | No screenshot of the Plans page, although billing through Shopify is the change that got the app approved. | Add: embedded Plans page showing Starter $12 / Pro $25 / Team $65, "14-day free trial", alt "Plans billed through Shopify, 14-day free trial". |
| 12 | Screenshot 4 "Synced order in NivaDesk with source strip and task list" | Old web UI: nav with "AI Replies", order list with "OpenAI Review Test", "Emma Testcustomer" | Test/review names on a public listing; the nav and order screen have changed since August. | Retake on today's web order screen with sample customers (no "Test"/"Review" names), Shopify source strip visible. |
| 13 | Screenshot 5 "NivaDesk settings: connected stores with sync status" | Old Settings screen: "Connected Shopify stores" + "Connect Shopify (manual webhook)" with delivery URL fields | Settings is now Settings → Integrations (hub with cards, Shopify panel behind Manage). The manual-webhook panel next to the app is confusing on an App Store listing. | Retake: Settings → Integrations → Shopify (Manage) with the connected store, Pause / Remove, sync health. Alt: "NivaDesk Settings → Integrations: your connected Shopify store". |
| 14 | App name vs. in-app heading | Listing name "NivaDesk Order Management" | Embedded Home heading is "NivaDesk — Custom Order Management" (app._index.tsx:63); the website Settings text said "NivaDesk – Custom Order Management" (fixed in this branch). | Embedded app (separate release, not this branch): heading → "NivaDesk Order Management". |
| 15 | Description (missing) | — | A Shopify-installed workspace is billed by Shopify in USD, while nivadesk.app shows GBP (£9/£19/£49). A merchant comparing both sees two prices. | Add: "Plans for stores installed from Shopify are billed by Shopify in US dollars; prices on nivadesk.app are in pounds for direct customers." |
| 17 | Embedded Sync settings (not the listing) | "Pushing tracking numbers back to Shopify is coming soon and will be optional." (app.settings.tsx:169 @ 4c019b98) | A forward promise: `pushTracking` is stored but nothing writes to Shopify, and the app has no write scope. No toggle is shown, so current behaviour is not misrepresented. | Embedded release: drop the sentence, or say "NivaDesk does not write tracking numbers back to Shopify." |
| 16 | Languages | English | Embedded app is English only (correct). NivaDesk itself runs in 12 languages. | Optional description line: "The NivaDesk workspace is available in 12 languages; the Shopify admin app is in English." |

## Draft privacy-policy section (for item 8; owner/legal to approve)

> **Shopify.** If you install NivaDesk Order Management from the Shopify App
> Store, NivaDesk reads your store's orders, customers, products and
> fulfilments (read-only access) to create and update jobs in the NivaDesk
> workspace you connect. NivaDesk does not change anything in your store. The
> access token is stored encrypted. Plans for such workspaces are billed by
> Shopify. When Shopify sends a customer data request or a customer redaction
> request, NivaDesk answers it and anonymises that customer's details on
> Shopify-sourced orders while keeping the financial totals; when a store
> uninstalls the app, Shopify's shop-redaction request removes the store's
> connection record.

Evidence for the draft: scopes in shopify.app.toml; `shopifyEncryptToken`
(index.js:33393); `handleShopifyPrivacyTopic` / `redactShopifyCustomerData`
(index.js:34468, 34375) — anonymised fields listed there, financial totals untouched;
shop/redact purges `shopifyStores/{shop}` (memory record of 28 Sep).

## Not changed here

- No Partner-portal edits, no listing asset uploads (owner).
- Embedded app heading (item 14) and screenshots (items 10–13) need the dev
  store and a separate embedded-app release.
- Privacy policy text (item 8) is a legal change: proposed only.
