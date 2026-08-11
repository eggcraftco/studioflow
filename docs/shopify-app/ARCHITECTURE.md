# NivaDesk – Shopify App: Integration Architecture

Status: design approved-pending / implementation in progress
Owner: EGGCRAFT LIMITED · Firebase project `eggcraft-studio` (europe-west2)

## 1. What already exists (reused, not rebuilt)

NivaDesk already ships a "manual webhook" Shopify tier in `functions/index.js`:

| Asset | Where | Reused for the app |
|---|---|---|
| `mapShopifyOrderToSiparis` | functions/index.js ~14400 | ✅ the app-tier order mapper (line items reconciled to total, billing→customer / shipping→order, history log, payment seeding) |
| `shopifyOrderDocId` → `shopify_{companyId}_{orderId}` | ~14306 | ✅ idempotency key (unique external reference) |
| `upsertIntegrationCustomer(companyId, contact, "shopify")` | ~13977 | ✅ customer mirroring (name/email/phone/addresses) |
| `shopifyOrderWebhook` + `getShopifyWebhookToken` | ~14500 | ⛔ legacy tier — stays untouched for existing users |
| `requireWorkspaceForBilling` auth pattern | ~2338 | ✅ template for connection callables |
| `sendPushNotificationToCompany` | shared | ✅ new-order pushes |

Data model facts:
- Orders live in top-level **`siparisler`** collection, `companyId` field scopes them.
- Workspaces are **`companies/{companyId}`** docs; membership = `memberUids` array + members map; helpers `uidHasCompanyAccess`, `uidIsCompanyOwner`, `activeCompanyIdForUid`.
- Customers: per-company customer list maintained by `upsertIntegrationCustomer`.
- No first-class "workflow template" entity exists → templates are implemented inside the
  integration settings (see §6) and produce `status` + `todoItems` on the order.

## 2. Two tiers, one pipeline

```
Legacy tier (unchanged):  Shopify admin → manual webhook URL (?companyId&token) → shopifyOrderWebhook
App tier (new):           Shopify App Store app → OAuth install → app webhooks (HMAC) → shopifyAppWebhook
                                                          └→ embedded UI (Polaris) → Firebase callables
Both tiers converge on:   mapShopifyOrderToSiparis → siparisler/{shopify_companyId_orderId} (merge)
                          + upsertIntegrationCustomer + push notification
```

The app tier NEVER modifies legacy functions. Shared logic is extracted into
plain functions (no signature changes to exported endpoints).

## 3. Components & hosting

| Component | Tech | Runs on |
|---|---|---|
| Embedded app UI + OAuth server | Shopify React Router template (`@shopify/shopify-app-react-router`), App Bridge, Polaris | Cloud Run service `nivadesk-shopify-app` in the SAME GCP project, europe-west2 |
| Webhook ingest + business logic | New Firebase Functions (v2, europe-west2) | existing `functions/` codebase |
| Session storage | Custom `SessionStorage` adapter → Firestore `shopifySessions` | Firestore |
| Store↔workspace links, settings, logs | Firestore `shopifyStores` (server-only) | Firestore |
| NivaDesk connect page | Next.js route `/connect/shopify` in studioflow-web | Hostinger (existing web) |

Why Cloud Run for the app server: the official template is a Node SSR app; Cloud Run keeps
it inside the existing GCP project/billing/region with `gcloud run deploy` (Dockerfile ships
with the template). Firebase Functions can't host it directly; nothing else new is introduced.

## 4. Firestore data model (new, all server-only)

