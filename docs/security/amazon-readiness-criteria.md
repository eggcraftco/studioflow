# Amazon re-registration — readiness criteria for the network-security question

**Date:** 5 September 2026
**Decision recorded here:** Option 3 (replacing NivaDesk's `getDownloadURL`
bearer tokens with signed, expiring file access) is **removed from the Amazon
re-registration blocker list**. It continues as a separate product-security
remediation, tracked in its own section at the end. The second Developer
Profile application goes in when the four controls below are implemented in
production and evidenced — not when the whole file-access architecture has been
migrated.

The first application was refused on one question: the network security
controls, answered "No" honestly. This document says what "Yes" means for each
control, in Amazon's own words, what we build to meet it, and what evidence
proves it. A control counts when it is **in production and evidenced**; a
design, a dry-run, or a staging project does not count (the rule from
`amazon-network-controls-plan.md` §8).

## What Amazon actually asks for

Quoted from Amazon's Data Protection Policy and its two SP-API guidance pages
(`guidance-for-network-protection-in-sp-api`,
`guidance-to-address-key-security-controls-in-sp-api-integration`), fetched
5 September 2026:

> **1.1 Network Protection.** Solution Provider must implement network
> protection controls to prevent unauthorized access, detect malicious
> activity, and protect Information through defense-in-depth mechanisms.
>
> **1.1.1 Network and Application Security.** Solution Provider must
> implement: Network protection controls including network firewalls and
> network access control lists (ACLs) …
>
> **1.1.2 Endpoint Protection.** Implement malware protection controls
> appropriate to the deployment environment on systems that access, process,
> or store information …

> "implement network firewalls, network access control lists (ACLs),
> identity-based access controls, and equivalent mechanisms that deny access
> to unauthorized entities"
>
> "implement network segmentation to isolate sensitive environments and limit
> lateral movement" — "Establish enhanced network segmentation with clear
> separation between security zones" — "Implement strict access controls
> between segments"
>
> "intrusion detection and prevention capabilities (IDS/IPS or equivalent) to
> detect and block malicious network activity" — "Implement IDS/IPS signature
> pattern-based detection mechanisms"
>
> "Deploy and maintain up-to-date antivirus software on all servers and
> endpoints that access SP-API data." — "Implement endpoint protection
> solutions that prevent users from disabling anti-virus software." — "Update
> anti-virus and anti-malware tools at least monthly." — "not relying solely
> on on-access scans"
>
> "Implement Group Policy (Windows), Mobile Device Management (MDM), Unified
> Endpoint Management (UEM), or equivalent solutions to enforce security
> policies on all devices that access, process, or store Information."
>
> "maintain documentation for network and endpoint protection controls,
> including network architecture diagrams and evidence of the deployment and
> management of security controls such as firewalls, WAF or equivalent,
> IDS/IPS, and endpoint protection"

Three things in that text shape everything below. "Deny access to unauthorized
entities" is stated for both **network** and **identity** controls, so
identity-based access is part of the firewall answer, not a substitute for it.
"Servers and endpoints that access SP-API data" scopes the anti-malware control
to what touches Amazon Information — not to every NivaDesk file path. And
Amazon asks for **documentation and diagrams as evidence**, which is why each
control below ends with an evidence list.

## Status board (internal readiness, updated 2026-09-05)

| Control | Status | Evidence (docs/security/evidence/amazon/) | What is still open |
|---|---|---|---|
| 1. Network segmentation | **In progress** | project/folder/org-policy read-back (`org-policies.txt`), private zone + route + firewall and the diag proof (`pga-*`), bootstrap IAM record, bridge test | VPC-SC perimeter: dry-run first, then a week of traffic, then the enforce gate |
| 2. Firewall and network ACLs | **Passed** (5 Sep 2026) | `cloud-armor-policy.json`, `lb-*.json`, `lb-certificate-and-address.txt`, `run-ingress.txt`, `run-app-closed-to-internet.txt`, `vpc-firewall-rules.json`, `nat-and-static-ip.txt`, `subnet-flow-logs.txt`, `armor-blocked-requests.txt` (real scanners denied by the WAF and the default rule within minutes of go-live), `edge-smoke-2026-09-05.md` (8/8), `egress.js` tests | two log-based items are captured from configuration and unit tests today and will be re-captured from live traffic once the connector runs: a refused egress in the wrapper's log, a NAT translation |
| 3. IDS / IPS / threat detection | **Gate approved 5 Sep — activation blocked at Google's side** | the prevention half is live (Cloud Armor, above); log bucket retention 400 days (`log-bucket-retention.txt`); findings → Pub/Sub subscription, email channel and alert policy are in place | project-level Premium activation in the console fails: `SecurityCenterManagement.GenerateServiceAccounts` returns `FAILED_PRECONDITION: project 145308107004 is already onboarded` (the API had been enabled before the console flow) and the console will not proceed without that call — tried with both SCC APIs enabled and disabled. Options: organisation-level Standard (free) then "Manage project tier → Premium" for this project, or a Google support case; then `scc.sh` (notification config) and `scc-test.sh` (benign ETD finding) |
| 4. Anti-malware on privileged endpoints | **Blocked — EDR/MDM not in place** | upload scanner production report; shared-responsibility note for the serverless layer | the operator's devices are not yet enrolled in an MDM with a managed, tamper-protected EDR; until the console screenshots, the MDM policy export and the device inventory exist, this control is a stated blocker for the application |

