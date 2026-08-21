# NivaDesk Shopify App — App Store Listing Package

Everything the Partner dashboard listing form needs, ready to paste. English only
(matches the app UI). Owner review required before submission — submission itself is
an owner action.

## App identity

- **App name:** NivaDesk – Custom Order Management
- **App handle:** nivadesk-order-management (already registered, client_id `5a55941c…`)
- **Developer:** EGGCRAFT LIMITED (United Kingdom)
- **Support email:** contact@nivadesk.co.uk
- **App URL / privacy / terms:** https://nivadesk.app · https://nivadesk.app/privacy · https://nivadesk.app/terms

## Tagline (≤ 62 chars)

> Turn Shopify orders into organised production workflows.

## Short description

> Turn Shopify orders into organised production workflows, tasks and customer
> records in NivaDesk — built for makers of custom and made-to-order products.

## Full description

**Built for custom-order businesses.** NivaDesk is an order management workspace for
makers — cake studios, jewellers, framers, furniture makers, print shops, anyone who
builds to order. This app connects your Shopify store to your NivaDesk workspace so
every paid order arrives as a production job, not just a line in a list.

**What it does**

- **Automatic order sync** — new paid Shopify orders appear in NivaDesk in seconds,
  with customer details, line items, totals, payment status and shipping address.
- **Production workflow** — each order lands with your chosen starting status, a task
  checklist from your template, and an optional assignee. Different products can
  follow different workflows.
- **Customer records** — buyers are matched to existing NivaDesk customers by
  Shopify ID, email or phone, so repeat customers keep one history.
- **Status tracking** — payment changes, fulfilments (with tracking numbers), refunds
  and cancellations update the NivaDesk order automatically, with a history log.
  Your own edits in NivaDesk are never overwritten.
- **Historical import** — pull in past orders by date range when you first connect.
- **Filters** — sync everything, or only orders with certain products, collections
  or tags.
- **Works everywhere** — NivaDesk runs on the web, Mac, iPhone and Android, with
  home-screen widgets and a ChatGPT app.

**Pricing** — this app is free. It connects to a NivaDesk account (free demo tier
available; paid plans are billed by NivaDesk, not through Shopify).

**Getting started** takes about two minutes: install the app, press Connect, sign in
to NivaDesk (or create an account), pick a workspace — new orders start syncing
immediately.

## Keywords (no stuffing — 5 focused terms)

`custom orders`, `order management`, `production workflow`, `made to order`, `order sync`

## Category

Orders and shipping → Managing orders (secondary: Selling products → Custom products)

## Listing assets checklist

| Asset | Spec | Source/plan |
| --- | --- | --- |
| App icon | 1200×1200 px, no text | Existing NivaDesk workspace icon (same as widgets) on brand background |
| Feature banner | 1600×900 px | NivaDesk order board + Shopify order strip visual; reuse hero styling from nivadesk.app |
| Screenshots (3–6, 1600×900) | Desktop | 1) App dashboard (Connected + sync overview) 2) NivaDesk order with Shopify strip 3) Sync settings (workflow template) 4) Import screen 5) NivaDesk Settings → Connected Shopify stores |
| Demo video (optional but planned) | ≤ 3 min, hosted | See scenario below; reuse the AVFoundation compression pipeline from the site demo |

## Demo video scenario (~90 s)