```
shopifyStores/{shopDomain}            e.g. "my-store.myshopify.com"
  shop, shopName, email               // from OAuth shop payload
  accessToken                         // OFFLINE token — never leaves the server
  scopes, apiVersion
  companyId                           // linked NivaDesk workspace ("" until connected)
  linkedUid, linkedEmail, linkedAt    // who connected it
  status: "pending" | "active" | "paused" | "uninstalled"
  settings: {
    autoSync: true,
    filterMode: "all" | "include_products" | "include_collections" | "exclude_products",
    productIds: [], collectionIds: [],
    includeTags: [], excludeTags: [],
    importUnpaid: false,              // default: keep the paid-only gate
    defaultStatus: "Not Yet",         // workflow start stage
    todoTemplate: [ { title } ],      // auto task list per order
    assigneeUid: "", assigneeEmail: "",
    syncPaymentStatus: true, syncFulfilment: true, syncRefunds: true, syncCancellations: true,
    pushTracking: false, pushTags: false   // reverse sync, opt-in, default OFF
    productWorkflows: [ { match: {productIds|collectionIds|tags}, status, todoTemplate } ]
  }
  stats: { syncedOrders, failedCount, lastSyncAt, lastWebhookAt }
  connectNonce, connectNonceExpiresAt // one-time handshake state (§5)

shopifyStores/{shop}/syncLog/{autoId}
  ts, topic, shopifyOrderId, shopifyOrderNumber, nivadeskOrderId,
  status: "ok" | "skipped" | "failed", error, payloadGz?   // payload kept ≤7d for retry

shopifyStores/{shop}/webhookEvents/{X-Shopify-Event-Id}    // idempotent retry guard, TTL 7d
shopifyStores/{shop}/imports/{importId}
  range, filters, total, processed, created, skipped, failed[], status, startedAt, finishedAt

shopifySessions/{id}                  // Shopify app session storage adapter
```

Firestore security rules: `shopifyStores/**` and `shopifySessions/**` get an explicit
`allow read, write: if false;` — only the Admin SDK (functions + app server) touches them.
Clients read integration state exclusively through callables.

## 5. Account connection handshake (embedded app ↔ Firebase Auth)

Firebase Auth inside the Shopify admin iframe is unreliable (third-party storage). The
connect flow therefore hops through the NivaDesk web app in a top-level tab:

1. Embedded app calls its own server → server (service account) calls function
   `shopifyBeginConnect{shop}` → writes `connectNonce` (random 32B, 15 min TTL) on the
   store doc → returns `https://nivadesk.app/connect/shopify?shop=…&nonce=…`.
2. App opens that URL in a new tab (App Bridge `open`). The page runs inside the normal
   NivaDesk web app: existing Firebase Auth session, or sign-in / **create account** UI.
3. Page lists the user's workspaces (`companies` where `memberUids` contains uid — via
   existing patterns) → user picks one → calls callable `shopifyCompleteConnect`
   `{shop, nonce, companyId}`. Function verifies nonce + expiry + `uidHasCompanyAccess`,
   then sets `companyId/linkedUid/status:"active"`, clears the nonce, seeds default settings.
4. Embedded app polls `shopifyConnectionStatus` (server-side) and flips to the connected
   dashboard. Disconnect = callable clears `companyId`, sets `status:"pending"` (token kept
   so re-connect works); Reconnect = new nonce; Test = round-trip Shopify GraphQL `shop`
   query + Firestore read.

Security properties: the nonce binds THIS shop to THIS browser session; a store can only be
linked by an authenticated NivaDesk user to a workspace they belong to; access tokens never
appear in any client.

## 6. Webhook pipeline (app tier)

Topics (app TOML → all point at one function `shopifyAppWebhook`):
`orders/create, orders/updated, orders/paid, orders/cancelled, orders/fulfilled,
fulfillments/create, fulfillments/update, refunds/create, customers/create,
customers/update, app/uninstalled` + compliance `customers/data_request,
customers/redact, shop/redact`.

Per delivery:
1. Verify `X-Shopify-Hmac-Sha256` against the app **client secret** (defineSecret
   `SHOPIFY_APP_SECRET`) on the raw body; 401 otherwise.
2. Resolve store by `X-Shopify-Shop-Domain`; unknown/uninstalled → 200 (ack, log).
3. Idempotency: `webhookEvents/{X-Shopify-Event-Id}` create-if-absent transaction;
   duplicate → 200 immediately.