## The four controls, redefined

### 1. Network segmentation

**Criterion.** Amazon Information lives in its own security zone with clear
separation from the rest of NivaDesk, strict access controls between the two,
and no path for lateral movement.

**Implementation.** A dedicated Google Cloud project, `nivadesk-amazon`,
holding every service that stores or processes Amazon Information, inside a
**VPC Service Controls perimeter**. The main NivaDesk project stays outside the
perimeter; the only crossings are explicit rules: the operator's identity
inbound, and one bridge service account outbound to one main-project endpoint
carrying sanitized, non-PII envelopes. Compute egress leaves through a VPC of
its own. Design: `amazon-hardened-project-design.md`.

**Passes when** the perimeter is **enforced** (not dry-run), every violation
seen in dry-run is either resolved or an explicit rule, and a request from
the main project to the Amazon project's Firestore is refused.

**Evidence.** Perimeter and access-policy configuration (`gcloud
access-context-manager perimeters describe`, JSON); the dry-run violation
report and its dispositions; a recorded denied cross-project read; the
architecture diagram; the project-level org policies.

### 2. Firewall and network ACLs

**Criterion.** Every network path into the Amazon zone passes a firewall that
denies by default and allows only enumerated paths; every path out is
restricted to enumerated destinations; identity-based access denies anything
not explicitly authorised.

**Implementation.** All inbound HTTP enters through one external HTTPS load
balancer with a **Cloud Armor** policy: a default-deny rule, allow rules for
the enumerated path prefixes, preconfigured WAF rule sets (SQLi, XSS, LFI,
RFI, RCE, protocol attacks, scanner detection), per-client rate limits, and
— Standard tier — Adaptive Protection's basic layer-7 DDoS alerts (attack
signatures and suggested mitigation are Enterprise features and are not
claimed). Cloud Run ingress is `internal-and-cloud-load-balancing` on every
service, enforced by the **`run.allowedIngress` organisation policy on the
project**, so the default `run.app` address is closed to the internet; the
only internal caller is Cloud Scheduler, authenticated, in the same project. Every service authenticates callers (OIDC) on top of that. Outbound
traffic leaves by **direct VPC egress** through Cloud NAT with one static
address; VPC firewall rules deny all egress except TCP/443; an
**application-layer hostname allowlist** in the connector refuses any
destination but the SP-API regional hosts, Login with Amazon and the one
main-project bridge endpoint, and logs every destination; VPC Flow Logs and
NAT logging record every connection. (A Secure Web Proxy was evaluated and
not adopted: ~$900/month, and not required by Amazon's guidance —
`amazon-hardened-project-design.md` §0.)

**Passes when** an unauthenticated request to any path is refused at the
edge, a request to a non-enumerated path is refused, every `run.app` address
answers 403 to an unauthenticated request from the internet while Cloud
Scheduler's authenticated call still lands, an egress attempt to a host
outside the allowlist is refused by the wrapper and logged, and a non-443
egress attempt is dropped by the VPC firewall.

**Evidence.** Cloud Armor policy (JSON) and LB configuration; the org policy;
each service's ingress setting; VPC firewall rules, NAT and static-IP
configuration; `egress.js` and its tests; request logs showing a blocked WAF
hit, a rate-limit block, a refused egress, a NAT translation; the diagram.

### 3. IDS / IPS / threat detection

**Criterion.** Malicious activity against the Amazon zone is detected by
signature- and pattern-based mechanisms and blocked, with logs retained at
least twelve months and findings routed to a person.

**Implementation.** **Security Command Center Premium** activated on the
Amazon project (project-level, pay-as-you-go): Event Threat Detection over the
project's audit and network logs, **Cloud Run Threat Detection** on every
service (second-generation execution environment from the first deploy),
Security Health Analytics, and Web Security Scanner against the load-balanced
endpoints. The prevention half is Cloud Armor's WAF rules and Adaptive
Protection in front, which block rather than report. Findings publish to a
Pub/Sub topic and page the operator. Cloud Audit Logs (admin and data access
for Firestore and Secret Manager) go to a log bucket with **400-day
retention**.

