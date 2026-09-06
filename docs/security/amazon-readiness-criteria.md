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
| 1. Network segmentation | **In progress — perimeter in dry-run since 5 Sep 2026** | project/folder/org-policy read-back (`org-policies.txt`), private zone + route + firewall and the diag proof (`pga-*`), bootstrap IAM record, bridge test; VPC Service Controls perimeter `amazon_information` (access policy `eggcraft-access-policy`, dry-run spec only: 10 restricted services, 4 ingress + 1 egress rule — `perimeter.json`) | a few days of observed admin/bridge/PGA traffic under dry-run and the violation report with dispositions (`vpcsc-dryrun-report.txt`; so far: the load-balancer path, resolved by the ANY_IDENTITY Cloud Run rule, and the deliberate cross-project Firestore read, which the perimeter marks as what it will refuse — `cross-project-read-2026-09-05.txt`), then the enforce gate (separate approval). **Go/No-Go report written 5 Sep 21:40 UTC in `amazon-vpcsc-enforce-readiness.md`: No-Go today, Go from 8 Sep if the 6–7 Sep reports stay clean; residual (unobservable until Amazon credentials exist): the oauth consent and scheduler→sync paths, assessed as fail-closed and logged** |
| 2. Firewall and network ACLs | **Passed** (5 Sep 2026) | `cloud-armor-policy.json`, `lb-*.json`, `lb-certificate-and-address.txt`, `run-ingress.txt`, `run-app-closed-to-internet.txt`, `vpc-firewall-rules.json`, `nat-and-static-ip.txt`, `subnet-flow-logs.txt`, `armor-blocked-requests.txt` (real scanners denied by the WAF and the default rule within minutes of go-live), `edge-smoke-2026-09-05.md` (8/8), `egress.js` tests | two log-based items are captured from configuration and unit tests today and will be re-captured from live traffic once the connector runs: a refused egress in the wrapper's log, a NAT translation |
| 3. IDS / IPS / threat detection | **In Progress — Google support / detector investigation required** | Premium (30-day trial, then pay-as-you-go) on the project, Standard on the organisation; Event Threat Detection and Cloud Run Threat Detection effective (`scc-services.txt`); service agents bound (`scc-agents.txt`); findings → Pub/Sub → email alert built and **proven with a real finding** (Cloud Armor "Increasing Deny Ratio", `scc-finding-2026-09-05.md`); 400-day log retention; Cloud Armor prevention half live | Google's documented detection tests were run and did not fire: ETD three times (last two on a VM exactly as documented, DNS queries logged under the VM identity, with the `_Default` sink both enabled and disabled — `etd-investigation-2026-09-05.md`), CRTD twice (the second 10 h after enablement, past the documented 3.5-hour activation window — `crtd-investigation-2026-09-05.md`). No further experiments (operator decision 5 Sep, records closed as final); **Google Cloud support case 75151719 filed 5 Sep 22:31 UTC** under the new Standard Support plan (`google-support-case-scc-detectors.md`); the delivery chain is re-verified end of day with all six retained notifications and the alert metric (`scc-notification-message-2026-09-05.json`, `scc-topic-publishes-2026-09-05.txt`). `Passed` only when an ETD finding and a CRTD finding, each delivered, are in the pack |
| 4. Anti-malware on privileged endpoints | **Passed — 5 Sep 2026 (final evaluation in §4b; two time-gated attachments follow)** | upload scanner production report; shared-responsibility note for the serverless layer; Microsoft 365 Business Premium (no Teams, 1 user) bought, tenant `eggcraft.onmicrosoft.com`, Apple MDM push certificate active, Intune compliance policy + hardening profile + Defender AV (tamper protection block, RTP, cloud protection, weekly full scan) + EDR onboarding + Defender app + four Defender permission profiles all assigned to All devices, Defender ↔ Intune connector on (`edr-onboarding-2026-09-05.md`, `intune-profiles/`) | the MacBook Pro is enrolled (user-approved MDM, corporate), Intune = Compliant, Defender onboarded and `mdatp health` fully green (RTP, tamper protection block, cloud, definitions current, weekly full + daily quick scan, MAU auto-update) — §4 of `edr-onboarding-2026-09-05.md`; `device-inventory.md` written. Present: `edr-console-devices.png`, `edr-tamper-protection.png`, `mdm-policy-export.pdf`, `device-inventory.md`, plus `intune-compliance.png` / `intune-device-configuration.png`; the EDR pipeline was proven by a real incident (ID 1, the assistant's own capture tooling, disposition in the record). Scope decided 5 Sep: Mac Studio and phone out of scope (`access-control-policy.md` §6.1). To append when available (verdict unchanged): `edr-definitions-date.png` from the Defender Antivirus-health report once it lists the device, and the first policy-scheduled full scan (Sunday 7 Sep 03:00) |

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
- *Endpoints:* the devices with production access — after the scope decision
  of 2026-09-05, exactly one: the operator's MacBook Pro — are enrolled in an
  **MDM** (Microsoft Intune, user-approved enrolment without Apple Business
  Manager), which enforces a **managed EDR/anti-malware product** (Microsoft
  Defender for Endpoint via Defender for Business) with tamper protection (the
  user cannot uninstall or disable it), automatic signature updates (daily; the
  criterion is monthly), and a weekly scheduled full scan plus a daily quick
  scan in addition to on-access scanning. The MDM also enforces disk
  encryption, screen lock, firewall, and OS updates. The Mac Studio and the
  phone are out of scope by decision (`access-control-policy.md` §6.1).
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

### 4a. Endpoint policy and device scope (added 2026-09-05)

**Devices in scope** — every device from which a person can reach Amazon
Information or the controls around it. Today that is one operator; the
inventory is kept in `access-control-policy.md` and re-confirmed quarterly.

| Device | Why it is in scope | Status |
|---|---|---|
| The operator's MacBook Pro (`Guness-MacBook-Pro`) | signed-in `gcloud` as the project owner, the Google Cloud console, the repository and its deploy keys; can read `nivadesk-amazon` Firestore and Secret Manager | **enrolled and onboarded 5 Sep 2026** (Intune Compliant, Defender healthy — `evidence/amazon/device-inventory.md`) |
| The operator's Mac Studio (second workstation; the repository branch history shows it) | **excluded by decision (2026-09-05)**: not used for Amazon SP-API administrative systems, `nivadesk-amazon`, Seller Central or Amazon Information from this date; enrolment under the same baseline is a precondition if that ever changes (`access-control-policy.md` §6.1) | **out of scope** |
| The operator's phone | authentication only (Microsoft MFA, Google 2-step verification); no Amazon, SP-API or administrative data access from it; NivaDesk's mobile app cannot read the restricted collection in any case | **out of scope — authentication only (decision 2026-09-05)** |
| Amazon zone servers | serverless (Cloud Run gen2); host anti-malware is Google's under the shared-responsibility model; runtime detection is Cloud Run Threat Detection (control 3) | covered by control 3 |

**Minimum policy for an in-scope device** (Amazon: current anti-malware that
the user cannot disable, updated at least monthly, on-access plus scheduled
scans, under management):

1. **Managed EDR / anti-malware** deployed and enrolled by the MDM, not
   installed by hand — the product must report to a console the operator does
   not control from the device itself.
2. **Tamper protection on**: the device user cannot uninstall, stop, or
   disable the agent or its real-time protection; the MDM profile blocks
   removal of the management profile.
3. **Automatic updates**: engine and signature updates automatic (daily),
   with the criterion of "no older than 30 days" alarmed in the console; OS
   updates enforced by the MDM within 14 days of release.
4. **Weekly full scan** scheduled by policy, in addition to on-access
   (real-time) scanning; results retained in the console.
5. **Device compliance evidence**: disk encryption (FileVault / device
   encryption) on, screen lock ≤ 15 minutes (operator decision 2026-09-05 23:05 UTC; exactly the DPP 1.1.2 maximum of 15 minutes and within the CIS macOS Benchmark ceiling of 20 — it was 5 minutes earlier that day), firewall on, compliance state
   reported to the MDM; a non-compliant device loses access (conditional
   access on the Google account, or at minimum the operator's documented
   procedure to revoke sessions).
6. **Evidence kept for the pack** (files named in `evidence.sh`):
   `edr-console-devices.png` (every in-scope device, protected), `edr-definitions-date.png`
   (definitions within 30 days), `edr-tamper-protection.png` (setting on),
   `mdm-policy-export.pdf` (the enforced profile), `device-inventory.md`
   (the table above with serials, last scan date, agent version). Screenshots
   are taken from the consoles, not from the device, and re-captured within
   the 30 days before the application.

**Decision (2026-09-05): Microsoft 365 Business Premium** — setup plan and
scope table in `edr-mdm-options.md`. **Candidate products** considered (any
one satisfies the policy): Microsoft Intune + Defender for
Business (Microsoft 365 Business Premium), Jamf Now/Pro + Jamf Protect, or
Kandji with its built-in EDR — all three support macOS and iOS, tamper
protection, scheduled scans and exportable compliance reports. Microsoft 365
Business Premium was bought, configured and enrolled the same day (§4b).

### 4b. Final readiness evaluation — 2026-09-05 21:20 UTC

Performed after the operator's conditions were met: first successful quick
scan, current definitions and the managed policies verified on the live device
and in the consoles. Record: `evidence/amazon/edr-onboarding-2026-09-05.md`;
inventory: `evidence/amazon/device-inventory.md`; scope: `access-control-policy.md` §6.1.

| "Passes when" element | Evidence | Result |
|---|---|---|
| The EDR console lists every privileged device as protected | Defender › Device inventory: 1 device (`Guness-MacBook-Pro`), sensor health **Active**, onboarding **Onboarded**, Not onboarded 0 — `edr-console-devices.png`; the device is the only in-scope endpoint (Mac Studio and phone out of scope by decision) | **met** |
| Tamper protection on | Intune AV policy `macOS - Defender AV baseline`: tamper protection enforcement **block** — `edr-tamper-protection.png`; device readback `tamper_protection: "block" [managed]` | **met** |
| Definitions dated within 30 days | device readback 2026-09-05: definitions 1.459.66.0, `up_to_date`, updated 19:41 UTC, automatic updates on (`mdatp health` in `mdm-policy-export.pdf` §2); Defender › Reports › Device health › Antivirus health still "No data" for Mac devices on the day of onboarding (report lag) — `edr-definitions-date.png` is attached from that report as soon as it lists the device | **met on the device; console capture pending (report lag)** |
| Last scheduled scan within 7 days | policy-scheduled scans enforced `[managed]`: weekly **full** Sunday 03:00 + daily **quick** 12:00 (Intune AV policy, device readback); on-demand quick scan 2026-09-05 20:43 UTC: 7,789 files, 0 threats. First scheduled runs: quick 2026-09-06 12:00, full 2026-09-07 03:00 — the assigned policy stands as the evidence (operator decision) and the first full scan is appended to the record after Sunday | **met by policy; first full-scan record to be appended** |
| The MDM shows the policy enforced | Intune › device › Device configuration: 8 profiles **Succeeded**; compliance **Compliant** — `intune-device-configuration.png`, `intune-compliance.png`, `mdm-policy-export.pdf` | **met** |
| Inventory kept | `device-inventory.md` + `access-control-policy.md` §6.1 (scope decision 2026-09-05) | **met** |
| Detection pipeline works (not a formal element, recorded because it happened) | Defender incident ID 1 — the assistant's own capture tooling on the device produced 10 EDR alerts within minutes, correlated into one incident, triaged and resolved as *Informational, expected activity / Security testing* with a written justification — `edr-incident-1-active.png`, `edr-incident-1-resolved.png` | **demonstrated** |

**Verdict: control 4 = Passed** (2026-09-05). Two time-gated attachments are
still to be added to the pack and do not change the verdict: the Defender
Antivirus-health report capture (`edr-definitions-date.png`) once the report
lists the device, and the record of the first policy-scheduled full scan
(Sunday 2026-09-07 03:00). Both are captured within the 30 days before the
application in any case (§4 evidence rule). The separate approval gates —
VPC Service Controls enforce, connector activation, Amazon OAuth / order sync —
are unchanged by this verdict and remain closed.

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

The rest of the Data Protection Policy (endpoint media restrictions, training
record, password history, risk register, records of processing, log-review
cadence, penetration test booking, zone backups, container scanning, dependency
fixes) is mapped with owners and dates in `amazon-dpp-compliance-matrix.md`;
none of those items is part of the network-security question that was refused,
but the resubmission answers every one of them honestly.

## The other nine key controls — where they stand

Amazon's guidance lists ten key controls. The four above are the ones the
refusal named. The rest, with the document that answers each:

| Control | Answer | Where |
|---|---|---|
| Password and authentication | Yes — the privileged-account audit closed 4 Sep 2026; MFA and rotation attested per account | `password-and-mfa-policy.md` §8 |
| Asset management | Yes — device inventory and scope decision recorded 5 Sep 2026, re-confirmed quarterly; infrastructure scripted and read back by `verify-project.sh`; DPP 2.3 mapping in the compliance matrix | `access-control-policy.md` §6.1, `evidence/amazon/device-inventory.md`, `amazon-dpp-compliance-matrix.md` |
| Access review | Yes — one human, roles reviewed 4 Sep 2026; quarterly cadence recorded | `access-control-policy.md` |
| Data encryption at rest | Yes — Google-managed encryption on Firestore/Secret Manager; refresh tokens sealed on the connection document | `commerce/amazon/oauth.js` |
| Anti-malware controls | Control 4 above | this document |
| Data retention | Yes — 30-day retention sweep in production; Amazon zone retains only order data A1 needs | `privacy/retention.js` |
| Identification of potential incidents | Control 3 above + Cloud Logging alerts | this document |
| Incident management procedures | Yes — plan approved, six-monthly review | `incident-response-plan.md` |
| Vulnerability management | Yes (plan + first scan) — written plan with the DPP cadences and deadlines; first dependency scan recorded 5 Sep 2026 (1 critical / 13 high across the three trees, fixes available; due 12 Sep / 5 Oct); container scanning and a CI audit step planned; the annual penetration test is **scheduled, not done** — the operator books it before resubmission | `vulnerability-management.md`, `evidence/amazon/vuln-scan-2026-09-05.md` |
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