1. Shopify admin: a paid order comes in (#1001-style custom item).
2. Cut to NivaDesk: the order is already there — strip "Shopify · store · #1001 ·
   Payment: paid", status "Not Yet", task checklist created.
3. Open Sync settings in the Shopify app: show default status, todo template, filters.
4. Mark the order fulfilled in Shopify with tracking → NivaDesk flips to Dispatched
   with the tracking number in Shipping & Tracking.
5. Close on the NivaDesk dashboard (profit widgets) + "Free app · nivadesk.app".

## Review instructions (for Shopify app review)

> The app requires a NivaDesk account. Use this dedicated review login:
> **review@nivadesk.app** (password supplied in the review notes field, never in the
> public listing). Install the app, press "Connect existing NivaDesk account", sign in
> with the review account, choose the "My Studio" workspace, then create any test
> order in the store and mark it paid — it appears in the NivaDesk web app
> (https://nivadesk.app/orders) within seconds, carrying a "Shopify" source strip.
> Protected customer data (name, email, phone, address) is used solely to display the
> merchant's own orders inside their workspace; see the privacy details in the data
> protection section and https://nivadesk.app/privacy.

⚠️ Before submission, rotate the review-account password (it was shared in a working
session) and put the fresh one only in the private review notes.

## Pre-submission checklist (owner actions)

- [x] `shopify app deploy` — config version `nivadesk-order-management-3` (12 Aug 2026).
- [x] App server on permanent hosting (Cloud Run) + `application_url`/redirects update
      (12 Aug 2026; branded root page live).
- [x] Public distribution selected in Partner dashboard (12 Aug 2026).
- [x] Partner dashboard: step-2 data-protection answers saved 16/16 (12 Aug 2026,
      COMPLIANCE.md §4).
- [x] One-time Shopify App Store registration — done 13 Aug 2026 (Organization,
      attestation, $19 paid on owner's Visa with explicit approval).
- [x] Listing form filled & saved as **Draft** (13 Aug 2026): store name
      **"NivaDesk Order Management"** (30-char limit forced the short form), category
      Orders and shipping › Orders › Orders - Other, English, intro/details/5 features
      ("Shopify" not allowed in intro — reworded to "store orders"), feature banner +
      5 screenshots + alt texts, support email, privacy/terms/guide links, **Free**
      public plan (handle `free`), subtitle + 5 search terms + SEO title/meta, no
      sales-channel requirement, review email contact@nivadesk.co.uk / submission
      email contact@eggcraft.co.uk, test account username + description + step-by-step
      testing instructions.
- [x] Test account password entered by owner (kept existing password — owner's call;
      account description + testing instructions filled). Listing shows **0 issues**.
- [x] Screencast recorded 20 Aug 2026 → https://nivadesk.app/shopify-review-demo.mp4
      (7:03, 2× speed, error segment cut; dashboard → connection → sync settings →
      live order #1003 create/sync → import 3/3 idempotent → fulfilment with tracking
      → NivaDesk "Done"/Fulfilled live update → sync history). URL saved in listing.
- [x] Emergency contact saved: contact@eggcraft.co.uk / +44 7761 304750 (20 Aug).
- [x] Automated checks ALL PASSED (20 Aug): auth after install, redirect to app UI,
      compliance webhooks, HMAC, TLS. Review page: 9/10 steps green.
- [x] Live smoke via screencast run itself: create→sync→import→fulfil→history all ok
      on config v4 + nivadesk-connect (order #1003 residue in review workspace).
- [x] Requirements checkbox ticked by owner + AI self-review marked done (20 Aug —
      our own documented review: COMPLIANCE.md checklist + TESTS.md matrix + all
      automated checks green).
- [x] **SUBMITTED FOR REVIEW — 20 Aug 2026, with explicit owner approval.** Status:
      "Submitted — assigning a reviewer". Issues will be emailed to
      contact@eggcraft.co.uk — respond promptly to keep review moving.
- [ ] Post-approval decision: listing currently URL-only visibility; "Make fully
      visible" button on the review page makes it appear in App Store search/browse.

## Merchant-facing setup guide (for nivadesk.app/guide or support doc)

1. Install "NivaDesk – Custom Order Management" from the Shopify App Store.
2. In the app, press **Connect existing NivaDesk account** (or create one free).
3. Sign in on the NivaDesk page that opens and choose your workspace (owners only).
4. Back in Shopify the page shows **Connected** — new paid orders now sync
   automatically.
5. Optional: open **Sync settings** to set a starting status, task template,
   assignee, or product/tag filters; use **Import orders** to backfill history.
6. Orders show a green **Shopify** strip in NivaDesk with a "View in Shopify" link;
   fulfilments, refunds and cancellations stay in sync. Disconnect any time from
   either side — imported orders stay in your workspace.