**Passes when** SCC Premium shows active on the project with both detectors
enabled, a test detection (a benign ETD/CRTD trigger from Google's own test
guidance, or a WAF rule hit) produces a finding that reaches the operator,
and the log bucket's retention reads 400 days.

**Evidence.** SCC service enablement (console and `gcloud scc`); detector
configuration; the notification config; one real or test finding and its
delivery; the log bucket retention setting; Cloud Armor's blocked-request log
entries and its Standard-tier Adaptive Protection alert setting.

### 4. Anti-malware on privileged endpoints and servers

**Criterion.** Every device and server that accesses, processes, or stores
SP-API data runs current anti-malware that the user cannot disable, with
updates at least monthly, on-access scanning **plus** scheduled scans, under
MDM/UEM-enforced policy — and an inventory of those devices is kept.

**Implementation.**

- *Servers:* the Amazon zone is serverless. The host layer is Google's
  responsibility and is documented as such (shared responsibility, with the
  reference). What is ours: the upload scanner (live since 4 September 2026,
  `malware-scanning-staging-report.md`) covers every file a customer puts
  into NivaDesk, and Cloud Run Threat Detection covers the runtime. No Amazon
  Information is ever written to Cloud Storage.
- *Endpoints:* the devices with production access — today, one operator's
  Mac and phone — are enrolled in an **MDM** (Apple Business Manager plus a
  managed MDM), which enforces a **managed EDR/anti-malware product** with
  tamper protection (the user cannot uninstall or disable it), automatic
  signature updates (daily; the criterion is monthly), and a weekly scheduled
  full scan in addition to on-access scanning. The MDM also enforces disk
  encryption, screen lock, and OS updates.
- *Inventory:* a quarterly inventory of devices, systems, and applications
  that handle Amazon Information, kept in `access-control-policy.md`.

**Passes when** the EDR console lists every privileged device as protected,
tamper protection on, definitions dated within 30 days, last scheduled scan
within 7 days — and the MDM shows the policy enforced. This half is the
operator's to do; it is not code.

**Evidence.** EDR console screenshot (devices, protection status, definition
date, tamper protection); MDM policy export; the device inventory; the
shared-responsibility note for the serverless layer; the upload scanner's
production report.

## Explicitly not a blocker

**Option 3 — signed, expiring file access instead of `getDownloadURL` bearer
tokens.** This is a NivaDesk product-security improvement about *customer*
files in the *main* project. It does not touch Amazon Information: the Amazon
zone stores no files, and the sanitized bridge carries no file references.
Amazon's anti-malware criterion is scoped to "servers and endpoints that
access SP-API data", which Option 3 is not about. It stays open as its own
remediation (below) and does not gate the application.

Also not blockers, tracked separately: the main project's project-level
`run.invoker` grant and the upload scanner's `ingress=all`.

## The other nine key controls — where they stand

Amazon's guidance lists ten key controls. The four above are the ones the
refusal named. The rest, with the document that answers each:

| Control | Answer | Where |
|---|---|---|
| Password and authentication | Yes — the privileged-account audit closed 4 Sep 2026; MFA and rotation attested per account | `password-and-mfa-policy.md` §8 |
| Asset management | Partial — the device/system inventory is to be kept quarterly (control 4) | `access-control-policy.md` |
| Access review | Yes — one human, roles reviewed 4 Sep 2026; quarterly cadence recorded | `access-control-policy.md` |
| Data encryption at rest | Yes — Google-managed encryption on Firestore/Secret Manager; refresh tokens sealed on the connection document | `commerce/amazon/oauth.js` |
| Anti-malware controls | Control 4 above | this document |
| Data retention | Yes — 30-day retention sweep in production; Amazon zone retains only order data A1 needs | `privacy/retention.js` |
| Identification of potential incidents | Control 3 above + Cloud Logging alerts | this document |
| Incident management procedures | Yes — plan approved, six-monthly review | `incident-response-plan.md` |
| Vulnerability management | Partial — `npm audit` in CI; annual penetration test and monthly scanning to be scheduled | plan §6 |
| Third-party risk management | Yes — sub-processor list; no third party receives Amazon Information | `access-control-policy.md` |

## Option 3 — product security remediation (separate track)

**What.** Replace Firebase download-URL bearer tokens with server-issued,
signed, short-lived access for every client file path, on all four clients.

**Why it still matters.** A download token bypasses Storage rules and never
expires; a copied URL is a credential for ever. The upload scanner holds the
token until a file is clean, and the storage rules now stop a settled-non-clean
file from being re-minted through the SDK — but a clean file's URL is still a
bearer credential with no expiry.

**Scope.** Web, macOS/iOS, Android; the portal and estimate pages; the
`fileShares` and `portalUrl` records that store URLs today. Store versions
required. Not started.
