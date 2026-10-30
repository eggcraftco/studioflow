# nivadesk.app off Hostinger — Cloud Run (London) behind Google's load balancer

**Status (30 Oct 2026): prepared and tested locally. Nothing is deployed; DNS is unchanged.**

## Why

Hostinger answers `429 Too Many Requests` to Amazon's networks (72.21.192.0/19, 52.94.x, AS16509),
Meta's (2a03:2880::) and, by Hostinger's own documentation, Microsoft's — at server level, "cannot be
disabled for individual websites". Seen in hPanel → nivadesk.app → Analizler → 4xx: Amazon's reviewer
got 429 on the page and its assets on 30 Oct, the second Appstore rejection for "website not
accessible". A Cloudflare proxy does not help: Hostinger reads the forwarded visitor address.
`docs.nivadesk.app` (infra/amazon/docs-mirror) covers the reviewed public pages, but sign-in,
sign-up and the app itself stay unreachable from those networks, and link previews on WhatsApp,
Instagram and Facebook fail for every nivadesk.app link.

## Options compared

| | Cloud Run + Google ALB (chosen) | Firebase Hosting → Cloud Run | Cloudflare Workers (OpenNext) | Hostinger VPS |
|---|---|---|---|---|
| Amazon/Meta/Microsoft reach the site | yes | yes | yes | unknown (same network) |
| Host header and cookies reach the app | **yes** | no: Host becomes run.app, only `__session` cookie passes — **breaks eBay connect** (connect.nivadesk.app → /ebay/* cookies) | Host lost unless the app runs on Workers | yes |
| App changes | none (standalone build flag only) | /f/ host logic, eBay flow rework | large: Workers runtime, bundle size limits | none |
| Region | europe-west2 (London), with the data | europe-west2 | global edge | Hostinger DC |
| TLS 1.2+ policy (Amazon DPP) | yes, SSL policy | Google default | Cloudflare setting | self-managed |
| Approx. cost | ≈ £25–35/month (LB ≈ $18, Cloud Run min 1 ≈ $10–13, rest pennies) | ≈ £10–15 | ≈ £0–5 | ≈ £5–15 + upkeep |
| Ops | scripts here; Google-managed cert | managed | managed | patching, security, backups |

Firebase App Hosting is not offered in London (europe-west4 is the nearest). The Hostinger plan stays
for eggcraft.co.uk, ticktoon.co.uk and the other sites; only nivadesk.app moves.

## What was proved locally (30 Oct)

`NIVADESK_STANDALONE=1 next build` → `node .next/standalone/server.js`, compared with live Hostinger:
`/`, `/pricing`, `/login`, `/signup`, `/guide`, `/privacy`, `/api/app-build` byte-identical;
`/integrations/amazon`, `/settings` differ only by build id/nonce; OAuth metadata identical
(`issuer https://nivadesk.app`); security headers, CSP-report-only nonce, static chunks and `/f/`
refusals identical. Hostinger's environment holds 9 `NEXT_PUBLIC_*` values and one secret,
`NIVADESK_EBAY_CALLBACK_KEY` (bound here from Secret Manager `EBAY_CALLBACK_KEY` — confirm it is the
same value before cutover; it was not read).

## Prerequisites (owner)

1. Enable `compute.googleapis.com` and `certificatemanager.googleapis.com` on `eggcraft-studio`
   (both are off today).
2. A gitignored `.env.production.local` at the repo root with the nine `NEXT_PUBLIC_*` lines from hPanel.
3. Confirm `EBAY_CALLBACK_KEY` in Secret Manager equals Hostinger's `NIVADESK_EBAY_CALLBACK_KEY`.

## Cutover (each step is a live change; nothing moves visitors until step 5)

1. `ACTION=apply infra/cloudrun/deploy.sh` — Cloud Build image, Cloud Run `nivadesk-web` (min 1 instance,
   reachable only through the load balancer). Readback printed.
2. `ACTION=apply infra/cloudrun/edge.sh` — static IP, serverless NEG, backend (logging on), URL map,
   TLS 1.2 policy, Certificate Manager cert for nivadesk.app + www, HTTPS and http→https rules. It prints
   two `_acme-challenge` CNAME records.
3. Add those two CNAMEs in Cloudflare (DNS only). Wait for `managed.state ACTIVE` (minutes).
4. `infra/cloudrun/smoke.sh <LB_IP>` — every path compared with Hostinger through the real certificate.
   Must print `SMOKE OK`. Also sign in, open an order, start the eBay connect, in a browser pinned to the
   LB IP (e.g. Chrome `--host-resolver-rules="MAP nivadesk.app <LB_IP>"` on a separate profile).
5. **Cutover:** Cloudflare `nivadesk.app` A `76.13.132.222` → `<LB_IP>` (DNS only, TTL 5 min). `www` is a
   CNAME to the apex and follows. Hostinger keeps running the same commit.
6. Watch: `infra/cloudrun/smoke.sh` (no IP) → `SMOKE OK`; Cloud Run logs show traffic; Hostinger's
   Analizler request count falls to ~0 within the TTL; ChatGPT/Claude connectors, eBay connect, branded
   customer domains (wild-sunset fetches https://nivadesk.app), mcp.nivadesk.app (Firebase, untouched).
7. Pipeline: the web train deploys with `ACTION=apply infra/cloudrun/deploy.sh` (and keeps pushing to
   Hostinger until it is retired), later a Cloud Build trigger on the GitHub repo.

## Roll back

DNS: `nivadesk.app` A back to `76.13.132.222` — Hostinger still serves the same build; effective within
the 5-minute TTL. Then, if wanted, `ACTION=rollback infra/cloudrun/edge.sh` and delete the Cloud Run
service. Nothing in Firestore, Functions, Storage or Auth changes at any step.

## Proving it from the networks that were blocked

- **Meta:** Facebook Sharing Debugger on `https://nivadesk.app/` before (Hostinger: 429/empty preview)
  and after (title and image).
- **Microsoft:** LinkedIn Post Inspector, same before/after.
- **Amazon/AWS:** `curl -I https://nivadesk.app/` from AWS CloudShell (any AWS account), and the
  load balancer log (`httpRequest.remoteIp` in AS16509 with status 200) when Amazon's reviewer visits.
- Hostinger's 4xx log stops showing 429 for nivadesk.app because nivadesk.app no longer goes there.

## After cutover, small follow-ups

- `NIVADESK_TRUSTED_PROXY_HOPS=2` assumes Google's `X-Forwarded-For: <client>, <load balancer>`; if eBay
  connect throttles everyone together, redeploy with the value the request logs show.
- `customers.nivadesk.app` (Cloudflare for SaaS fallback origin) still names Hostinger's IP; the Worker
  fetches `https://nivadesk.app`, so nothing breaks, but point it at the LB IP once settled.
