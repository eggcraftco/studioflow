# Amazon SP-API network security controls — architecture and cost assessment

**Written:** 4 September 2026, after the developer registration was refused
**Owner:** Incident Lead (see [incident-response-plan.md](incident-response-plan.md))
**Status:** assessment only. Nothing in here has been built.

---

## 1. Why this document exists

The SP-API developer registration was refused on 4 September 2026. The refusal
named exactly one question:

> *Does your organization implement the following network security controls:
> firewalls, IDS/IPS, anti-virus/anti-malware and network segmentation?*

We answered **No**, truthfully. Amazon treats that as disqualifying. The appeal
route is a new application with corrected responses — so the answer has to
become **Yes**, and it has to be true when it does.

This assessment measures what exists today and what each of the four controls
would actually cost, in money and in architecture. Two of them turn out to be
much larger than they look, and neither is a configuration change.

## 2. What exists today

Measured from the running project on 4 September 2026.

| | |
|---|---|
| Live functions | **407** — 353 callable, 35 HTTP, 18 scheduled, 1 Cloud Tasks |
| Publicly reachable HTTP surface | **388** endpoints (callable + HTTP) |
| Ingress settings | **None configured.** Every function is `ALLOW_ALL` |
| Load balancer | **None.** No Cloud Armor, no WAF, no rate limiting |
| Direct URLs | Every function answers on its own `*.run.app` and `cloudfunctions.net` address. Verified: `chatgptmcp-…run.app` returns 200, `cloudfunctions.net/generateQuickReply` returns 400 — i.e. it processed the request |
| Client data access | All four clients (web, macOS, iOS, Android) talk **directly** to `firestore.googleapis.com`, `firebasestorage.googleapis.com` and Identity Toolkit through the Firebase SDKs |
| Secrets | 39, all readable by the default compute service account |
| App Check | Configured with reCAPTCHA v3, in **monitor** mode — it observes, it does not enforce |
| Security headers | Only `content-security-policy: upgrade-insecure-requests`. No HSTS, no frame protection, no `X-Content-Type-Options` |
| Upload scanning | None |
| `nivadesk.app` | Cloudflare nameservers → Hostinger origin (the marketing and app site) |
| `mcp.nivadesk.app` | Firebase Hosting → `chatgptMcp` |

## 3. The decision: a separate security boundary, not a retrofit

The first version of this assessment measured what it would cost to bring the
existing project up to Amazon's four controls, and found two walls.

**Cloud Armor could not be put in front of the callables without a client
migration.** 353 of the 388 endpoints are called by the Firebase SDKs on four
clients, which resolve their own address. Routing them through a load balancer
means changing the client configuration in web, Swift and Kotlin, shipping the
native apps through the stores, waiting for adoption, and only then closing the
direct `run.app` bypass — because closing it first takes the product down for
everyone still on the old address.

**A VPC Service Controls perimeter around Firestore would break every
customer.** All four clients read and write Firestore directly from the end
user's own device, including real-time listeners, and there is no ingress rule
to write for arbitrary consumer addresses.

Both walls exist only because the work was framed as *changing the existing
project*. It does not have to be.

**Amazon Information gets its own Google Cloud project, hardened from the first
day.** Nothing is migrated. The main NivaDesk project keeps its 407 functions,
its four clients talking directly to Firestore, and its current network posture.
The Amazon boundary is built once, correctly, with no legacy clients to break.

### What lives inside the boundary

- Amazon LWA / OAuth: the consent flow, the client secret, the state store.
- The Amazon connector functions — SP-API calls, order ingestion, the sanitizer.
- Amazon secrets and the token-encryption key, readable only by that project's
  own service accounts.
- The Amazon access log and audit trail.
- Restricted buyer PII, if and when a restricted role is ever granted. It does
  **not** go into the main Firestore.
- Security Command Center Premium, Cloud Armor, VPC Service Controls, dedicated
  service accounts.

### What crosses the boundary

One thing, in one direction: the **sanitized, non-PII envelope** that
`commerce/amazon/sanitize.js` already produces. The split that was built before
any Amazon data existed turns out to be the boundary's contract — the safe half
is exactly what may leave, and the restricted half now has somewhere to stay.

