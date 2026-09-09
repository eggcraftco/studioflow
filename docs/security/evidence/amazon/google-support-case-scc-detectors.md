# Google Cloud support case — Security Command Center detectors silent on a project-level Premium activation

**Status 2026-09-05 21:50 UTC: accepted by the operator as ready to open — not yet sent.** The assistant prepares the console up to the support plan / price screen and stops; buying a plan or sending the case is the operator's click. Filing
is the operator's decision (it needs a paid support plan or the public issue
tracker, see "Where to file"). Prepared for the operator to file (the
assistant does not create or send cases from the operator's account). One case
covering both detectors; the second detector can be split out if support asks.
Nothing in the environment has changed since the tests, so the case text
below is current; the two investigation records are closed and attached.

## Case header

| Field | Value |
|---|---|
| Product | Security Command Center — Event Threat Detection and Cloud Run Threat Detection |
| Project | `nivadesk-amazon` (project number **145308107004**), folder `amazon-boundary` (758048022614), organisation `eggcraft.co.uk` (378239481010) |
| Region of resources | europe-west2 |
| Activation | Organisation: **Standard**, activated 2026-09-05 ~02:15 UTC (console). Project: **Premium**, 30-day trial started 2026-09-05 02:18 UTC (console readback: *Tier: Security Command Center Premium — Billing status: Trial ending on Oct 5, 2026*) |
| Severity (suggested) | S3 — no production impact; blocks a compliance evidence step |
| Requested outcome | An explanation of why neither detector produced a finding for Google's own documented test procedures, and the configuration change (if any) that makes them fire |

## Summary

Google's documented test procedures for two threat detectors were run on
the project after activation. Neither produced a finding at project or
organisation level, against documented latencies of "generally less than 15
minutes" (Event Threat Detection) and "detection latency of minutes" after
the "up to 3.5 hours" activation window (Cloud Run Threat Detection). All
configuration reads back as enabled; the delivery chain is proven with a
real Cloud Armor finding on the same project.

## Detector and module enablement (read live with `gcloud scc manage services`)

```
event-threat-detection      intended ENABLED   effective ENABLED   (update 2026-09-05T02:2x UTC)
  module MALWARE_BAD_DOMAIN                 effective ENABLED
  module SERVICE_ACCOUNT_SELF_INVESTIGATION effective ENABLED
  (152 of 171 modules effective ENABLED)
cloud-run-threat-detection  intended ENABLED   effective ENABLED   (update 2026-09-05T02:21:20 UTC)
  module CLOUD_RUN_BASE64_ELF_FILE_CMDLINE  effective ENABLED
  (38 of 43 modules effective ENABLED)
Sources registered for the project (v2 API, 45): include "Event Threat Detection",
"Cloud Run Threat Detection", "Cloud Armor", "Compliance Evaluation Service".
SCC service agents on the project (granted 2026-09-05 ~02:35 UTC):
  roles/securitycenter.serviceAgent → service-project-145308107004@security-center-api.iam.gserviceaccount.com
  roles/containerthreatdetection.serviceAgent → service-project-145308107004@gcp-sa-ktd-hpsa.iam.gserviceaccount.com
  roles/cloudsecuritycompliance.serviceAgent  → service-project-145308107004@gcp-sa-csc-hpsa.iam.gserviceaccount.com
  roles/dspm.serviceAgent                     → service-project-145308107004@gcp-sa-dspm-hpsa.iam.gserviceaccount.com
Security Health Analytics: not enablable on this new activation (documented; Compliance Manager enabled instead).
```

## Event Threat Detection — "Malware: Bad Domain" (documented VM procedure)

Cloud DNS server policy `amazon-dns-logging` on VPC `amazon-vpc`, `enableLogging: true`.
Test VM `amazon-etd-vm-test` (e2-micro, europe-west2-a, subnet `amazon-subnet`, no external
address, no service account) with the documented startup script (`curl etd-malware-trigger.goog`
and `getent hosts etd-malware-trigger.goog`, three times). DNS query log entries as stored in the
project (resource.type `dns_query`, log bucket `amazon-audit`, europe-west2):

| Run | VM address | Queries logged (UTC) | `vmInstanceName` | Response | `_Default` sink | Finding by |
|---|---|---|---|---|---|---|
| 1 | 10.60.0.2 | 03:13:38, 03:14:08 (×2), 03:14:38 (×2) | 145308107004.amazon-etd-vm-test | NOERROR | disabled | none (checked to 03:45) |
| 2 | 10.60.0.3 | 12:27:27, 12:27:57 (×2), 12:28:27 (×2) | same | NOERROR | **enabled** for this run | none (checked to 12:57) |
| 3 | 10.60.0.4 | 13:05:28, 13:05:58 (×2), 13:06:28 (×2) | same | NOERROR | disabled | none (checked to 13:38) |

An earlier attempt from a Cloud Run job (02:41 UTC, query logged without a VM identity) is not
counted. Logging routing of the project: `_Default` sink **disabled** by design, `_Required`
default, `amazon-audit-sink` (empty filter) → regional bucket `amazon-audit` (400-day retention).
Run 2 shows the sink setting is not the cause.

## Cloud Run Threat Detection — "Defense Evasion: Base64 ELF File Command Line" (documented job test)

Job `amazon-crtd-test` (since deleted; execution logs retained), image
`europe-west2-docker.pkg.dev/nivadesk-amazon/amazon/nivadesk-amazon:6ee4d01f` (node:22-slim base),
second-generation execution environment, direct VPC egress `amazon-vpc`/`amazon-subnet`
(all-traffic), service account `amazon-sync@nivadesk-amazon`, command exactly as documented:
`bash -c "sleep 60; base64 -d f0VMRgIB; sleep 10"`.

| Execution | Start → end (UTC) | Relative to enablement (02:21:20) | Container log line | Finding by |
|---|---|---|---|---|
| `amazon-crtd-test-895jz` | 03:01:39 → 03:03:03, succeeded | +40 min (inside the documented 3.5 h activation window) | 03:02:51 `base64: f0VMRgIB: No such file or directory` | none (checked to 03:33) |
| `amazon-crtd-test-cf7xf` | 12:38:59 → 12:40:24, succeeded | +10 h 18 min | 12:40:11 `base64: f0VMRgIB: No such file or directory` | none (checked to 13:10) |

No log entries of resource type `threat_detector` exist in the project.

## Findings that DO exist on the project (proving the pipeline and delivery)

- 2026-09-05T05:29:30Z **Cloud Armor — Increasing Deny Ratio** (MEDIUM, THREAT): created by the
  Cloud Armor source, published by notification config
  `projects/145308107004/locations/global/notificationConfigs/amazon-findings` to Pub/Sub topic
  `scc-findings` 3 s later, received by subscription `scc-findings-evidence`, alert fired.
- 2026-09-05T11:39:18Z **Compliance Evaluation Service — OS_LOGIN_DISABLED** (MEDIUM, MISCONFIGURATION) on the project.

## Expected behaviour

Per the documentation: an Event Threat Detection "Malware: Bad Domain" finding within about 15
minutes of the logged DNS query for `etd-malware-trigger.goog` from a VM in a VPC with Cloud DNS
logging; a Cloud Run Threat Detection "Defense Evasion: Base64 ELF File Command Line" finding
within minutes of the documented command executing in a gen2 Cloud Run job created after the
detector's activation window.

## Questions for Google

1. Is Event Threat Detection consuming this project's Cloud DNS logs for the project-level
   activation? If a Logging routing or sink configuration is required, which one?
2. Is Cloud Run Threat Detection serving europe-west2 for this project-level activation, and did
   its watcher attach to executions of a job created after enablement? Where should its own logs
   appear?
3. Is there any residual effect of the project having been "already onboarded" (the console
   activation flow failed with `GenerateServiceAccounts FAILED_PRECONDITION: project … is already
   onboarded` after the securitycenter API had been enabled by hand; the organisation-level
   Standard activation and the tier change to Premium were done afterwards)?

Attachments to include: `etd-investigation-2026-09-05.md`, `crtd-investigation-2026-09-05.md`,
`scc-activation-2026-09-05.md`, `scc-services.txt`, `scc-agents.txt` (all under
`docs/security/evidence/amazon/`).

## Plan / price screen reached (2026-09-05 22:20 UTC) — operator decision pending

The console's Support section for this organisation has no in-console plan
page (`/support/plans` redirects to the overview; "Get Support" launches the
Customer Care portal). The public Customer Care page
(`cloud.google.com/support`, "The Customer Care portfolio") was opened in
Chrome and left on the plan table: **Standard Support — minimum $29.00 per
month or 3% of monthly Cloud charges, whichever is higher; P2 first response
4 h, 8/5 for high-impact; "Sign up" button.** Enhanced ($100 minimum / tiered
%) and Premium ($15,000 minimum) are not proportionate. Nothing was clicked:
buying the plan and sending the case are the operator's actions. The free
alternative remains the public issue tracker (below) with the identities
removed from the text.

## Purchase attempt 2026-09-05 22:00 UTC — stopped at an IAM prerequisite

The operator approved Standard Support ($29/month minimum). The console
purchase flow (`support/registration_cc;supportTier=STANDARD`) was opened as
`contact@eggcraft.co.uk` (the console had been signed in as the personal
Google account, which has no organisation; switching required the account's
passkey). Step 1 accepted organisation `eggcraft.co.uk`, then stopped:
*"You must be assigned Support > Support Account Administrator
(`roles/cloudsupport.admin`) for the organization in IAM to continue."*
Read-back of the organisation IAM policy at 22:04 UTC: the operator holds
`roles/resourcemanager.organizationAdmin` and
`roles/accesscontextmanager.policyAdmin` at the organisation; no principal
holds any `cloudsupport` role. Granting the role is an organisation-level IAM
change and therefore the operator's decision (it also changes
`operator-org-roles.txt` in the pack and must be recorded in
`bootstrap-iam-reduction.md`). Command prepared, **not run**:

```
gcloud organizations add-iam-policy-binding 378239481010 \
  --member=user:contact@eggcraft.co.uk --role=roles/cloudsupport.admin
```

After the purchase the role can stay (it is what manages the plan and its
cases) or be reduced to `roles/cloudsupport.techSupportEditor` on the project
for case work only; either way the pack records it.

**22:09 UTC — the operator ran the command themselves** (organisation IAM
read-back: `roles/cloudsupport.admin` → `user:contact@eggcraft.co.uk`, the
only `cloudsupport` binding). The purchase flow then accepted step 1, and
step 2 offered exactly one billing account, `My Billing Account
(01789B-AD5731-2C3C72)`, which was selected. The flow stopped at the
operator's two clicks: the *"I agree to the terms of service"* checkbox and
*"Complete purchase"* (Standard Support: the greater of $29/month or 3% of
monthly Cloud charges, monthly auto-renewing subscription). The assistant did
not tick or click either. **22:15 UTC: the operator completed the purchase**
("Thanks. Your support purchase is complete."); Support › Cases for
`nivadesk-amazon` now offers case creation (the Standard plan's flow starts
with Google's AI support agent, which collects the issue and hands off to a
human engineer as a case).

## Filed — Google Cloud support case **75151719** (2026-09-05 22:31:45 UTC)

