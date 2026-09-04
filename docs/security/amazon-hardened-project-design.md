# The Amazon project — design

**Date:** 5 September 2026
**Status:** design only. **Nothing has been created.** Four steps in §12 need
the user's sign-off before they run: creating the project, activating Security
Command Center, enforcing the VPC Service Controls perimeter, and the DNS
change for `amazon.nivadesk.app`.

**Goal:** the four controls in `amazon-readiness-criteria.md` — network
segmentation, firewall/ACL, IDS/IPS, anti-malware on privileged endpoints —
implemented in production and evidenced, in a boundary built for Amazon
Information from the first day, without touching the main NivaDesk project's
407 functions or its four clients.

## 1. The shape, in one picture

```
                        seller's browser                   Amazon (SP-API, LWA)
                              │                                    ▲
                              │ HTTPS                              │ HTTPS 443 only, FQDN-allowlisted
                              ▼                                    │
   ┌──────────────────── nivadesk-amazon (VPC-SC perimeter) ───────┼───────────────────────┐
   │                                                                │                       │
   │  amazon.nivadesk.app ──► External HTTPS LB ──► Cloud Armor     │                       │
   │                          (managed cert)        WAF · rate ·    │                       │
   │                                                default deny    │                       │
   │                                    │                           │                       │
   │        ingress: internal-and-cloud-load-balancing (org policy) │                       │
   │                                    ▼                           │                       │
   │   Cloud Run gen2 (Functions v2):  oauthStart · oauthCallback · admin · syncOrders(sched) │
   │        each with its own service account                       │                       │
   │                                    │                           │                       │
   │   Firestore (native, deny-all rules) ── connections, orders (Amazon Information)        │
   │   Secret Manager ── LWA client secret, one sealed refresh token per connection          │
   │   Cloud Logging (400-day bucket) · SCC Premium (ETD + Cloud Run Threat Detection)       │
   │                                    │                           │                       │
   │   VPC amazon-vpc ── Serverless VPC Access connector ── Cloud NAT (static IP) ──► SWP ───┘
   │                                    │                              FQDN allowlist
   └────────────────────────────────────┼──────────────────────────────────────────────────┘
                                        │ egress rule: bridge SA → one endpoint, sanitized envelope only
                                        ▼
   ┌──────────────────── eggcraft-studio (main project, unchanged) ─────────────────────────┐
   │   ingestAmazonEnvelope (OIDC-verified, schema-allowlisted) ──► commerce engine          │
   │   amazonConnectStart (mints a signed connect intent) · amazonStatus (calls admin)       │
   │   restrictedCustomer subcollection: stays EMPTY by design (A1 asks for no buyer data)   │
   └────────────────────────────────────────────────────────────────────────────────────────┘
```

Amazon Information — order records as Amazon returns them, connection
documents, refresh tokens — never leaves the top box. What crosses the line
is a **sanitized envelope**: the output of `functions/commerce/amazon/sanitize.js`,
which already exists and is tested, carrying order id, status, totals, line
items, marketplace and timestamps, and nothing that identifies a buyer.

## 2. Project

| | |
|---|---|
| Project id | `nivadesk-amazon` (proposal; ids are permanent) |
| Organisation | `eggcraft.co.uk` (378239481010) |
| Billing account | `01789B-AD5731-2C3C72` |
| Region | `europe-west2` (London) — everything regional, matching the application's stated region |
| Firebase | Enabled, for Firestore and the Functions deploy tooling only. **No Firebase Auth users, no client SDK access**: Firestore rules are `allow read, write: if false` at the root. Storage is **not** enabled — the zone stores no files |
| Labels | `boundary=amazon`, `data=amazon-information` |

**Organisation policies set on the project** (these are what make the zone's
guarantees structural rather than a matter of remembering):