Nothing flows the other way except the order id a sync needs to reconcile.

### Why this is a better answer to Amazon, not merely a cheaper one

"We isolate Amazon Information in a dedicated project with its own perimeter,
its own service accounts, its own threat detection and its own WAF, and only
de-identified order data crosses into the main application" is a stronger answer
to a network segmentation question than any retrofit of a shared project would
have produced. The segmentation is real and it is drawn around the data the
question is about.

It also disposes of the Cloud Armor bypass at no cost. Google's own guidance is
that a serverless default URL left open bypasses Armor, and the fix is ingress
`Internal and Cloud Load Balancing`. In the existing project that setting costs
a mobile migration. In a project with no clients yet, it is the first day's
configuration.

## 4. The four controls in the new project

| Amazon's control | What is built | Note |
|---|---|---|
| **Firewall** | External HTTPS load balancer with Cloud Armor: WAF rules and rate limiting in front of every Amazon HTTP path. Function ingress set to `internal-and-cloud-load-balancing` from the first deploy, so the default `run.app` address is not a way round it | No clients to migrate |
| **IDS/IPS** | Security Command Center Premium at **project level, pay-as-you-go**, with Event Threat Detection and Cloud Run Threat Detection. Cloud Armor blocking completes the detect-and-prevent chain | Cloud Run Threat Detection requires the **second-generation execution environment** — set at creation, not retrofitted |
| **Anti-malware** | Malware scanning on any uploaded file, **plus** managed AV/EDR on every human device with production access, with a recorded update cadence. The Google-managed serverless host layer is documented as shared responsibility, separately from our endpoint responsibility | The endpoint half is not optional; file scanning alone does not answer the question |
| **Network segmentation** | VPC Service Controls perimeter around the Amazon project's Firestore/Storage, Secret Manager and serverless services. Explicit egress: SP-API and LWA only, plus the controlled sanitized bridge to the main project | The main project's Firestore is deliberately **outside** any perimeter, and that is a boundary decision with a reason rather than a gap |

App Check enforcement and the web security headers are defence in depth on the
main application. They are not answers to Amazon's question and are not counted
as such.

## 5. Cost

Unit prices are the figures to confirm on the current rate card before anything
is switched on. The workload is our own assumption and is stated so it can be
argued with.

**Assumed first-year load:** 5 connected sellers, syncing every 30 minutes,
3 SP-API calls per sync — about 21,600 Cloud Run requests a month.

| Line | Monthly |
|---|---|
| Cloud Run (gen2, scale-to-zero) | ~$1.10 |
| Load balancer forwarding rule | ~$18.25 |
| Load balancer data processing (5 GiB) | ~$0.04 |
| Cloud Armor policy + 8 rules | ~$13.00 |
| Cloud Armor requests | ~$0.02 |
| VPC Service Controls | $0.00 — no charge |
| Secret Manager | ~$0.30 |
| Logging and audit logs | ~$0.50 — the first 50 GiB are free |
| **Subtotal, excluding SCC** | **~$33 / month (~£26)** |

**Security Command Center Premium** is billed at project level, pay-as-you-go,
against this project's own protected spend rather than the organisation's — and
this project's spend is the ~$33 above. There is a 30-day trial, which covers
the entire build-out. The $15,000 figure applies to the annual fixed
subscription and is not what this project would be on.

Separate from the monthly run rate: endpoint EDR for the two devices with
production access (~$10–30/month), an annual penetration test (four figures),
and monthly vulnerability scanning (low or free with the right tooling).

**The load balancer, not Cloud Armor, is the largest recurring line.** A
forwarding rule costs the same whether it carries 20,000 requests or 20 million.

## 6. The requirements beyond the four controls

Amazon's current security guidance also asks for operational practices, and
patching only the question that was refused would leave the next refusal to
discover:

- monthly vulnerability scanning;
- annual penetration testing;
- log review at least every two weeks;
- annual third-party security assessment.

These have owners, cadences and evidence requirements exactly like the controls
do, and the readiness gate should test them before a second application, not
after a second refusal.

## 7. Sequence

