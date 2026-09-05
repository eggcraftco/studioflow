# The Amazon project — design (revision 3)

**Date:** 5 September 2026 (revision 4 — after revision 3's three corrections: `run.allowedVPCEgress` = all-traffic with a deploy-time check; secrets user-managed in europe-west2 only; folder-level Logging defaults so `_Required`/`_Default` are regional and `_Default` sink disabled; Private Google Access through `restricted.googleapis.com` with a diag-job proof before enforcement)
**Status:** design only. **Nothing has been created.** The user has approved
the direction and the start of the `functions-amazon/` codebase. No cloud
resource is created before the four items in §14 have been shown, and four
steps in §13 need explicit sign-off besides.

**Goal:** the four controls in `amazon-readiness-criteria.md` — network
segmentation, firewall/ACL, IDS/IPS, anti-malware on privileged endpoints —
implemented in production and evidenced, in a boundary built for Amazon
Information from the first day, without touching the main NivaDesk project's
407 functions or its four clients.

## 0. What changed in revision 2

The first revision put a **Secure Web Proxy** on the egress path as an
FQDN allowlist and costed it at ~$25/month. That figure was wrong: Google's
current price for a Standard gateway is **$1.25 per hour**, roughly
**$900+/month**, for a zone whose entire other spend is under $50. Amazon's
Network Protection guidance does not require an FQDN proxy — it asks for
firewalls, ACLs, segmentation, IDS/IPS, and evidence of them. So the proxy is
out, and egress is answered in layers that cost almost nothing:

1. **Direct VPC egress** from Cloud Run into the zone's own VPC;
2. **Cloud NAT** with one static outbound address;
3. a **restrictive VPC firewall**: egress deny-all, then TCP/443 only;
4. an **application-layer hostname allowlist** in the connector itself —
   every outbound request goes through one wrapper that refuses any host not
   on the list (SP-API regional hosts, Login with Amazon, the one bridge
   endpoint) and logs destination, method, status and duration;
5. **destination/connection logging**: VPC Flow Logs on the subnet, Cloud
   NAT logging (translations and errors), and the wrapper's own log line;
6. the **VPC Service Controls perimeter** for everything that is a Google API.

The proxy comes back only if a review of Amazon's or Google's documentation
produces a concrete requirement for it. None found so far.

**Revision 3** corrects three claims the user caught:

1. **No load-balancer health check on `/healthz`.** Classic health checks are
   not supported on serverless NEG backends; the earlier design listed one.
   Cloud Run's own startup probe (in each `service-*.yaml`) is what gates
   readiness. `/healthz` stays as a smoke and monitoring endpoint only.
2. **`run.app` is closed to the internet, not to the project.** Under
   `internal-and-cloud-load-balancing`, an authenticated call from Cloud
   Scheduler in the same project is internal and is admitted — that is how
   the sync tick reaches `amazon-sync`, which has no load-balancer path. What
   the setting and the org policy guarantee is that the internet cannot reach
   any service at its `run.app` address; the proof in `deploy.sh` is
   exactly that: an unauthenticated request from outside answers 403/404.
3. **Cloud Armor Standard, and only what Standard has.** Adaptive Protection
   in the Standard tier is *basic alerting*: layer-7 DDoS attack alerts.
   Attack signatures, suggested mitigation rules and auto-deploy are Cloud
   Armor Enterprise features, are not in the cost table, and are not claimed.

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

| | |
|---|---|
| Project id | `nivadesk-amazon` (proposal; ids are permanent) |
| Organisation | `eggcraft.co.uk` (378239481010) |
| Billing account | `01789B-AD5731-2C3C72` |
| Region | `europe-west2` (London) — everything regional; the LB is global by nature |
| Firebase | Enabled for Firestore only (native mode, rules `allow read, write: if false`). **No Firebase Auth users, no client SDKs, no Storage.** The zone stores no files |
| Parent | folder `amazon-boundary` under the organisation, created first, whose Cloud Logging defaults are set to **storage location `europe-west2`** and **`_Default` sink disabled** *before* the project exists — a project's `_Required` bucket is created at creation in the parent's default location and can never be moved |
| Labels | `boundary=amazon`, `data=amazon-information` |

**Why Cloud Run rather than Firebase Functions here.** The rest of NivaDesk is
Firebase Functions, and that was the first instinct. Two things decided
against it for this zone: Firebase Functions v2 exposes only the Serverless
VPC Access *connector* (two always-on instances, ~$14/month) and not Direct
VPC egress; and a hardened zone is better served by an explicit `service.yaml`
per service — service account, ingress, egress, secrets, probes all in one
reviewable file that is itself evidence. The upload scanner already set this
precedent. The code is plain Node with `firebase-admin` for Firestore, so
nothing about the data layer changes.

**Organisation policies on the project** (what makes the guarantees
structural rather than a matter of remembering):

| Constraint | Value | Why |
|---|---|---|
| `run.allowedIngress` | `internal-and-cloud-load-balancing` | no service is reachable from the internet at its `run.app` address; internal authenticated callers (Cloud Scheduler, same project) still are |
| `run.allowedVPCEgress` | `all-traffic` only | no revision can be deployed with `private-ranges-only`, which would send internet traffic around the NAT, the firewall, the flow logs and the static address; `deploy.sh` separately refuses a service with no VPC egress at all, which a policy cannot express |
| `iam.disableServiceAccountKeyCreation` | enforced | no downloadable keys; identities exist only inside Google's runtime |
| `iam.automaticIamGrantsForDefaultServiceAccounts` | enforced | the default compute account is created with no role at all |
| `compute.vmExternalIpAccess` | deny all | there are no VMs; this keeps it that way |
| `compute.restrictVpcPeering` | deny all | no peering into the zone |
| `compute.skipDefaultNetworkCreation` | enforced | no `default` network with its permissive rules |
| `gcp.resourceLocations` | `in:europe-west2-locations` | data stays in the stated region |
| `storage.uniformBucketLevelAccess` | enforced | for the Cloud Build source bucket, the only bucket |

## 3. Services

Deployed from `functions-amazon/` in this repository: one container image
(Cloud Build from source), one Cloud Run service per role, selected by a
`ROLE` environment variable, each from its own `deploy/service-<role>.yaml`.
Second-generation execution environment (Cloud Run Threat Detection needs it),
`minScale 0`, `maxScale 3`.

| Service | Reached via | Path | Service account | What it does |
|---|---|---|---|---|
| `amazon-oauth` | LB | `/oauth/start` | `amazon-oauth@` | Verifies a **connect intent** signed by the main project (HMAC, company id, owner uid, 10-minute expiry, single use), records the pending connection, redirects the browser to Login with Amazon with a `state` bound to the intent |
| | LB | `/oauth/callback` | | Checks `state`, exchanges the LWA code, stores the refresh token as **one Secret Manager secret per connection**, writes the connection document, discovers marketplaces (`getMarketplaceParticipations`), redirects back to the main app with a status — never with a token |
| `amazon-admin` | LB | `/admin/*` | `amazon-admin@` | Connection status, disconnect (deletes the refresh-token secret and marks the document), sync-now. Requires an OIDC token from `amazon-caller@eggcraft-studio` with audience `https://amazon.nivadesk.app` — declared on the service as its Cloud Run custom audience (so Cloud Run's own IAM check accepts it for the public hostname) and checked again by the service; a token for any other audience is refused twice |
| `amazon-sync` | Cloud Scheduler → its `run.app` address (OIDC, every 30 min; internal to the project) | — (no LB path) | `amazon-sync@` | For each connection: access token from the refresh token; Orders API **v2026-01-01**, `includedData` without BUYER, RECIPIENT or TAX; `sanitize.js` split; safe envelope → bridge |
| `/healthz` | smoke tests and monitoring only | `/healthz` | — | Cloud Run's own startup probe uses it; the load balancer does **not** (classic health checks are not supported on serverless NEGs) |

The bridge is not a separate service. **One identity per service** is
cleaner than per-call impersonation, so `bridge.js` runs inside
`amazon-sync`, and `amazon-sync@` is the identity with the VPC-SC egress rule
and the `run.invoker` on the main project's `ingestAmazonEnvelope`. Four
accounts, not five.

Existing code that moves in unchanged, with its tests: `client.js`,
`oauth.js`, `sanitize.js`, and the Amazon rows of `marketplaces.js`.

**On the main project side**, three small functions in the existing codebase:
`amazonConnectStart` (callable; mints the signed intent and returns the
`/oauth/start` URL), `amazonStatus` (callable; calls `/admin/*` with
`amazon-caller@`'s OIDC token), and `ingestAmazonEnvelope` (HTTPS; verifies
`amazon-sync@`'s OIDC token, validates the envelope against an **allowlist
schema** shared with the Amazon codebase and tested byte-for-byte identical on
both sides, and hands it to the commerce engine). `restrictedCustomer` stays
empty.

## 4. Identity and least privilege

One human — the operator, through the Google account audited in
`password-and-mfa-policy.md` — as project Owner. No other humans. Four
service accounts; the default compute account exists (Cloud Run requires it)
but holds no role.

| Account | Project roles | Secret access | Cross-project |
|---|---|---|---|
| `amazon-oauth@` | `datastore.user`, `logging.logWriter` | accessor on `lwa-client-secret`, `intent-hmac-key`; custom role `amazonSecretCreator` (`secrets.create` only, project-wide because the resource does not exist yet); `secretVersionAdder` under an IAM condition on the resource-name prefix `projects/<project NUMBER>/secrets/amazon-refresh-` (the id form never matches — found and fixed 2026-09-05) | — |
| `amazon-admin@` | `datastore.user`, `logging.logWriter` | custom role `amazonRefreshTokenRemover` (`secrets.delete` only) under the same `amazon-refresh-` condition (disconnect); not `secretmanager.admin` | — |
| `amazon-sync@` | `datastore.user`, `logging.logWriter` | accessor on `lwa-client-secret`; `secretAccessor` under the `amazon-refresh-` condition; **not** on `intent-hmac-key` | `run.invoker` on `ingestAmazonEnvelope` in the main project; the only identity with a VPC-SC egress rule |
| `amazon-deploy@` | custom role `amazonDeployer` (create/update/read services and jobs, read revisions/executions/operations — **no** `run.routes.invoke`, `run.jobs.run`, setIamPolicy or delete; `infra/amazon/deploy-role.sh`), `cloudbuild.builds.editor`, `artifactregistry.writer`, `logging.logWriter`, `iam.serviceAccountUser` on the three runtime accounts; `storage.objectViewer` on the build staging bucket only | — | used only by the operator through impersonation for deploys; also the Cloud Build identity. It is not a caller: with the predefined `run.admin`/`run.developer` it would have been (both include invoke), which the 5 Sep smoke test showed — stopped only by the application allowlist |

Main project: `amazon-caller@eggcraft-studio` gets `run.invoker` on
`amazon-admin` only. Nothing else in either project can see the other.

### 4a. Bootstrap permissions — temporary, recorded 5 September 2026

Creating the folder, the project and the folder's Logging defaults needed
three roles on the **organisation** that Organization Administrator does not
include. The operator granted them to `contact@eggcraft.co.uk` on
5 September 2026 for the bootstrap, and the user's instruction is explicit:
they are **temporary**, nothing about them changes without the user's
approval, and a reduction plan is owed once the bootstrap is done.

| Role (organisation) | Needed for | After the bootstrap |
|---|---|---|
| `roles/resourcemanager.folderCreator` | creating `amazon-boundary` | **remove entirely** — the folder exists; nothing else creates folders |
| `roles/resourcemanager.projectCreator` | creating `nivadesk-amazon` | **remove entirely** — the project exists; a future project is a new decision and a new one-off grant |
| `roles/logging.admin` | `gcloud logging settings update --folder` | **reduce**: remove at the organisation; if the folder's Logging defaults ever need changing, grant `roles/logging.admin` on the **folder** `amazon-boundary` (758048022614) for that change only. Day-to-day log reading and sink management inside the project come with the operator's project Owner role |

Nothing in the run rate of the zone depends on any of the three: deploys use
`amazon-deploy@` by impersonation (`serviceAccountTokenCreator` on that
account, project-scoped, already granted), and every later step — services,
edge, SCC, perimeter — acts on the project or on Access Context Manager, not
on folder or project creation. **The reduction is not applied until the user
approves it.**

## 5. Ingress — the firewall/ACL answer, inbound

**One global external HTTPS load balancer**, managed certificate for
`amazon.nivadesk.app`, serverless NEGs to `amazon-oauth` and `amazon-admin`
(`amazon-sync` has no LB path at all). Cloud Armor policy `amazon-edge`:

| Priority | Rule | Action |
|---|---|---|
| 1000 | preconfigured WAF: `sqli-v33-stable`, `xss-v33-stable`, `lfi-v33-stable`, `rfi-v33-stable`, `rce-v33-stable`, `protocolattack-v33-stable`, `scannerdetection-v33-stable` (sensitivity 1) | deny 403 |
| 2000 | rate limit `/oauth/*`: 30 req/min per client IP, ban 10 min on breach | throttle → deny 429 |
| 2100 | rate limit `/admin/*`: 120 req/min per client IP | throttle |
| 3000 | allow `/oauth/start`, `/oauth/callback`, `/admin/` (exact / prefix); `/healthz` only for smoke tests, from the operator's address | allow |
| 2147483647 | everything else | **deny 403** |

Cloud Armor **Standard** tier. Adaptive Protection in Standard is basic
alerting — layer-7 DDoS attack alerts, no attack signatures, no suggested
rules, no auto-deploy; those are Enterprise and are not claimed. Logging on
every rule, verbose. No load-balancer health check: serverless NEG backends
do not support classic health checks; readiness is Cloud Run's own startup
probe. `amazon.nivadesk.app` is **DNS-only** at Cloudflare (not proxied), so
Cloud Armor sees real client addresses and there is one edge, not two.

Beyond the edge, every service verifies identity itself: the intent
signature on `/oauth/start`, the LWA `state` on `/oauth/callback`, an OIDC
token from one named account on `/admin/*`, Cloud Scheduler's OIDC token on
the sync service. The org policy means the `run.app` addresses answer 403 to
the internet; Cloud Scheduler's authenticated call from inside the project is
internal and is the sync's only path.

## 6. Egress — the firewall/ACL answer, outbound

| Layer | Configuration | What it stops |
|---|---|---|
| Direct VPC egress | every service: network `amazon-vpc`, subnet `amazon-subnet`, egress `all-traffic` | nothing leaves Google's serverless fabric except through our VPC |
| VPC firewall | `amazon-deny-all-egress` (priority 65000, deny all egress to 0.0.0.0/0) then `amazon-allow-https-egress` (priority 1000, allow tcp:443 to 0.0.0.0/0); no ingress rules at all | any protocol or port that is not HTTPS; any inbound to the subnet |
| Cloud NAT | `amazon-nat` on `amazon-router`, manual allocation of one static address `amazon-egress`, logging `ALL` | egress leaves from one known address, and every translation is logged |
| Private Google Access | on the subnet | Firestore, Secret Manager and Logging are reached without leaving Google |
| Application allowlist | `egress.js`: every outbound `fetch` in the codebase goes through one wrapper that resolves the URL's hostname against the list — `sellingpartnerapi-eu.amazon.com`, `-na`, `-fe`, `api.amazon.com`, the main project's `ingestAmazonEnvelope` host, `metadata.google.internal` — and refuses anything else before a connection is opened; logs `host, method, status, ms` (never a path with an order id, never a token) | the connector cannot be made to talk to a host it was not written for, even by a bug; and there is a per-request destination log |
| Flow logs | VPC Flow Logs on `amazon-subnet`, 100% sampling, 5-second aggregation, metadata included | every connection the subnet makes is recorded, with destination |
| VPC-SC | perimeter, §7 | Google-API traffic cannot reach any project but this one, except the one bridge rule |

**What this does not do, stated for the assessor:** the VPC firewall allows
TCP/443 to any address, because Amazon's endpoints resolve to changing
addresses and IP-pinning them would break the connector without adding
security over the hostname allowlist above. Destination control is at the
application layer and in the logs; the network layer controls protocol and
port and the single egress address. An FQDN proxy would add a second
destination control at ~$900/month; it is documented as evaluated and not
adopted.

## 7. Network segmentation — the VPC Service Controls perimeter

Access policy at organisation level (none exists today; created once).
Perimeter `amazon-information`, regular type, enforced only after dry-run:

- **Projects:** `nivadesk-amazon` only. The main project is deliberately
  outside — its four clients read Firestore directly from end-user devices,
  and no perimeter can admit arbitrary consumer addresses. That boundary is a
  decision with a reason, and this document says so where an assessor will
  look.
- **Restricted services:** `firestore`, `secretmanager`, `run`,
  `cloudscheduler`, `logging`, `monitoring`, `artifactregistry`,
  `cloudbuild`, `storage` (the build source bucket), `pubsub` (SCC
  notifications).
- **Ingress rules:** (1) the operator's identity, from any source, to all
  restricted services — console and `gcloud` work from the audited account
  and from nothing else; (2) `amazon-caller@eggcraft-studio` to
  `run.googleapis.com`, for `/admin/*`; (3) Cloud Scheduler's service agent,
  for the sync job.
- **Egress rules:** (1) `amazon-sync@` to project `477037475099`, service
  `run.googleapis.com` — the one door out; (2) Cloud Build to Artifact
  Registry within the project.
- SP-API and LWA are not Google APIs; VPC-SC does not see them. They are
  governed by §6.

**Private Google Access through `restricted.googleapis.com`** (required
before the perimeter is enforced). Firestore, Secret Manager and Logging
traffic from the services must not depend on public Google API resolution.
Inside `amazon-vpc`: a Cloud DNS **private zone** for `googleapis.com` with
`*.googleapis.com CNAME restricted.googleapis.com` and `restricted.googleapis.com`
A records `199.36.153.4–7`; a route for `199.36.153.4/30` to the default
internet gateway; an explicit firewall rule allowing egress to that /30 on
TCP/443 ahead of the general rule; DNS query logging through a DNS server policy bound to `amazon-vpc` (a private zone cannot log on its own; the API refuses `--log-dns-queries` for private visibility). Cloud Run
with direct VPC egress resolves through the VPC's Cloud DNS, so every Google
API call from the services lands on the restricted VIP, which serves only
VPC-SC-supported APIs and honours the perimeter. The proof is a Cloud Run
**job** (`ROLE=diag`, same image, no ingress) that resolves each hostname,
reports the addresses, and exits non-zero if any is outside the /30 — run
before enforcement and kept in the evidence pack. The bridge host in the main
project (`cloudfunctions.net`) is not a Google API and stays on the public
path through NAT, governed by the VPC-SC egress rule.

Rollout: create in **dry-run**, run the whole system for a week under it,
read every violation, resolve or codify each one, **show the report**, then
enforce. Enforcement is a sign-off step.

## 8. IDS / IPS / threat detection

- **Security Command Center Premium**, project-level, pay-as-you-go, on the
  Amazon project only: Event Threat Detection (all rules), **Cloud Run Threat
  Detection**, Security Health Analytics, Web Security Scanner against
  `https://amazon.nivadesk.app`. Confirm at activation that project-level
  Premium carries Cloud Run Threat Detection in this region; if not, that is
  a reason to revisit the tier, not to skip the detector. **Estimated cost
  shown before activating.**
- **Notification:** findings of severity HIGH and CRITICAL → Pub/Sub → a
  small notifier → email to `contact@eggcraft.co.uk`. Cloud Armor
  blocked-request logs → log-based alert above a threshold.
- **Prevention** is Cloud Armor Standard (WAF rules, rate limits): blocked
  at the edge, not merely reported. Adaptive Protection contributes basic
  layer-7 DDoS *alerts* in this tier — detection, not mitigation.
- **Logs:** bucket `amazon-audit`, created explicitly in `europe-west2`,
  **400-day** retention, fed by an unfiltered sink — every log line of the
  project: Admin Activity and Data Access audit logs for Firestore and Secret
  Manager, Cloud Armor, Cloud NAT, VPC Flow Logs, Cloud DNS, the services'
  own logs. The folder's Logging defaults make the project's `_Required`
  bucket regional too and disable the `_Default` sink, so no log line lands
  in a global bucket; `create-project.sh` reads every bucket's location back
  after creation and exits non-zero if any is not `europe-west2`, because
  `_Required` cannot be fixed afterwards. Amazon's "at least 12 months" is
  answered by `amazon-audit`.
- **Detection test for the evidence pack:** Google publishes benign triggers
  for Event Threat Detection and Cloud Run Threat Detection; run one, capture
  the finding and its delivery.

## 9. Anti-malware

The zone is serverless: no VMs, no containers of our own beyond the Cloud Run
image Google builds from source, no data bucket. The host layer is Google's
under shared responsibility, documented with the reference. What is ours in
this zone is runtime detection (Cloud Run Threat Detection, §8) and
dependency hygiene (`npm audit` in CI, Artifact Analysis on the built image).

The endpoint half is the operator's devices and is not code — specified in
`amazon-readiness-criteria.md` control 4: MDM enrolment, a managed EDR with
tamper protection, daily signature updates, weekly scheduled scans, a
quarterly device inventory. It can start today and waits on nothing here.

## 10. Data — what the zone holds, and what leaves it

**Holds:** `connections/{id}` (company id, seller id, marketplace ids,
consent time, status, last sync — no tokens); the refresh token as the
Secret Manager secret `amazon-refresh-{connectionId}`; `orders/{connectionId}/{orderId}`
as returned by the Orders API without buyer or recipient datasets, retained
90 days and then deleted by a scheduled sweep.

**Leaves, only through the bridge:** the sanitized envelope. The main
project's `ingestAmazonEnvelope` rejects any envelope carrying a field
outside the allowlist, tested with a deliberately poisoned envelope; the
schema module is one file, present in both codebases, with a test that fails
if the two copies differ.

**Never:** Amazon Information in Cloud Storage; Amazon Information in a log
line (the wrapper logs hosts and statuses, not paths with order ids); a
refresh token anywhere but Secret Manager; an access token stored anywhere.

## 11. Evidence pack

| Control | Artifacts |
|---|---|
| Segmentation | perimeter and access-policy JSON; the org policies; dry-run report with dispositions; a recorded denied cross-project Firestore read; §1's diagram |
| Firewall/ACL | Cloud Armor policy JSON and LB/NEG configuration; every service's ingress setting; the `run.allowedIngress` policy; VPC firewall rules; NAT and static-IP configuration; `egress.js` and its tests; log entries for one WAF block, one rate-limit block, one refused egress from the wrapper, one NAT translation; the `run.app` 403 from the internet and the 200 from Cloud Scheduler |
| IDS/IPS | SCC enablement and detector configuration; notification config; one delivered finding (test trigger); the log bucket's 400-day retention; Cloud Armor Standard's Adaptive Protection basic-alert setting |
| Anti-malware | EDR console (devices, status, definition date, tamper protection); MDM policy export; device inventory; shared-responsibility note; the upload scanner's production report for the main product |

Each artifact is a file under `docs/security/evidence/amazon/` with the
command that produced it, regenerated the day before the application.

## 12. Monthly cost — revised, without Secure Web Proxy

Rates are Google's list prices as understood on 5 September 2026 and are
to be confirmed on the rate card before each resource is created; the
workload assumption is 5 connected sellers syncing every 30 minutes.

| Line | Basis | Monthly |
|---|---|---|
| External HTTPS LB forwarding rule | $0.025/h | ~$18 |
| LB data processing | ~5 GiB | < $1 |
| Cloud Armor **Standard** policy + 6 rules (basic Adaptive Protection alerts included; Enterprise not used) | $5 + 6 × $1 + requests | ~$12 |
| Cloud NAT gateway | $0.0014/h per instance in use, scale-to-zero services | ~$1–3 |
| NAT data processing | $0.045/GiB, ~2 GiB | < $1 |
| Static external IP (in use) | ~$0.005/h | ~$4 |
| VPC Flow Logs → Logging | ~$0.50/GiB ingested, small | ~$1 |
| Cloud Run (3 services, gen2, scale-to-zero, ~22k requests) | | ~$2 |
| Firestore, Secret Manager, Scheduler | | ~$1 |
| Logging 400-day bucket (beyond the free 50 GiB, retention charge) | | ~$1 |
| Artifact Registry + Cloud Build (few builds) | | ~$1 |
| Cloud DNS private zone (`googleapis.com` → restricted VIP) | $0.20 + queries | < $1 |
| VPC Service Controls | | $0 |
| Direct VPC egress | no connector instances | $0 |
| **Infrastructure subtotal** | | **~$42 / month (~£33)** |
| Security Command Center Premium, project-level PAYG | a percentage of *this project's* spend; 30-day trial | **read from the console at activation** — the base it applies to is the ~$42 above |
| Endpoint EDR + MDM, two devices | chosen by the user | ~$15–40 |

Against revision 1's ~$80: the proxy (~$25, actually ~$900) and the
connector (~$12) are gone; Flow Logs and NAT logging are added.

## 13. Sequence and sign-off gates

⛔ = does not run without the user's explicit go-ahead in chat, after seeing
what the step will do. Nothing in the cloud is created before §14 has been
presented.

1. **Endpoint EDR + MDM** on the operator's devices — the user's task; options
   compared and one recommended in `edr-mdm-options.md` (5 Sep). **Open.**
2. `functions-amazon/` codebase — **done** (9 test files, emulator-free). Runtime around the three
   existing modules; `deploy/*.yaml`; tests; emulator run. Also the main
   project's three functions and the shared envelope schema.
3. ✅ **Created 5 Sep** with `infra/amazon/create-project.sh` and verified by
   `verify-project.sh`: org policies, APIs, service accounts and IAM, VPC + subnet +
   firewall + router + NAT + static IP + flow logs, log bucket, Firestore,
   Artifact Registry.
4. ✅ (admin only, 5 Sep) Build and deploy the services from their YAML —
   `amazon-admin` live; oauth/sync wait for Amazon's credentials; verify each
   `run.app` answers 403 to an unauthenticated request from the internet, and
   that an egress to a non-allowlisted host is refused and logged.
5. ✅ (5 Sep) Load balancer, managed certificate, Cloud Armor `amazon-edge`;
   DNS `amazon.nivadesk.app` → 136.68.239.143, DNS-only at Cloudflare; eight
   smoke cases in `edge-smoke-2026-09-05.md`.
6. ✅ (5 Sep) **SCC Premium** on the project (30-day trial, then pay-as-you-go);
   ETD + Cloud Run Threat Detection effective; notification path built. The
   two detection findings are still awaited — control 3 is not `Passed` yet.
7. ✅ (5 Sep) **Private Google Access via `restricted.googleapis.com`**
   (`infra/amazon/private-google-access.sh`): private DNS zone, route,
   firewall; then the `diag` job proves every Google API host resolves inside
   `199.36.153.4/30` and answers. Its output goes into the evidence pack.
7b. ✅ started 5 Sep: VPC-SC perimeter `amazon_information` in **dry-run**; a week of real traffic (a test seller
   account, or EGGcraft's own if the user chooses); violation report.
8. ⛔ **Enforce the perimeter.** *Report and dispositions shown first.*
9. Evidence pack from the live configuration.
10. Developer Profile answers changed; **second application**.

## 14. The four things to show before any resource is created

**14.1 Final architecture diagram** — §1 above.

**14.2 Revised monthly cost without Secure Web Proxy** — §12: ~$42/month
infrastructure, plus SCC Premium PAYG on that base, plus endpoint EDR.

**14.3 Exact APIs, resources and org policies to be created** — this is
also what `infra/amazon/create-project.sh` does, in this order, idempotently:

*APIs enabled:* `compute`, `run`, `cloudbuild`, `artifactregistry`,
`firestore`, `secretmanager`, `cloudscheduler`, `logging`, `monitoring`,
`iam`, `iamcredentials`, `cloudresourcemanager`, `orgpolicy`,
`serviceusage`, `pubsub`, `firebase`. Not enabled by the script: SCC
(`securitycenter`) and Access Context Manager (`accesscontextmanager`) —
those are the ⛔ steps 6 and 8, run separately.

*Org policies on the project:* the nine in §2 (`run.allowedVPCEgress` = `all-traffic` added in revision 4).

*Resources:*

| Kind | Name |
|---|---|
| Folder | `amazon-boundary` in org 378239481010; Logging defaults `--storage-location=europe-west2 --disable-default-sink`, set before the project |
| Project | `nivadesk-amazon` in that folder, billing `01789B-AD5731-2C3C72` |
| Service accounts | `amazon-oauth`, `amazon-admin`, `amazon-sync`, `amazon-deploy` |
| IAM | the bindings in §4, project-scoped; secret-level bindings added when the secrets exist |
| VPC | `amazon-vpc` (custom mode), subnet `amazon-subnet` 10.60.0.0/24 europe-west2, Private Google Access on, flow logs on |
| Firewall | `amazon-deny-all-egress` (65000, egress deny all), `amazon-allow-https-egress` (1000, egress tcp:443) |
| Router / NAT | `amazon-router`, `amazon-nat` (manual NAT IPs, logging ALL), static IP `amazon-egress` |
| Firestore | native database `(default)` in europe-west2; rules deny-all |
| Secret Manager | `lwa-client-secret`, `intent-hmac-key`, user-managed replication in `europe-west2` only (created empty — **the user pastes the values in the console**; secrets never pass through chat); per-connection `amazon-refresh-*` secrets are created the same way at consent |
| Artifact Registry | `amazon` (docker, europe-west2) |
| Logging | bucket `amazon-audit` in `europe-west2`, 400-day retention, unfiltered sink; `_Required`/`_Default` regional by the folder default; `_Default` sink disabled |
| Audit config | Data Access logs on for Firestore and Secret Manager |
| Pub/Sub | topic `scc-findings` (empty until step 6) |

Created later, by their own scripts and gates: Cloud Run services (step 4),
LB + certificate + Cloud Armor (step 5), SCC (6), perimeter (7–8).

**14.4 Expected ingress and egress paths**

Ingress (only these; everything else is denied at Cloud Armor, and `run.app`
refuses the internet):

| From | To | Through | Authenticated by |
|---|---|---|---|
| seller's browser | `amazon-oauth` `/oauth/start` | LB + Armor | signed connect intent (HMAC, 10 min, single use) |
| Amazon (browser redirect) | `amazon-oauth` `/oauth/callback` | LB + Armor | `state` bound to the intent |
| main project `amazonStatus` | `amazon-admin` `/admin/*` | LB + Armor | OIDC token, `amazon-caller@eggcraft-studio` only |
| Cloud Scheduler (same project) | `amazon-sync` at its `run.app` address | internal — admitted by `internal-and-cloud-load-balancing` | OIDC token for `amazon-sync@`, audience = the service URL |
| operator | console / gcloud | Google APIs | VPC-SC ingress rule on the audited identity |

Egress (only these; the VPC firewall allows nothing but tcp:443, and the
application allowlist refuses any other host):

| From | To | Through | Logged by |
|---|---|---|---|
| `amazon-oauth`, `amazon-sync` | `api.amazon.com` (LWA) | VPC → NAT static IP | wrapper, NAT, flow logs |
| `amazon-sync`, `amazon-oauth` | `sellingpartnerapi-{eu,na,fe}.amazon.com` | VPC → NAT static IP | wrapper, NAT, flow logs |
| `amazon-sync` | main project `ingestAmazonEnvelope` | VPC → NAT; VPC-SC egress rule | wrapper, NAT, flow logs, main project's request log |
| all services | Firestore, Secret Manager, Logging | Private Google Access, inside the perimeter | audit logs |
| all services | `metadata.google.internal` (tokens) | internal | — |

## 15. What this design deliberately does not do

- It does not move the main project behind Cloud Armor or into a perimeter
  (`amazon-network-controls-plan.md` §3, the two walls).
- It does not wait for Option 3; the zone stores no files.
- It does not use a Secure Web Proxy (§0), and does not IP-pin Amazon's
  endpoints (§6).
- It does not use Amazon's push notifications in A1; polling needs no
  inbound path beyond OAuth and admin.
- It does not create a second human account, a shared credential, or a
  service-account key anywhere.
