# StudioFlow Public Site and Billing Plan

## 1. Public website goal

Create a polished public entry point for StudioFlow by EGGcraft that explains the product before login, routes existing users into the web portal, and prepares a safe path toward web, Apple, and future platform billing.

The public site should make StudioFlow feel like a premium studio operating system for artists, custom studios, and order-based creative businesses. It should be calm, app-like, practical, and clearly connected to the existing Mac/iPad/iPhone app and logged-in web portal.

The public site must not replace logged-in product workflows. It should explain, sell, and route.

## 2. Target users

Primary users:

- Independent artists and makers managing custom orders.
- Watch customisation, jewellery, tattoo, ceramics, print, repair, restoration, and bespoke product studios.
- Small creative teams that need shared order status, team roles, delivery dates, files, and exports.
- Studio owners who need a cleaner operational system than spreadsheets, notes, chat history, and scattered cloud folders.

Secondary users:

- Assistants or workflow-only team members invited into an existing workspace.
- Returning app users who need the web portal for dashboard, export, team, or billing views.
- Future Windows/Android users who need to understand platform direction without expecting those native apps today.

## 3. Brand/design direction

StudioFlow should feel:

- Premium, calm, clean, and studio-focused.
- More like a native productivity app than a generic SaaS landing page.
- Warm enough for creative businesses, but not decorative or overly corporate.
- Consistent with EGGcraft and the existing StudioFlow web portal: soft greys, white workspace surfaces, precise borders, clear status chips, and compact information density.

Design rules:

- Lead with the product name: StudioFlow by EGGcraft.
- Use an app-like workspace visual rather than generic marketing imagery.
- Keep the copy direct and operational.
- Highlight real studio workflows: orders, files, delivery, to do, team access, dashboard, and export.
- Avoid promising Windows or Android availability as current support. Mention only as future platform support.

## 4. Public page structure

Recommended public pages:

- `/` - public homepage with hero, product value, feature highlights, platform note, pricing preview, and calls to action.
- `/features` - feature overview for Orders, Client Files, Timeline & Delivery, To Do, Team Access, Dashboard, and Export.
- `/pricing` - pricing structure, safe non-charging buttons, and future storage add-ons.
- `/faq` - common buying and onboarding questions.
- `/privacy` - privacy policy structure, pending final legal text.
- `/terms` - terms structure, pending final legal text.
- `/login` - existing Firebase Auth login entry for current app/web users.
- `/signup` - safe public get-started entry. Until onboarding is fully connected, this should route to login or contact, not take payment.
- `/contact` - support/contact structure.

Logged-in portal pages should remain separate and auth-protected:

- `/dashboard`
- `/orders`
- `/files`
- `/export`
- `/plan`
- `/team`
- `/settings`

## 5. Pricing structure

Plans:

- Free / Demo
  - Limited workspace for trying StudioFlow.
  - Existing data export must remain available.
  - Basic finance fields remain available where the product already supports them.

- Lifetime Lite
  - One-time purchase model.
  - Intended for solo studios that need core order management without ongoing cloud-heavy features.
  - Does not include Pro/Team cloud Client Files features.

- Pro Monthly
  - Subscription for cloud-connected solo studios.
  - Includes Client Files cloud upload and advanced sync features.
  - Keeps cloud-cost features subscription-based.

- Team Monthly
  - Subscription for multi-user studios.
  - Includes Team Access, role management, and To Do assignment.
  - Team-only features should stay Team-only.

Storage add-ons (confirmed pricing, VAT-inclusive — customer pays the same on every platform):

| Add-on | Monthly (VAT incl.) | Yearly (VAT incl.) | Net monthly | Net yearly |
|--------|---------------------|--------------------|-------------|------------|
| +100 GB Extra Storage | £9 | £90 | £7.50 | £75 |
| +200 GB Extra Storage | £15 | £150 | £12.50 | £125 |

VAT handling (mirrors plan products):
- Apple: prices are VAT-inclusive automatically → enter £9 / £90 / £15 / £150 tiers.
- Google Play: Google adds 20% VAT on top of net → enter net (£7.50 / £75 / £12.50 / £125).
- Stripe (web): enter £9 / £90 / £15 / £150 with tax behavior = inclusive.

Stripe price env vars (functions/.env):
`STRIPE_PRICE_ADDON_100GB`, `STRIPE_PRICE_ADDON_100GB_YEARLY`,
`STRIPE_PRICE_ADDON_200GB`, `STRIPE_PRICE_ADDON_200GB_YEARLY`.