4. Filters (§7) → skipped orders logged as `skipped`.
5. Topic switch:
   - `orders/create|updated|paid` → `mapShopifyOrderToSiparis` merge write (+ paid gate
     unless `importUnpaid`), payment-status history entries.
   - `orders/cancelled` → status "Cancelled" + history.
   - `orders/fulfilled` / `fulfillments/*` → `isDispatched`, `trackingNumber`, `courier`
     mapping + history.
   - `refunds/create` → history entry + `Shopify Status: refunded` custom field patch.
   - `customers/*` → `upsertIntegrationCustomer` only.
   - `app/uninstalled` → store `status:"uninstalled"`, token cleared, sessions purged.
   - compliance topics → §9.
6. Workflow template (§8) applied only on CREATE.
7. Outcome → `syncLog` row + `stats` counters. Failures return 500 (Shopify retries) and
   keep the gz payload for the manual Retry button (callable `shopifyRetrySyncRow`).

## 7. Filters

Evaluated identically in webhook + import: product include/exclude by `line_items[].product_id`;
collection filters resolved at sync time via GraphQL `product.inCollection` lookups memoised
in `shopifyStores/{shop}/collectionCache` (24h); tag include/exclude on `order.tags`.
An order syncs if ANY line item passes product/collection rules and tag rules pass.

## 8. Workflow + tasks

On order creation the store's `defaultStatus`, `todoTemplate` (→ `todoItems` with fresh ids,
uncompleted) and `assigneeUid/Email` are stamped onto the mapped order; `productWorkflows`
rules (first match by product/collection/tag) override the default. Stage names in the spec
(Design Required, In Production, …) ship as suggested presets in the app UI; they write the
same `status` field every client already renders.

## 9. GDPR / compliance

- `customers/data_request` → compile that customer's orders for that shop's `companyId`
  into a syncLog "data_request" row + email to the workspace owner (existing SMTP path)
  so the merchant can fulfil their obligation.
- `customers/redact` → for the shop's companyId: matching customer record + their
  Shopify-sourced orders get personal fields anonymised (name → "Redacted customer",
  contact/address fields cleared); financial totals stay.
- `shop/redact` (48h after uninstall) → delete `shopifyStores/{shop}` + sessions +
  subcollections. Orders already imported belong to the merchant's own NivaDesk
  workspace and are retained under NivaDesk's ToS (documented in listing + privacy page).
- Minimal scopes: `read_orders, read_customers, read_products` (+ `write_fulfillments,
  write_orders` ONLY when the user enables reverse sync — requested via optional scope
  update flow). No others.

## 10. Billing stance (v1)

The Shopify app is **free to install**; it requires a NivaDesk account whose subscription
is billed by NivaDesk (Stripe) outside Shopify — the app itself charges nothing through
Shopify, so the Billing API is not triggered. Listing copy discloses this explicitly.
If App Review pushes back, fallback design (documented, not built): Shopify Billing
subscription mapped to a NivaDesk entitlement doc — requires owner approval before any
live charge.

## 11. Reverse sync (opt-in, default off)

Firestore trigger on `siparisler` writes: when the order has `Shopify Order ID`, the store
has `pushTracking`/`pushTags` on and relevant fields changed → GraphQL
`fulfillmentCreateV2` (tracking number + carrier) / `tagsAdd`. Loop-guard: writes made by
the webhook path stamp `lastShopifySyncAt`; the trigger skips docs whose change originated
there (field comparison + marker).

## 12. Rollout order

1. Backend: connection callables + `shopifyAppWebhook` (+ shared mapper extraction).
2. Cloud Run app scaffold + Firestore session storage + OAuth install flow.
3. Connect page in studioflow-web (`/connect/shopify`).
4. App UI screens (Dashboard, Connection, Settings, Import, History, Support).
5. Import + filters + workflow templates.
6. NivaDesk Integrations settings section + order badges.
7. Security/rules + GDPR + tests + docs + listing package.

## 13. What requires the account owner (cannot be done by the agent)

- Shopify **Partner account** creation/login + dev store creation (browser sign-up).
- `shopify app deploy` / CLI auth (browser OAuth) — agent prepares everything;
  owner runs the login-gated commands (documented step-by-step).
- Final App Store submission, any real payment.