Superseded on 5 September 2026 by two documents: the criteria for the four
controls, in Amazon's own words, are in `amazon-readiness-criteria.md`; the
design of the Amazon project and its sign-off gates are in
`amazon-hardened-project-design.md` §12. Two decisions changed the list below
and are recorded there:

- **Option 3 is not an Amazon blocker.** The zone that holds Amazon Information
  stores no files, and Amazon's anti-malware criterion is scoped to servers and
  endpoints that access SP-API data. Option 3 continues as a separate
  product-security remediation.
- **The anti-malware criterion is the endpoint one:** managed, non-disableable,
  current EDR on the devices with production access, updated at least
  monthly, under MDM — plus the serverless shared-responsibility note and the
  upload scanner, which is live since 4 September 2026.

What was done from the original list: 1 (web hardening, live), 2 (upload
malware scanning, live with the flag on). Step 3 (EDR) is the user's and can
start now. Steps 4–11 are the design document's sequence.

## 7a. The Content-Security-Policy brief

A CSP is the one header here that can break the site, so it is written from an
inventory rather than from a template, and it goes out **report-only** first.
The inventory below was taken from the source on 4 September 2026.

**Origins that must be allowed**

| Directive | Origin | Why |
|---|---|---|
| `script-src` | `'self'` | every app chunk |
| `script-src` | `https://www.google.com` | reCAPTCHA loader, injected by App Check on **every** page |
| `script-src` | `https://www.gstatic.com` | reCAPTCHA's real bundle, and `importScripts` in the FCM service worker |
| `script-src` | `https://apis.google.com` | the gapi iframe bootstrap that `signInWithPopup` initialises |
| `script-src` | `https://www.googletagmanager.com` | Google Ads gtag, public marketing pages and `/signup` only |
| `script-src` | `https://www.googleadservices.com`, `https://googleads.g.doubleclick.net` | **unproven from source.** gtag for an `AW-` property normally pulls these. Confirm on a live network trace before enforcing, or ad conversions stop recording silently |
| `connect-src` | Firestore, Storage, Identity Toolkit, Functions, App Check endpoints | the SDKs |
| `frame-src` | the Storage download origin | `app/f/[...slug]/route.ts:150` renders the shared file inside an iframe |
| `font-src` | `'self'` | fonts are self-hosted by `next/font` — no `fonts.gstatic.com` |

**Two things a strict policy cannot have here**

- `style-src` needs `'unsafe-inline'`. There are ~2,256 React `style={{…}}`
  attributes, three styled-jsx runtime injections, and hand-written print
  documents with `<style>` blocks. styled-jsx only reads a nonce from a
  `<meta property="csp-nonce">` tag this app does not render.
- `script-src` needs a **nonce**, threaded from middleware, because Next's App
  Router emits an inline flight bootstrap on every response. Three of our own
  inline scripts can take that nonce; one cannot — the print script that
  `app/inventory/ItemLabelModal.tsx:71` writes into an `about:blank` popup with
  `document.write`. Either hash it, allow `'unsafe-inline'`, or move the
  `print()` call to the opener the way the order and invoice popups already do.

**Sequence:** report-only → collect violations from real traffic → fix what the
reports show → enforce. Never the other way round.

## 7b. Malware scanning: the bypass that decides whether this is real

Files enter through eleven prefixes under `companies/{id}/` from three clients —
client files, design images, inventory photos, the files library, message
attachments, support attachments, note images, bank receipts and the rest. A
Cloud Storage finalize trigger sees all of them, whichever client uploaded, so
there is one place to scan rather than eleven.

The decision layer is built and tested. It is fail-closed by construction:
a clean scan is the only verdict that makes a file usable, an unrecognised
verdict is unusable rather than assumed safe, a file with no scan metadata at
all — the state every upload is in for its first seconds — is unusable, and only
an infection deletes anything, because throwing away a customer's file because
our scanner was busy is a different kind of harm.

**And none of that enforces anything yet, because of how files are served.**

The app calls `getDownloadURL()` in twenty places and never reads a file with
`getBlob`. A Firebase download URL carries a token, and **a token URL bypasses
Storage security rules completely**. So the obvious enforcement —
`allow read: if resource.metadata.nvScanStatus == "clean"` — would look like a
control and stop nothing. Anyone with the URL still gets the file.

