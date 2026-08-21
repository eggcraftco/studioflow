# NivaDesk Shopify App — Security, GDPR & Billing Compliance

Verified against the production deployment on **12 Aug 2026** (project `eggcraft-studio`,
region `europe-west2`). Every claim below was checked in code and, where marked
**[live-tested]**, exercised against the deployed functions.

## 1. Security checklist

| Control | Where | Status |
| --- | --- | --- |
| Webhook HMAC (SHA-256, base64, raw body) | `shopifyAppHmacValid` — functions/index.js:21893, enforced at :22378 | ✅ [live-tested] valid sig → 200, invalid sig → 401 |
| Timing-safe secret comparison | `nvTimingSafeEqual` (12 call sites, incl. bridge auth + HMAC + connect nonce) | ✅ |
| Access token custody | Server-only: `shopifyStores/{shop}.accessToken`; `shopifyPublicStoreView` whitelists fields (no token, no nonce) — :21544 | ✅ |
| Firestore client lockout | `firestore.rules:597` — `shopifyStores/**` and `shopifySessions/**` `allow read, write: if false` (deployed) | ✅ |
| App-server ↔ Functions auth | `x-nivadesk-bridge-secret` header checked by `shopifyBridgeAuthed` (:21537); secret in Secret Manager, local copy only in gitignored `.env` | ✅ |
| Secrets management | `defineSecret("SHOPIFY_APP_SECRET")`, `defineSecret("SHOPIFY_BRIDGE_SECRET")` — no secrets in code or repo | ✅ |
| Workspace link authorisation | `shopifyCompleteConnect` requires signed-in NivaDesk **owner** (`requireWorkspaceForBilling(request, true)`) + single-use nonce (24 B random, 15 min expiry, timing-safe compare, cleared on use) | ✅ [live-tested] twice (roletest123, review) |
| Member-facing reads | `getShopifyIntegrationsForWorkspace` (member) returns public view only; `setShopifyIntegrationState` owner-only with store-ownership check | ✅ |
| Webhook idempotency | Per-event claim docs `shopifyStores/{shop}/webhookEvents/{eventId}` (+7 d TTL), claim released on failure so Shopify retries land | ✅ [live-tested] out-of-order `orders/paid` before `orders/create` → no duplicate order |
| Input hygiene | `normalizeShopDomain` regex, `sanitizeShopifyStoreSettings` whitelist+caps, `shopifyCleanStringArray` caps, payloadJson capped at 180 000 chars | ✅ |
| Scopes | Read-only: `read_orders, read_customers, read_products, read_fulfillments`. No write scopes in v1 (reverse sync deferred; upgrade path in ARCHITECTURE.md §Scopes) | ✅ |

## 2. GDPR / privacy webhooks — live test results (12 Aug 2026)

All three mandatory topics point at `shopifyAppWebhook` (`shopify.app.toml`
`[webhooks.privacy_compliance]`) and are **always acknowledged with 200 after HMAC
passes**, even for unknown shops.

| Topic | Behaviour | Result |
| --- | --- | --- |
| `customers/data_request` | Audit row `shopifyStores/{shop}/privacyRequests/{eventId}` (topic + timestamp + capped payload). Merchant is contacted manually with the export — the data we hold per customer is the order + customer records already visible in their own NivaDesk workspace. | ✅ 200, audit row written |
| `customers/redact` | Audit row + anonymisation of **Shopify-sourced** records only: `siparisler` docs matching companyId+email/phone with `customFields.Source == "Shopify"` get customerName "Redacted customer" + contact/shipping fields cleared; `musteriler` matches with `source == "shopify"` cleared. Merchant-authored data untouched. | ✅ 200 (graceful on unknown store: audit only) |
| `shop/redact` | `recursiveDelete(shopifyStores/{shop})` (token, settings, sync log, webhook claims, privacy audit) + batch-delete of `shopifySessions` for the shop. Orders already imported belong to the merchant's NivaDesk workspace and follow NivaDesk's own retention/deletion terms (stated in listing + privacy policy). | ✅ 200, sample shop subtree verified purged; live store untouched |

Negative path: request with invalid `X-Shopify-Hmac-Sha256` → **401**, nothing processed. ✅

Note: `shopify app webhook trigger` CLI samples sign with a different secret and are
correctly rejected by the endpoint — use hand-signed curl (see git history) or real
store events for verification.

## 3. Billing stance (v1)

- The Shopify app is **free to install**. It requires an existing NivaDesk account;
  NivaDesk's own plans (including the free demo tier) are sold on nivadesk.app via
  Stripe, **outside** Shopify — the app itself sells nothing and takes no payment.
- No Shopify Billing API usage in v1. If App Review requires purchases to run through
  Shopify Billing, the documented fallback (ARCHITECTURE.md §Billing) is a Billing API
  bridge SKU — **do not build or enable without explicit owner approval** (standing
  instruction: ask before any real charge or paid-plan step).
