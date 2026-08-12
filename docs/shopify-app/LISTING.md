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

- [ ] `shopify app deploy` — version the config (webhooks, scopes) for production.
- [ ] App server on permanent hosting (Cloud Run) + `application_url`/redirects update.
- [ ] Partner dashboard: paste step-2 data-protection answers (COMPLIANCE.md §4).
- [ ] Listing form: paste this package; upload icon/banner/screenshots.
- [ ] Rotate review@nivadesk.app password → private review notes only.
- [ ] Final smoke test on production hosting (TESTS.md staging checklist).
- [ ] Submit for review (explicit owner approval required — standing instruction).

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
