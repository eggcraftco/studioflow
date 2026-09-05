# 2026-09-05T04:09:22Z
# bash -c sed -n '/^## 1\. Architecture/,/^## 2\. Project/p' "infra/amazon/../../docs/security/amazon-hardened-project-design.md"

## 1. Architecture — the final picture

```
                       seller's browser                        Amazon: SP-API (sellingpartnerapi-eu/na/fe.amazon.com)
                             │                                         LWA (api.amazon.com)
                             │ HTTPS                                           ▲
                             ▼                                                 │ TCP/443 only, from ONE static IP
 ┌────────────────────────── nivadesk-amazon  ·  VPC Service Controls perimeter ┼──────────────────────────────┐
 │                                                                              │                               │
 │  amazon.nivadesk.app  ──►  External HTTPS LB (managed cert)                  │                               │
 │                            └─► Cloud Armor "amazon-edge" (Standard): WAF · rate limits · default DENY        │
 │                                     │  serverless NEGs                       │                               │
 │        org policy run.allowedIngress = internal-and-cloud-load-balancing     │                               │
 │        (run.app: closed to the internet; internal authenticated callers only) │                               │
 │                                     ▼                                        │                               │
 │   Cloud Run (gen2), one service per role, each its own service account:      │                               │
 │     amazon-oauth   /oauth/start  /oauth/callback                             │                               │
 │     amazon-admin   /admin/*   (OIDC: amazon-caller@eggcraft-studio only)     │                               │
 │     amazon-sync    (Cloud Scheduler → run.app, OIDC, every 30 min; no LB path) │                               │
 │        every outbound call ──► egress.js hostname allowlist + log ───────────┘                               │
 │                                     │  direct VPC egress (all traffic)                                       │
 │   VPC amazon-vpc / subnet 10.60.0.0/24 (flow logs ON)                                                        │
 │     firewall: egress deny-all → allow tcp:443 → (Private Google Access for Google APIs)                      │
 │     Cloud NAT "amazon-nat" (logging ON) ── static IP "amazon-egress" ────────────────────────────────────────┘
 │                                                                                                              │
 │   Firestore (native; rules deny-all; no clients)   connections · orders (90-day retention)                   │
 │   Secret Manager   LWA client secret · intent HMAC key · one refresh token secret per connection             │
 │   Cloud Logging    bucket "amazon-audit", 400-day retention: audit (admin + data access), Armor, NAT, flow   │
 │   SCC Premium      Event Threat Detection · Cloud Run Threat Detection · SHA · Web Security Scanner          │
 │                                     │                                                                        │
 └─────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┘
                                       │ VPC-SC egress rule: amazon-bridge@ → project 477037475099, run.googleapis.com
                                       │ payload: schema-allowlisted sanitized envelope, nothing else
                                       ▼
 ┌────────────────────────── eggcraft-studio (main project — unchanged) ──────────────────────────────────────┐
 │   ingestAmazonEnvelope  (verifies amazon-bridge@'s OIDC token; rejects any field outside the allowlist)     │
 │   amazonConnectStart    (mints the signed connect intent → /oauth/start URL)                                │
 │   amazonStatus          (calls /admin/* with amazon-caller@'s OIDC token)                                   │
 │   restrictedCustomer    stays EMPTY by construction — A1 never asks for BUYER / RECIPIENT                    │
 └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**As built, 5 September 2026 (differences from the picture):** the bridge
identity is `amazon-sync@` (the diagram's `amazon-bridge@`); only
`amazon-admin` is deployed — `amazon-oauth` and `amazon-sync` wait for
Amazon's credentials, so the load balancer routes `/admin/*` only and Cloud
Armor has no `/oauth/*` rule; `amazon-admin` declares the custom audience
`https://amazon.nivadesk.app`; Security Health Analytics is retired for new
activations and Compliance Manager stands in its place; the VPC Service
Controls perimeter (`amazon_information`) is **dry-run**, not enforced; the
Google API traffic is proven to use `restricted.googleapis.com`. Readiness per
control: `amazon-readiness-criteria.md`.

Amazon Information — order records as Amazon returns them, connection
documents, refresh tokens — never leaves the top box. What crosses the line is
the output of `sanitize.js`: order id, status, totals, line items,
marketplace, timestamps; no buyer, no recipient, no gift message.

## 2. Project