**Decision, 4 September 2026:** option 1 now, option 3 before the second Amazon
application. Option 1 closes the common case today without touching a client;
option 3 is the only fully fail-closed answer and it deserves its own plan
because it changes twenty call sites across four clients.

Three ways to make it real, in increasing order of honesty and cost:

1. **Strip and restore the download token.** On finalize, record the object's
   token and remove it; the URL 403s for everybody. On a clean verdict, put the
   same token back and the stored URL works again. This closes the common case
   and needs no client change. It does not close the race where a client calls
   `getDownloadURL()` after the token was stripped and mints a fresh one.
2. **Serve through the proxy that already exists.** `app/f/[...slug]/route.ts`
   already fetches files server-side and streams them, so a scan check belongs
   there — but that route only serves shared links, not in-app viewing.
3. **Stop using token URLs.** Read files through authenticated calls so Storage
   rules apply, and the metadata check becomes the enforcement. Twenty call
   sites, four clients, and the only option that is fully fail-closed.

### What option 1 looks like, and what it does not close

Built and tested on 4 September 2026, not deployed:

- A finalize trigger sees every upload from every client, because they all land
  as objects in one bucket.
- **The token comes off before the scanner is asked anything.** That ordering is
  the control: scanning first and holding afterwards leaves the file
  downloadable for exactly as long as the scan takes, which is the window that
  matters. The test asserts the order, not the end state.
- On a clean verdict the **same** token goes back. A fresh one would be a
  different URL, and the old URL is already written into a Firestore document
  nobody is going to revisit.
- Every other verdict leaves the token off. A scanner that throws, times out, or
  returns a word we do not recognise is a withheld file, not a released one.
- Only an infection deletes anything.
- If the token cannot be removed at all, the trigger stops and does nothing
  else — the file is still reachable, so scanning it would record a result for a
  control that did not run.
- The whole mechanism is **off unless a scanner is configured**, and off means
  doing nothing rather than half of it. Turning it on without a scanner would
  strip every token and make every upload permanently unreachable: fail-closed
  applied to the wrong thing.
- The held tokens live in a server-only `fileScans` collection. A client that
  could read it could take the token and fetch the file being withheld.

**What option 1 does not close:** a client that calls `getDownloadURL()` after
the token was stripped mints a fresh one, and the file becomes reachable while
still unscanned. That race is why option 3 exists.

**This control is not "implemented" until one of these is in production.** The
rule in §8 applies to it: a scanner that runs while the file is already
downloadable is evidence of activity, not a control. Which of the three to
build is a decision, and it should be taken before the scanner is wired up
rather than after.

### Status, 4 September 2026

Option 1 is **built and passing in staging**, and is **not in production**. Full
results in [`malware-scanning-staging-report.md`](malware-scanning-staging-report.md):
the ClamAV service is deployed private to `europe-west2`, an authenticated clean
file scans clean, EICAR is caught by name, an oversized file is refused rather
than passed, and an instance whose clamd has not finished loading refuses
traffic instead of calling everything clean.

Two things follow from that, and neither is optional:

- `scanUploadedFile` is wired into `functions/index.js` with both switches off
  and has **not been deployed**. Turning it on is the user's call, twice over:
  once to deploy with the flag off, once to set the flag.
- **The anti-malware answer, for Amazon, is now decided by the endpoint
  half.** On 5 September 2026 the user removed Option 3 from the Amazon blocker
  list: the criterion is scoped to servers and endpoints that access SP-API
  data, and the Amazon zone stores no files. Option 1 went live on 4 September
  (flag on, first clean upload and an EICAR deletion watched live —
  `malware-scanning-staging-report.md` §14). Option 3 continues as product
  security remediation, tracked in `amazon-readiness-criteria.md`.

## 8. The rule this document exists to enforce

A control counts as implemented when it is **in production and evidenced**. A
control that exists in a design, in a dry-run, or in a staging project does not
count, and the Amazon readiness gate must not pass it. The last application was
refused for answering No honestly. The next one must not be refused for
answering Yes prematurely — that is a materially worse failure, because the
first was a gap and the second would be a misstatement.