- Listing copy must state clearly: free app, connects to a NivaDesk workspace, NivaDesk
  plans are billed by NivaDesk.

## 4. Protected customer data (Partner dashboard)

**Step 1 — done (12 Aug 2026):** Protected customer data + all four fields (Name,
Email, Phone, Address) approved with reasons *Store management* and *App functionality*.

**Step 2 — done (12 Aug 2026): 16/16 saved in the Partner dashboard.** The live form
turned out to be Yes/No/Not-applicable radios (not free text). Answers given, grounded
in the notes below: **13 × Yes**; **Not applicable** for the three consent questions
(customer consent decisions, opt-out of data sale, automated decision-making) because
the app does no marketing, never sells data, and makes no automated decisions.
Audits free-text field: "No third-party audit of the app itself yet. Infrastructure
runs on Google Cloud / Firebase (ISO 27001, SOC 1/2/3 certified), region europe-west2
(London)." The draft answers below remain as the supporting rationale.

1. **Why does your app need protected customer data?**
   NivaDesk turns Shopify orders into production job records. Customer name and
   contact details are shown on each imported order so the merchant can fulfil it and
   contact the buyer; they are visible only inside the merchant's own NivaDesk
   workspace.
2. **Where is the data stored?**
   Google Cloud / Firebase (Cloud Firestore, Cloud Functions, Secret Manager), region
   `europe-west2` (London, UK/EEA-adequate).
3. **Encryption in transit?**
   Yes — TLS 1.2+ on every hop (Shopify → Cloud Functions, app ↔ Firestore, clients ↔
   API).
4. **Encryption at rest?**
   Yes — Google Cloud default AES-256 encryption at rest for Firestore, Cloud Storage
   and Secret Manager.
5. **Who can access the data?**
   The merchant's own workspace members inside NivaDesk (role-gated), and the two
   EGGCRAFT LIMITED operators for support/debugging under Google Cloud IAM with
   individual accounts. No third-party access; no sale or sharing of data.
6. **Access controls?**
   Firebase Authentication + Firestore security rules (workspace membership enforced
   per document; integration collections are server-only), Google Cloud IAM for
   operational access, API tokens confined to Secret Manager.
7. **How long is data retained?**
   Shop-level data (OAuth token, settings, sync logs): while the app is installed;
   purged automatically on the `shop/redact` webhook (~48 h after uninstall).
   Imported orders/customers become part of the merchant's NivaDesk workspace and
   follow NivaDesk's retention (deleted when the merchant deletes them or the
   workspace/account is deleted).
8. **How is data deleted on request?**
   `customers/redact` anonymises Shopify-sourced customer fields automatically;
   `customers/data_request` is logged and answered by support; `shop/redact` deletes
   the entire shop record tree. Merchants can also delete any imported order or
   customer directly in NivaDesk.
9. **Do you process data for any purpose other than serving the merchant?**
   No. No advertising, profiling, enrichment, training, or resale. Order data is used
   solely to display and manage the merchant's own orders.
10. **Subprocessors / third parties?**
    Google Cloud Platform (hosting, database, secrets) only. No analytics or tracking
    SDKs receive protected customer data.
11. **Data minimisation?**
    Read-only scopes; only fields needed for order management are stored (name, email,
    phone, shipping address, line items, totals, status). No payment card data is ever
    received or stored.
12. **Staff access policy?**
    Two named operators; access via individual Google accounts protected by 2FA;
    production access only for support/incident handling.
13. **Logging & monitoring?**
    Cloud Functions logs (Google Cloud Logging) with default retention; webhook
    processing is audited per event (sync log + privacy request audit rows).
14. **Incident response?**
    Google Cloud alerting + function error logs reviewed by the operators; affected
    merchants notified via their account email without undue delay, and Shopify
    notified as required by the Partner Program Agreement.
15. **Backups?**
    Firestore point-in-time recovery (7 days) + daily backups retained 14 days, same
    region, same encryption. Backups expire automatically; redaction requests carry
    through as backups roll off.
16. **Compliance frameworks?**
    Infrastructure: Google Cloud (ISO 27001, SOC 1/2/3). Company: EGGCRAFT LIMITED
    (UK) operates under UK GDPR / Data Protection Act 2018; privacy policy at
    https://nivadesk.app/privacy.

## 5. Residual items before public submission

- [x] Paste step-2 answers into Partner dashboard — done 12 Aug 2026 (16/16 saved).
- [ ] Listing privacy/data section must link nivadesk.app/privacy + state retention
      terms for imported orders. (Listing form blocked on the one-time $19 App Store
      registration — owner: business questions + attestation + payment.)
- [x] `shopify app deploy` — config version `nivadesk-order-management-3` released
      with Cloud Run URLs (12 Aug 2026).
- [x] Cloud Run deploy of the app server + `application_url` update — service
      `nivadesk-shopify-app`, europe-west2 (12 Aug 2026; branded root page live).
- [x] Public distribution selected in the Partner dashboard (12 Aug 2026 — required
      gateway to the listing form; permanent by design).