Storage add-ons increase workspace storage without changing the base plan. They are additive entitlements (`billingStorageAddonMB`) summed onto the base plan limit in `planLimitsFromEntitlements`, tied to the same central workspace billing state. They require a base plan that includes Client Files (Pro or Team).

## 6. Signup/login flow

Recommended public-to-product flow:

1. Public visitor lands on `/`.
2. Visitor chooses Start Free, View Pricing, or Login.
3. Login routes to `/login` and uses the existing Firebase Auth account.
4. Signup routes to `/signup`.
5. Until onboarding is fully connected, `/signup` should be a safe entry page that explains Free onboarding and routes to login/contact. It should not create paid subscriptions or charge.
6. After Firebase workspace creation is finalized, `/signup` can add Firebase Auth account creation plus initial Free/Demo workspace creation.
7. If a logged-in user visits `/login`, continue redirecting to `/dashboard`.
8. If a logged-in user visits public pages, show an Open Portal link.

Portal auth rule:

- Public routes stay accessible without login.
- Portal routes keep their current Firebase Auth requirement.
- Free/Demo users must still be able to export/download existing order data.

## 7. Stripe web billing plan

Stripe should power web billing later, not in this first UI pass.

Recommended Stripe model:

- Stripe Checkout for new web purchases and upgrades.
- Stripe Customer Portal for card updates, cancellation, invoices, and subscription management.
- Stripe Products/Prices mapped to central plan identifiers:
  - `lifetime_lite`
  - `pro_monthly`
  - `team_monthly`
  - `storage_100gb`
  - `storage_200gb`
- Use metadata on Checkout sessions and subscriptions:
  - `workspaceId`
  - `ownerUid`
  - `plan`
  - `billingSource: stripe`
  - `environment`
- Never trust client-side plan changes. Stripe webhooks should be the source of truth for paid web billing state.

Initial public pricing buttons should remain safe:

- Free/Demo: Get Started or Login.
- Lite/Pro/Team: Billing setup coming soon, Get Started, or Contact us.
- No live payment code until Stripe products, prices, webhook secrets, and Firebase Functions are configured.

## 8. StoreKit app billing relationship

Apple app billing should use StoreKit/In-App Purchase for purchases made inside the iOS/iPadOS/macOS app where Apple policy requires it.

StoreKit should update the same central Firebase workspace billing state as Stripe:

- A StoreKit transaction is verified server-side where possible.
- The verified result maps to the same plan identifiers.
- Firebase stores the active entitlement state for the workspace.
- App and web both read the central entitlement state, not separate local billing flags.

Important policy point:

- Do not send users from the iOS app to external web checkout for digital subscriptions in a way that violates Apple rules.
- Public web marketing can explain plans, but in-app purchase paths should be policy-safe.

## 9. Future Windows/Android billing relationship

Windows and Android native apps are future platform support only.

Future direction:

- Windows app can likely use the web/Stripe billing model for account and workspace billing.
- Android app may need Google Play Billing for in-app digital purchases.
- Google Play purchases should also map into the same central Firebase entitlement state.
- All platforms should read the same workspace billing model.

Do not start Windows or Android implementation in this thread.

## 10. Central Firebase billing model

Current web code already reads workspace billing fields from the company/workspace document and normalizes plan entitlements in `studioflow-web/lib/studioflow/plans.ts`.

Recommended central billing fields on the workspace/company document:

- `billingPlan`: `demo`, `lifetime_lite`, `pro_monthly`, or `team_monthly`
- `billingPlanName`
- `billingPlanSource`: `manual`, `stripe`, `storekit`, `google_play`, `legacy_default`, or `admin`
- `billingStatus`: `active`, `trialing`, `past_due`, `cancelled`, `expired`, `refunded`, or `free`
- `billingCurrentPeriodEnd`
- `billingCustomerId`
- `billingSubscriptionId`
- `billingOriginalTransactionId`
- `billingStore`
- `billingStorageAddonMB`
- `billingStorageLimitMB`
- `billingTeamMemberLimit`
- `billingUpdatedAt`
- `billingUpdatedBy`
- `billingProviderRawStatus`
- `billingUsageOrderCount`
- `billingUsageCustomerCount`
- `billingUsageClientFilesBytes`

Entitlement reads should be derived from this central state. If Pro/Team expires or is cancelled, the computed active plan should fall back to Free/Demo, not Lifetime Lite.

## 11. Required Firebase Functions/webhooks later

Later backend work should include:

- `createStripeCheckoutSession`
- `createStripeCustomerPortalSession`
- `stripeWebhook`
- `verifyStoreKitTransaction`
- `storeKitServerNotificationWebhook`
- Future: `googlePlayWebhook`
- Admin-only manual plan override callable for support.
- Workspace billing recalculation job for usage and storage.
- Safe plan transition function that preserves export/download access.

Webhook handling rules:

- Verify provider signatures.
- Use idempotency keys or event IDs.
- Store raw event summaries for audit/debugging.
- Update only the central workspace billing state.
- Never downgrade export access.

## 12. Legal pages needed

Required before launch:

- Privacy Policy
- Terms of Service
- Cookie notice if analytics, ads, or non-essential cookies are added.
- Refund/cancellation policy.
- Support/contact page.
- Data export/deletion instructions.
- Acceptable use and upload/file policy for Client Files.
- Team/workspace ownership policy.

Legal pages should be reviewed before accepting paid users.

## 13. What should be implemented now vs later

Implement now:

- Public homepage.
- Public pricing page with safe non-charging CTAs.
- Public feature sections.
- Signup/get-started placeholder route.
- Public legal/support page structure.
- Routing that leaves portal pages auth-protected.
- This planning document.

Implement later:

- Live Stripe Checkout.
- Stripe Customer Portal.
- Stripe webhooks.
- StoreKit verification backend.
- In-app purchase final purchase flows.
- Google Play Billing.
- Windows/Android apps.
- Final legal policy text.
- Production analytics/cookie consent if needed.

## 14. Risks and policy considerations

Risks:

- Accidentally charging users before billing/webhooks are ready.
- Divergent entitlements between Stripe, StoreKit, web, app, and Firebase.
- Downgrade bugs that block export/download access.
- Apple policy issues if iOS flows direct users to external checkout incorrectly.
- Storage cost exposure if Client Files upload is unlocked without plan guards.
- Team role bugs if Team-only features are exposed outside Team.
- Legal risk if privacy/terms pages go live with placeholder text.

Mitigations:

- Keep pricing CTAs non-charging until billing is explicitly configured.
- Treat Firebase workspace billing state as the single entitlement source.
- Keep export/download available on Free/Demo.
- Verify billing providers server-side.
- Keep Client Files cloud upload Pro/Team.
- Keep To Do assignment and role management Team-only.
- Mark legal pages as structure/draft until reviewed.

## 15. Recommended implementation batches

Batch 1 - Public site foundation:

- Replace the root redirect with a public homepage.
- Add `/features`, `/pricing`, `/signup`, `/faq`, `/privacy`, `/terms`, and `/contact`.
- Add safe pricing buttons only.
- Keep `/login` and portal auth guards intact.

Batch 2 - Signup and workspace onboarding:

- Add Firebase Auth account creation.
- Add initial Free/Demo workspace creation.
- Add owner profile capture.
- Add safe redirect to `/dashboard` once the workspace exists.

Batch 3 - Stripe web billing:

- Configure Stripe products/prices.
- Add Checkout and Customer Portal callables.
- Add webhook verification.
- Map Stripe state to central Firebase workspace billing state.

Batch 4 - StoreKit relationship:

- Finish StoreKit product mapping.
- Add server verification and notification handling.
- Confirm Apple policy-safe upgrade/cancel copy.

Batch 5 - Legal and launch readiness:

- Finalize privacy, terms, refund, support, and file policy.
- Add cookie/analytics consent only if needed.
- Add production monitoring for billing webhooks and entitlement changes.

## 16. Stripe test-mode scaffold notes

The web billing scaffold is prepared for Stripe Checkout, Stripe Customer Portal, and signed webhooks, but live billing remains disabled by default.

Implemented scaffold:

- Firebase callable: `createStripeCheckoutSession`
- Firebase callable: `createStripeCustomerPortalSession`
- Firebase HTTPS webhook: `stripeWebhook`
- Server-side plan/add-on key to Stripe Price ID mapping through Functions env variables.
- Central workspace billing updates on `companies/{workspaceId}`.
- Safe fallback from expired/cancelled Pro or Team subscriptions to Free/Demo.
- Export access preservation marker during Stripe billing transitions.

Required before enabling even test checkout:

- Install the Functions `stripe` dependency.
- Create Stripe test products/prices.
- Set `STRIPE_BILLING_ENABLED=true` only in a test environment.
- Set Firebase secrets for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- Configure the Stripe webhook endpoint to the deployed `stripeWebhook` URL.
- Keep `STRIPE_ALLOW_LIVE_BILLING=false` until a separate production billing launch review.