Submitted from the console (Support › Cases › Get help, project
`nivadesk-amazon`, signed in as `contact@eggcraft.co.uk`) under the new
Standard Support plan, after Google's AI support agent was asked to hand off
to a human engineer. Form values: title "Event Threat Detection and Cloud Run
Threat Detection produce no findings for Google's documented test procedures
on a project-level Premium activation" (truncated by the 140-character limit);
category Other Google Cloud Products › Security Command Center › Configure ::
Security Command Center services; Cloud Security Command Center issue
category "Reporting false positive/negative finding"; priority **P3 – Medium
impact**; business impact "Non-Production System impaired"; issue start
2026-09-05 03:00 (UK time), ongoing; observed error message "none"; finding
category "Expected, none produced: Malware: Bad Domain; Defense Evasion:
Base64 ELF File Command Line"; language English (email); time zone GMT+01:00
United Kingdom. The "Provide more details" field carries the full text of the
sections above (summary, enablement read-back, the three ETD runs, the two
CRTD executions, the findings that do exist, expected behaviour, the three
questions). Attachments could not be added through the assistant's browser
tooling (the form's file input sits in an isolated frame); the case text says
the records are available on request — add them from the case page if Google
asks. Confirmation screen: *"Case 75151719 created. Your support case has
been created and will be reviewed shortly."*

| Event | When (UTC) | Note |
|---|---|---|
| Case created | 2026-09-05 22:31:45 | console: "Created by EGGcraft Team for nivadesk-amazon on Sep 5, 2026, 11:31:45 PM" (UK time); status New, P3 – Medium; case page `console.cloud.google.com/support/cases/detail/v2/75151719?project=nivadesk-amazon` |
| First response from Google | — | to be recorded here with the summary of the answer |

## Where to file

- With a paid support plan (Standard or above): Google Cloud console → Support → Cases →
  Create case (project `nivadesk-amazon`). Basic support accepts billing/account questions only, so
  a technical case needs at least Standard Support (a paid plan — a decision for the operator).
- Without a paid plan: the public issue tracker component for Security Command Center
  (issuetracker.google.com), with the same text minus the project internals that should not be
  public (keep the project number, drop the identities), or the Google Cloud Community forum.

- 2026-09-06 01:35 UTC check (operator's Chrome session, case page): status **New**, priority P3, no response from Google yet.

---

## Google's response — archived 2026-09-07, case 75151719

**Provenance — now first-hand.** The conclusions were first relayed by the operator; the reply itself
was afterwards read directly from the support thread in `contact@eggcraft.co.uk`, so this section is
no longer second-hand.

| Field | Value |
|---|---|
| From | Google Cloud Support `<cloudsupport@google.com>`, engineer **Murali Selvaraj** |
| Received | **2026-09-07 06:49** local (BST) |
| Thread | `Google Cloud Support 75151719: Event Threat Detection and Cloud Run Threat Detection produce no findings for Google's documented test procedures on a project` |

**Three things in the reply that the relayed summary did not carry, and that change what we do next:**

1. **Google recommended the retest we then ran.** *"Now that well over 24 hours have passed since your
   Premium trial activation, we recommend deploying a new Cloud Run job and running the exact same
   base64 command to verify the finding triggers successfully."* The third test was done at Google's
   own request, not on our initiative.
2. **CRTD writes no watcher telemetry at all.** *"CRTD does not write its own execution logs or watcher
   process status to your instance/container logs. There is no customer-visible log indicator that the
   watcher process has attached or stopped."* This **answers** the open question in
   `crtd-investigation-2026-09-05.md` about where `resource type threat_detector` logs should appear:
   nowhere. That question must not be asked again — only Google can see whether the watcher attached.
3. **The ETD mechanism, in their words.** *"When Security Command Center encounters a finding without
   project-level metadata, it automatically escalates and classifies it as an organization-level
   finding. Because your organization is currently on the Standard tier … the finding is essentially
   dropped from your project-level Premium view."*

### What Google confirmed

1. **The SCC pipeline, service agents and Pub/Sub delivery chain are confirmed healthy by Google.**
2. **`project is already onboarded` / `FAILED_PRECONDITION` has no residual effect.**
3. **CRTD supports europe-west2 and project-level Premium activation.**
4. **Google states initial CRTD watcher propagation may take up to 24 hours.**
5. **ETD Malware: Bad Domain may be promoted to organization-level when project metadata is absent,
   and may therefore not appear because the organization is Standard tier.**

### What each conclusion closes, and what it does not

- Conclusions 1 and 2 remove the two explanations the investigation had been carrying: the pipeline is
  not broken and the onboarding error is not the cause. Both records in
  `crtd-investigation-2026-09-05.md` and `etd-investigation-2026-09-05.md` had listed these as open
  possibilities; they are now closed by the vendor.
- Conclusion 3 removes the region and activation-scope hypothesis for CRTD specifically.
- **Conclusion 4 is the one that invalidated both earlier CRTD tests.** Both were run within
  10 h 18 min of enablement (02:21:20 UTC), well inside a 24-hour propagation window. Neither was a
  fair test of the detector, which is why a third test was run — see below.
- **Conclusion 5 changes what an absent ETD finding means.** If Bad Domain is promoted to the
  organisation, and the organisation is Standard tier, then no amount of testing from inside a
  Premium *project* can make that finding appear. Repeating the VM test cannot answer the question;
  only Google can say whether the promoted finding is reachable at all under this tier split.

### Status of control 3 (IDS / IPS / threat detection)

**Still In Progress. Explicitly NOT marked Passed.** Nothing above demonstrates a detector firing;
it explains why two tests were not valid and why a third class of test may never be. Passing this
control requires an observed finding, or a written statement from Google that one is unobtainable in
this configuration — neither of which exists yet.


## Our reply, sent 2026-09-07

Sent as an **inline reply on the existing support thread** to `cloudsupport@google.com` from
`contact@eggcraft.co.uk`, so it attaches to case 75151719 automatically rather than opening a second
conversation. Gmail confirmed delivery; the thread now shows the outbound message from EGGcraft Team.

Full text: `google-case-75151719-reply-sent.txt` (same directory).

**What it says, in short:**

| Part | Content |
|---|---|
| 1 | The retest Google asked for: new job `amazon-crtd-verify-0907`, execution `-sl6mf`, `europe-west2`, trigger at `2026-09-07T07:29:33.694378Z`, **53 h 12 m** after activation, twenty polls over forty minutes, **no CRTD finding of any category** — with the positive control stated so the absence cannot be read as a failed query |
| 1 | One question only, and it is one that only Google can answer: did the watcher attach to that execution, and if not, what determines attachment for a gen2 job on a project-level Premium activation |
| 2 | The ETD tier question, asked as a general rule: can a project-only Premium deployment under an organization on Standard **ever** expose the promoted finding, or does it require organization-level Premium |

**Deliberately not in it:** no secret, token or credential; no VPC, subnet, service-account or image
name; no promise of further CRTD or ETD testing; and **not** the `threat_detector` log question, which
Google had already answered — asking it again would have cost a round trip.

**Case status: awaiting Google.** Control 3 (IDS/IPS) remains **In Progress**, not Passed. The test job
`amazon-crtd-verify-0907` is left in place so Google can inspect it.

---

## Google's second response — read first-hand, 8 September 2026

| Field | Value |
|---|---|
| From | Google Cloud Support `<cloudsupport@google.com>`, engineer **Murali Selvaraj** |
| Received | **2026-09-08 05:58** local (BST) |
| Read | First-hand from the support thread in `contact@eggcraft.co.uk`, not relayed |
| Prompted by | Our reply of 7 September carrying the third CRTD test (`amazon-crtd-verify-0907`) |

### Event Threat Detection — CLOSED by Google, and closed as a tier limitation

Google's own words, quoted because the distinction matters:

> As a general rule within Security Command Center, findings are surfaced based on the tier of the
> resource they are **anchored to**. Event Threat Detection is exclusively a Premium-tier feature […]
> Because of the **known issue** where the Malware: Bad Domain finding loses its project-level
> metadata, the backend defaults to anchoring it to the **Organization** level. However, because your
> Organization is on the **Standard** tier, it lacks the entitlement to display Premium ETD findings,
> causing the finding to be **dropped entirely from your view**.
>
> Therefore, a project-only Premium deployment inside a Standard-tier organization **cannot expose this
> promoted finding**.

**The status, recorded in the terms this actually warrants:**

| | |
|---|---|
| Detector or configuration issue on our side | **Not indicated** |
| Project SCC pipeline | **Healthy** — confirmed by Google |
| Absence of the finding | **Explained**, by tier/anchoring behaviour Google confirms and calls a known issue on their side |
| Further Bad Domain testing | **Do not perform.** No test can succeed; the entitlement, not the trigger, is what withholds the finding |

**ETD is not "failed" and not "misconfigured".** It is **not observable in the current SCC tier
topology, confirmed by Google Support.** Those are different claims and only the second one is true:
nothing we built is wrong, and no change we could make inside the project would alter the outcome.
Making it observable would mean Premium at the **organisation** level — a purchasing decision, not a
remediation.

This also retires the question the first response left open. On 7 September we asked whether a
project-only Premium deployment under a Standard-tier organisation could ever expose the promoted
finding. The answer is no, in writing.

### Cloud Run Threat Detection — escalated to Google's Product Specialist team

> Because you have successfully eliminated propagation time, regional support, enablement state, and
> the delivery pipeline as variables, the absence of this finding requires a backend investigation.
>
> I have reached out to our **Product specialist team** by raising an internal request. They will
> review the backend to determine **whether the watcher attached to this Gen 2 execution** and
> investigate **why the payload did not trigger the finding**.
>
> I will keep you informed […] on or before **September 10th 2026 at 22:30 IST (GMT +5:30)**.

Committed next update: **2026-09-10 22:30 IST = 17:00 UTC**.

Four hypotheses are now eliminated **by Google's own agreement**, not merely by our testing:
propagation time, regional support, enablement state, and the delivery chain.

**Standing instructions while the escalation is open:**

- The test job **`amazon-crtd-verify-0907`** stays in place and is **not deleted** — Google may need to
  inspect it, and it is the execution their Product Specialist team has been asked about.
- **No further CRTD test is to be run** unless Google explicitly requests one. A fourth execution adds
  no information and would muddy the one they are investigating.
- No reply is owed right now. The next move is Google's.

---

## Google's third response — read first-hand, 9 September 2026

| Field | Value |
|---|---|
| From | Google Cloud Support `<cloudsupport@google.com>`, engineer **Murali Selvaraj**, relaying the **Product Specialist team** |
| Received | **2026-09-09 09:23** local (BST) — 32 hours *before* the committed update time (10 Sep 22:30 IST) |
| Read | First-hand from the support thread in `contact@eggcraft.co.uk`, in the operator's own browser session. The console case page (`support/cases/detail/v2/75151719`) did not render (JavaScript sources failed to load); the mail thread is the source |
| Prompted by | The 8 September escalation to the Product Specialist team |
| Reply owed | Yes — the mail ends "Looking for your response." The response they want is the result of the job below |

### Verbatim

> Hello,
>
> Thank you for your patience and cooperation regarding this issue. I have received an update from the Product Specialist team and stated below.
>
> Please run the below commands in GCloud.
>
> ```
> JOB_NAME="ktd-test-base64-elf-$(date -u +%Y-%m-%d-%H-%M-%S-utc)"
>
> gcloud run jobs create $JOB_NAME \
> --project $PROJECT \
> --region $REGION \
> --image marketplace.gcr.io/google/ubuntu2404:latest \
> --command sh \
> --args "-c","sleep 60; base64 -d f0VMRgIB; sleep 10" \
> --wait
> ```
>
> If you prefer to keep the crtd-test naming convention from the documentation run the below command
>
> ```
> JOB_NAME="crtd-test-base64-elf-$(date -u +%Y-%m-%d-%H-%M-%S-utc)"
>
> gcloud run jobs create $JOB_NAME \
> --project $PROJECT \
> --region $REGION \
> --image marketplace.gcr.io/google/ubuntu2404:latest \
> --command sh \
> --args "-c","sleep 660; base64 -d f0VMRgIB; sleep 10" \
> --wait
> ```
>
> I hope this above information helps you. Please reach out to me if you need any assistance further.
>
> Looking for your response.
>
> Best Regards,
> Murali Selvaraj

### What they did not say

The 8 September mail promised a backend check of **whether the watcher attached** to
`amazon-crtd-verify-0907-sl6mf`. This reply does not report that check. It replaces the
question with a fourth execution under a spec the specialists chose. Read plainly: they want a
run whose variables *they* control before they commit to a statement about the watcher.

### Their spec against our three executions

| | Our three runs (`amazon-crtd-test` ×2, `amazon-crtd-verify-0907`) | Google's requested run |
|---|---|---|
| Job name | `amazon-crtd-…` | **`ktd-test-base64-elf-<utc>`** (or `crtd-test-base64-elf-<utc>`) |
| Image | project image `…/nivadesk-amazon:be1dd111` (Debian, `node:22-slim` base) | **`marketplace.gcr.io/google/ubuntu2404:latest`** (Google's public Ubuntu 24.04) |
| Shell | `bash -c` | `sh -c` |
| Payload | `sleep 60; base64 -d f0VMRgIB; sleep 10` | identical; second variant **`sleep 660`** (11 minutes before the payload) |
| Service account | `amazon-sync@nivadesk-amazon` | unspecified → default compute SA `145308107004-compute@developer.gserviceaccount.com` (exists, enabled; `iam.automaticIamGrantsForDefaultServiceAccounts` is enforced, so it holds no project role — the payload needs none) |
| Network | direct VPC egress `amazon-vpc`/`amazon-subnet` | none |
| Execution environment | second generation (explicit) | unspecified → second generation is the default for jobs |
| `--wait` | not used; execution polled | used; the command blocks until the execution ends |

Two of these differences can plausibly matter to a runtime watcher, and both are theirs, not
ours: the **base image** (a watcher that instruments the container may not handle a slim
Debian image the way it handles Google's Ubuntu image) and the **job-name prefix** (`ktd` is
Container Threat Detection's internal name; a prefix suggests their backend locates test
executions by name). The `sleep 660` variant says, without saying it, that the watcher may take
up to ten minutes to attach to a new execution — our payload fired at +60 s in all three runs.

### The alert mails are not detector results

Four "[ALERT - No severity] a message landed on scc-findings on nivadesk-amazon" mails arrived
today (06:32, 06:54, 11:26, 17:28 BST) after several on 7–8 September. Cross-checked against the
SCC v2 API at 2026-09-09 ~19:40 BST: the project still holds exactly **two** findings —
Cloud Armor *Increasing Deny Ratio* (created 2026-09-05T05:29:30Z, `eventTime` now
**2026-09-09T16:20:00Z**) and Compliance *OS_LOGIN_DISABLED* (2026-09-05). No CRTD or ETD
category exists. The 17:28 BST alert is the 16:20Z re-evaluation of the Cloud Armor finding being
republished by the notification config; the earlier alerts are the same finding's earlier
updates (only its latest `eventTime` is retained). The alert policy fires on
`pubsub.googleapis.com/topic/send_message_operation_count` for topic `scc-findings`, i.e. on any
publish, including updates to an existing finding. **Nothing new has been detected.**

### State after this reply

| | |
|---|---|
| ETD | Unchanged — closed by Google on 8 September as a tier/anchoring limitation |
| CRTD | Open. Google has now **explicitly requested** a fourth execution under their spec |
| Standing rule "no further CRTD test unless Google explicitly requests one" | **Condition met.** The operator's separate 8 September hold ("do not run a new ETD/CRTD test") predates this request and is the operator's to lift — **the job has not been run** |
| `amazon-crtd-verify-0907` | Stays in place, not deleted |
| Control 3 (IDS/IPS) | **In Progress**, not Passed |
| Amazon Developer Profile application | **Not submitted**; this reply changes nothing in it yet |
| Effect on the Amazon application | None today. If the Google-spec run produces the finding, Control 3's CRTD half becomes "verified with Google's own procedure" and the ETD half stays "not observable in this tier topology, confirmed by Google" — whether that combination is *Passed* is the operator's decision. If it produces nothing, the case goes back to Google with the watcher question answered by their own spec, which is the strongest position we can hold |

### Prepared, not executed

Exactly their first variant, with the two placeholders resolved (region `europe-west2`, where
the project's Cloud Run resources and the three earlier executions live):

```
PROJECT=nivadesk-amazon
REGION=europe-west2
JOB_NAME="ktd-test-base64-elf-$(date -u +%Y-%m-%d-%H-%M-%S-utc)"
gcloud run jobs create $JOB_NAME \
  --project $PROJECT \
  --region $REGION \
  --image marketplace.gcr.io/google/ubuntu2404:latest \
  --command sh \
  --args "-c","sleep 60; base64 -d f0VMRgIB; sleep 10" \
  --wait
```

Run plan once the operator lifts the hold: variant 1 (`sleep 60`) first; poll the project's
findings for 40 minutes as before; only if nothing appears, variant 2 (`sleep 660`), which is
also Google-requested. Record job name, execution id, trigger timestamp and the container log
line for each. Do not deviate from their spec (no `--service-account`, no VPC, no project
image); if the default compute service account is rejected at create time, stop and record it
rather than substituting `amazon-sync@` silently — the point of this run is that the variables
are Google's.

---

## The fourth run — Google's own spec, 9 September 2026

Authorised by the operator on 9 September ("run the fourth CRTD run with Google's spec, `sleep 60`
variant first"). Everything Google's Product Specialists chose was kept: the job-name prefix, the public
Ubuntu 24.04 image, `sh -c`, the payload, the default compute service account, `--wait`.

### 4a. Their command, verbatim — refused by our own org policy

```
JOB_NAME=ktd-test-base64-elf-2026-09-09-19-30-37-utc      issued 2026-09-09T19:30:37Z
ERROR: (gcloud.run.jobs.create) FAILED_PRECONDITION: Constraint constraints/run.allowedVPCEgress
violated for attempting CreateJob with annotation "run.googleapis.com/vpc-access-egress" set to null.
```

The effective policy on `nivadesk-amazon` is `run.allowedVPCEgress: allowedValues [all-traffic]`
(`gcloud resource-manager org-policies describe … --effective`); a job with no VPC egress cannot be
created in this project at all. No job resource was left behind. The policy was not relaxed.

### 4b. The same command plus the one thing the policy forces — ran and succeeded

Added, and nothing else: `--vpc-egress all-traffic --network amazon-vpc --subnet amazon-subnet` — the
same direct-VPC egress the three earlier executions had.

| | |
|---|---|
| Job | `ktd-test-base64-elf-2026-09-09-19-31-33-utc` (created 19:31:33Z) |
| Execution | `ktd-test-base64-elf-2026-09-09-19-31-33-utc-gsvq2`, uid `cdbf4978-d960-4464-84b3-10b1f34a7fd0` |
| Image (resolved) | `marketplace.gcr.io/google/ubuntu2404@sha256:1492cf11140e5aed3cb371956fd80ebb5919296ed3f5c739c11753227c2f1d0c` |
| Command / args | `sh` / `-c`, `sleep 60; base64 -d f0VMRgIB; sleep 10` |
| Service account | `145308107004-compute@developer.gserviceaccount.com` (the default; enabled; holds no project role) |
| Start → completion | 2026-09-09T19:31:43.358Z → 19:33:07.978Z, succeeded 1 / failed 0 |
| Payload line | **19:32:54.693Z** `base64: f0VMRgIB: No such file or directory`, then `Container called exit(0).` |
| Relative to activation | 2 d 17 h 11 m after project Premium activation (2026-09-07 02:21:20Z enablement of CRTD) |

**Findings, polled through the SCC v2 API every three minutes from 19:34Z to 20:19Z (fifteen polls, HTTP
200 each): the project held exactly two findings throughout — Cloud Armor *Increasing Deny Ratio* and
Compliance *OS_LOGIN_DISABLED* — and no finding of any threat, execution, ELF, base64 or container
category appeared.** The 40-minute window Google's earlier answers used ("detection latency of minutes")
closed at 20:13Z with nothing.

So the fourth execution reproduces the first three under the variables Google chose: their image, their
name, their shell, the default service account. The one difference between their spec and what ran is
VPC egress, which our policy makes unconditional and which the three earlier runs also had.

### 4c. Their second variant (`sleep 660`) — run next, same addition

Started 20:16Z as `crtd-test-base64-elf-<utc>`; the eleven-minute wait before the payload is the point of
the variant. Recorded below when it completes.