| Constraint | Value | Why |
|---|---|---|
| `run.allowedIngress` | `internal-and-cloud-load-balancing` only | no service can ever be reachable at its `run.app` address |
| `iam.disableServiceAccountKeyCreation` | enforced | no downloadable keys; identities exist only inside Google's runtime |
| `iam.automaticIamGrantsForDefaultServiceAccounts` | enforced (disabled grants) | the default compute account gets no Editor role |
| `compute.vmExternalIpAccess` | deny all | there are no VMs; this keeps it that way |
| `compute.restrictVpcPeering` | deny all | no peering into the zone |
| `gcp.resourceLocations` | `in:europe-west2-locations`, `in:eu-locations` | data stays in the stated region |
| `storage.uniformBucketLevelAccess` | enforced | for the deploy source bucket, the only bucket |

## 3. Services and what each one is for

All services are Cloud Functions (2nd gen) — that is, Cloud Run — deployed
from a separate codebase directory `functions-amazon/` in this repository,
with a `.firebaserc` alias `amazon`, and deployed **by name** like everything
else. Second-generation execution environment from the first deploy, because
Cloud Run Threat Detection requires it and it cannot be retrofitted.

| Service | Trigger | Path (via LB) | Service account | What it does |
|---|---|---|---|---|
| `amazonOauthStart` | HTTPS | `/oauth/start` | `amazon-oauth@` | Verifies a **connect intent** signed by the main project (company id, owner uid, 10-minute expiry, HMAC key held in both projects' Secret Managers), records the pending connection, redirects the browser to Login with Amazon with a `state` bound to the intent |
| `amazonOauthCallback` | HTTPS | `/oauth/callback` | `amazon-oauth@` | Exchanges the LWA code, stores the refresh token as **one Secret Manager secret per connection**, writes the connection document, redirects the browser back to the main app with a status — never with a token |
| `amazonAdmin` | HTTPS | `/admin/*` | `amazon-admin@` | Connection status, disconnect, manual sync. Requires an OIDC token from the main project's `amazon-caller@eggcraft-studio` account, verified against that exact identity |
| `amazonSyncOrders` | Cloud Scheduler, every 30 min | — | `amazon-sync@` | For each connection: access token from the refresh token; Orders API **v2026-01-01**, `includedData` without BUYER, RECIPIENT or TAX; `sanitize.js` split; safe envelope to the bridge |
| `amazonBridge` | internal (called by sync) | — | `amazon-bridge@` | POSTs safe envelopes to the main project's `ingestAmazonEnvelope`, authenticating with its own OIDC token. The only identity with an egress rule |

Existing code that moves in unchanged: `functions/commerce/amazon/client.js`,
`oauth.js`, `sanitize.js` and their tests. What is new is the runtime around
them: connection documents, the scheduler loop, the bridge, and the intent
verification.

**On the main project side** (three small functions in the existing
codebase): `amazonConnectStart` (callable; mints the signed intent and returns
the `/oauth/start` URL), `amazonStatus` (callable; calls `amazonAdmin` with the
caller account's OIDC token), and `ingestAmazonEnvelope` (HTTPS; verifies the
bridge account's OIDC token, validates the envelope against an **allowlist
schema** that rejects any field not in the sanitizer's output — so even a
compromised Amazon project cannot push buyer data in — and hands it to the
commerce engine). `restrictedCustomer` stays empty.

## 4. Identity and least privilege

One human (the operator) as project Owner, through the Google account already
audited in `password-and-mfa-policy.md`. No other humans. Five service
accounts, none of them the default compute account:

| Account | Roles (project) | Secret access |
|---|---|---|
| `amazon-oauth@` | `datastore.user`, `logging.logWriter` | `secretmanager.secretAccessor` on the LWA client secret; `secretmanager.admin`-scoped **to the per-connection secrets it creates** (a dedicated secret name prefix with an IAM condition) |
| `amazon-sync@` | `datastore.user`, `logging.logWriter`, `run.invoker` on `amazonBridge` only | `secretAccessor` on the LWA client secret and the per-connection secrets |
| `amazon-admin@` | `datastore.user`, `logging.logWriter` | `secretAccessor` on the intent HMAC key |
| `amazon-bridge@` | `logging.logWriter` | none — it carries envelopes, it holds nothing |
| `amazon-deploy@` | used by the operator's deploys via impersonation only | — |

Cross-project: `amazon-caller@eggcraft-studio` (main project) gets
`run.invoker` on `amazonAdmin` only; `amazon-bridge@nivadesk-amazon` gets
`run.invoker` on `ingestAmazonEnvelope` only. Nothing else in either project
can see the other.

## 5. Network — the firewall/ACL answer

**Inbound.** One global external HTTPS load balancer, managed certificate for
`amazon.nivadesk.app`, serverless NEGs to the four HTTPS services. Cloud
Armor policy `amazon-edge`:

| Priority | Rule | Action |
|---|---|---|
| 1000 | preconfigured WAF: `sqli-v33-stable`, `xss-v33-stable`, `lfi-v33-stable`, `rfi-v33-stable`, `rce-v33-stable`, `protocolattack-v33-stable`, `scannerdetection-v33-stable` (sensitivity 1) | deny 403 |
| 2000 | rate limit `/oauth/*`: 30 req/min per client IP, ban 10 min | throttle → deny 429 |
| 2100 | rate limit `/admin/*`: 120 req/min per client IP | throttle |
| 3000 | allow `/oauth/start`, `/oauth/callback`, `/admin/*`, `/healthz` | allow |
| default | everything else | deny 403 |

Adaptive Protection on (L7 DDoS). Logging on every rule, verbose. DNS for
`amazon.nivadesk.app` is **DNS-only** at Cloudflare (not proxied), so Cloud
Armor sees real client addresses and the WAF is the single edge.

Cloud Run ingress `internal-and-cloud-load-balancing` on every service,
enforced by org policy (§2), so the `run.app` address of every service answers
403 to the world. Beyond the edge, every service verifies identity: the intent
signature on `/oauth/start`, the LWA `state` on `/oauth/callback`, an OIDC
token from one named account on `/admin/*`.

**Outbound.** Every service runs with `vpcConnectorEgressSettings:
ALL_TRAFFIC` through a Serverless VPC Access connector into `amazon-vpc`
(one subnet, `10.60.0.0/24`, europe-west2). VPC firewall: egress deny-all,
then allow TCP/443 only. Cloud NAT with one **static** address (so Amazon's
side sees one stable origin and so the egress can be attributed). A **Secure
Web Proxy** with an FQDN allowlist is the ACL for destinations:
`sellingpartnerapi-eu.amazon.com`, `api.amazon.com` (LWA), and the main
project's `ingestAmazonEnvelope` host; everything else is refused and logged.
Google APIs (Firestore, Secret Manager, Logging) are reached over Private
Google Access, inside the perimeter, and never leave.

## 6. Network segmentation — the VPC Service Controls perimeter

Access policy at organisation level (none exists today; created once).
Perimeter `amazon-information`, regular type, enforced after dry-run:

- **Projects:** `nivadesk-amazon` only. The main project is deliberately
  outside — its four clients read Firestore directly from end-user devices,
  and no perimeter can admit arbitrary consumer addresses. That boundary is a
  decision with a reason, and the design document says so where an assessor
  will look.
- **Restricted services:** Firestore, Secret Manager, Cloud Run, Cloud
  Functions, Cloud Logging, Cloud Scheduler, Cloud Tasks, Pub/Sub, Artifact
  Registry, Cloud Build, Cloud Storage (the deploy source bucket), Monitoring.
- **Ingress rules:** (1) the operator's identity, from any source, to all
  restricted services — console and `gcloud` work from the audited account
  and from nothing else; (2) `amazon-caller@eggcraft-studio` to
  `run.googleapis.com` for `amazonAdmin`; (3) Cloud Scheduler's service agent.
- **Egress rules:** (1) `amazon-bridge@` to project `477037475099`, service
  `run.googleapis.com`, method `POST` — the one door out; (2) Cloud Build to
  Artifact Registry within the project (deploys).
- **What VPC-SC does not govern and the SWP does:** SP-API and LWA are not
  Google APIs; those calls are internet egress and are the FQDN allowlist's
  job (§5).

Rollout: create in **dry-run**, run the whole system for a week under it,
read every violation, resolve or codify each one, **show the report**, then
enforce. Enforcement is a sign-off step.

## 7. IDS / IPS / threat detection

- **Security Command Center Premium**, project-level, pay-as-you-go, on the
  Amazon project only. Enable Event Threat Detection (all rules), **Cloud Run
  Threat Detection**, Security Health Analytics, and Web Security Scanner
  against `https://amazon.nivadesk.app`. Confirm at activation that
  project-level Premium carries Cloud Run Threat Detection in this region;
  if it does not, that is a reason to revisit the tier, not to skip the
  detector. **Show the estimated cost before activating.**
- **Notification:** SCC findings of severity HIGH and CRITICAL → Pub/Sub →
  Cloud Function → email to `contact@eggcraft.co.uk` (and, if the user wants,
  SMS through the existing Twilio path). Cloud Armor blocked-request logs →
  log-based alert at a threshold.
- **Prevention** is Cloud Armor (WAF rules, rate limits, Adaptive Protection):
  blocked at the edge, not merely reported.
- **Logs:** a dedicated log bucket `amazon-audit` with **400-day** retention
  receiving Admin Activity and Data Access audit logs for Firestore and Secret
  Manager, Cloud Armor logs, SWP logs, and the services' own logs. Cloud
  Logging's default bucket keeps 30 days; the 400-day one is the one Amazon's
  "at least 12 months" is answered with.
- **Detection test for the evidence pack:** Google publishes benign triggers
  for Event Threat Detection and Cloud Run Threat Detection; run one, capture
  the finding and its delivery.

## 8. Anti-malware

The zone is serverless: no VMs, no containers of our own beyond the Cloud Run
images Google builds from source, no Cloud Storage bucket for data. The host
layer is Google's under shared responsibility, and the design document says
so with the reference. What is ours in this zone is runtime detection (Cloud
Run Threat Detection, §7) and dependency hygiene (`npm audit` in CI, Artifact
Analysis on the built images).

The endpoint half is the operator's devices and is not code. It is specified
in `amazon-readiness-criteria.md` control 4: MDM enrolment, a managed EDR with
tamper protection, daily signature updates, weekly scheduled scans, and a
quarterly device inventory. That work can start today and does not wait on
anything in this document.

## 9. Data — what the zone holds, and what leaves it

**Holds:** `connections/{id}` (company id, seller id, marketplace ids,
consent time, status — no tokens), the refresh token as a Secret Manager
secret named after the connection, and `orders/{connectionId}/{orderId}` as
returned by the Orders API without buyer or recipient datasets, retained 90
days then deleted by a scheduled sweep (only the sanitized envelope is needed
after the main project has it).

**Leaves, only through `amazonBridge`:** the sanitized envelope from
`sanitize.js`. The main project's `ingestAmazonEnvelope` rejects any envelope
carrying a field outside the allowlist, and that rejection is tested with a
deliberately poisoned envelope. The main project's Amazon PII isolation layer
(`privacy/outbound.js`, DENY on six channels; `restrictedCustomer` denied to
clients) stays as it is: with this design it guards a collection that is
empty by construction.

**Never:** Amazon Information in Cloud Storage; Amazon Information in a log
line (the sanitizer's redaction rules apply to logs too); a refresh token
anywhere but Secret Manager.

## 10. Evidence pack (what the second application attaches)

| Control | Artifacts |
|---|---|
| Segmentation | perimeter JSON; access policy; org policies on the project; dry-run report with dispositions; a recorded denied cross-project Firestore read; §1's diagram |
| Firewall/ACL | Cloud Armor policy JSON; LB and NEG configuration; every service's ingress setting; the `run.allowedIngress` org policy; SWP policy; log entries for one WAF block, one rate-limit block, one refused egress; the `run.app` 403 |
| IDS/IPS | SCC enablement and detector configuration; notification config; one delivered finding (test trigger); log bucket retention = 400 days; Cloud Armor Adaptive Protection status |
| Anti-malware | EDR console (devices, status, definition date, tamper protection); MDM policy export; device inventory; shared-responsibility note; the upload scanner's production report for the main product |

Each artifact is a file under `docs/security/evidence/amazon/` with the
command that produced it, so it can be regenerated the day before the
application rather than trusted from memory.

## 11. Cost (monthly, estimates to confirm on the rate card)

| Line | Estimate |
|---|---|
| Load balancer forwarding rule + data | ~$19 |
| Cloud Armor policy (8 rules) + requests | ~$13 |
| Serverless VPC Access connector (2 × e2-micro minimum) | ~$12 |
| Cloud NAT + static address | ~$5 |
| Secure Web Proxy | ~$25 — the least certain line; confirm before creating, and if it is materially higher the fallback is VPC firewall TCP/443 + NAT with the FQDN control documented as a gap |
| Cloud Run, Firestore, Secret Manager, Scheduler, Logging (400-day bucket) | ~$5 |
| VPC Service Controls | $0 |
| **Infrastructure subtotal** | **~$80 / month** |
| Security Command Center Premium, project-level PAYG | a percentage of *this project's* spend — read the estimate from the console at activation; 30-day trial covers the build-out |
| Endpoint EDR + MDM, two devices | ~$15–40 / month, chosen by the user |

Against the earlier plan's ~$33, the difference is the VPC egress path (connector,
NAT, proxy) — the part that turns "firewall" from an inbound-only answer into a
complete one.

## 12. Sequence and sign-off gates

Order matters more than the list. Steps marked ⛔ do not run without the
user's explicit go-ahead in chat, after seeing what the step will do.

1. **Endpoint EDR + MDM** on the operator's devices — the user's task, can
   start today, independent of everything else.
2. `functions-amazon/` codebase: move `client.js`, `oauth.js`, `sanitize.js`
   and tests; write the runtime (intent verification, connection documents,
   scheduler loop, bridge, admin), and the main project's three functions.
   All testable locally and in the emulator with no project yet.
3. ⛔ **Create the project** `nivadesk-amazon` with the org policies of §2,
   enable APIs, create the five service accounts and the VPC. *Shown first,
   as a script.*
4. Deploy the services (gen2, ingress internal-and-LB, VPC connector, per-
   service accounts). Verify `run.app` answers 403 for each.
5. Load balancer, managed certificate, Cloud Armor `amazon-edge`, Cloud NAT,
   Secure Web Proxy. ⛔ **DNS:** `amazon.nivadesk.app` → LB address, DNS-only
   at Cloudflare. *The record is shown before it is created.*
6. ⛔ **Security Command Center Premium** on the project; detectors;
   notification path; 400-day log bucket. *Estimated cost shown first.*
7. VPC Service Controls perimeter in **dry-run**; one week of real traffic
   (an internal test seller account, or NivaDesk's own EGGcraft seller
   account if the user chooses to connect it); violation report.
8. ⛔ **Enforce the perimeter.** *The dry-run report and dispositions shown
   first.*
9. Evidence pack (§10) generated from the live configuration.
10. Change the Developer Profile answers; **second application**.

Steps 2 and 4–7 are mine. Steps 1 and the four ⛔ gates are the user's.

## 13. What this design deliberately does not do

- It does not move the main project behind Cloud Armor or into a perimeter.
  §3 of `amazon-network-controls-plan.md` explains the two walls; the answer
  Amazon gets is "Amazon Information is in a zone that has these controls",
  which is both true and the stronger design.
- It does not wait for Option 3. The zone stores no files; the criterion is
  scoped to what touches SP-API data. Option 3 is tracked as product security
  remediation in `amazon-readiness-criteria.md`.
- It does not use Amazon's notification (push) API in A1. Polling every 30
  minutes needs no inbound path beyond OAuth and admin, which keeps the edge
  small. Notifications can be added later behind the same edge.
- It does not create a second human account, a shared credential, or a
  service-account key anywhere.
