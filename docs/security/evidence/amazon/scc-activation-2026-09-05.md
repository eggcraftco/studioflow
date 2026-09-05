# Security Command Center — activation record, 2026-09-05

| | |
|---|---|
| Organisation `eggcraft.co.uk` | **Standard** tier activated in the console (organisation selector → Get Standard → Activate), free of charge. Needed `roles/securitycenter.admin` on the organisation for the operator (granted by the operator for this, listed for later reduction). |
| Project `nivadesk-amazon` | **Premium** tier: Settings → Setup details → Manage project tier → Premium 30-day free trial → Update. Console readback: *Tier: Security Command Center Premium — Billing status: Trial ending on Oct 5, 2026*; after the trial the project moves to Premium pay-as-you-go by itself (usage-based; the console: "Pricing will be based on the usage of certain Google Cloud services and you can cancel at any time"). |
| Detectors (project, effective) | Event Threat Detection ENABLED; Cloud Run Threat Detection ENABLED (switched on with `gcloud scc manage services update cloud-run-threat-detection`; every service already runs the second-generation execution environment); Web Security Scanner, Container Threat Detection, VM Threat Detection, Artifact Analysis, External Exposure ENABLED (`scc-services.txt`). |
| Finding delivery | Notification config `amazon-findings` (API v2, `locations/global`), filter `state = "ACTIVE"`, → Pub/Sub topic `scc-findings`; the SCC notification agent holds `securitycenter.notificationServiceAgent` on the topic; pull subscription `scc-findings-evidence` keeps 7 days for the pack; Cloud Monitoring alert "Amazon zone: SCC finding published" → email channel `amazon-security-email` (`scc-alerting.txt`). |
| Security Health Analytics | Not enablable — by Google's design, not a fault: *"Security Health Analytics is disabled for new activations of Security Command Center on the Standard-legacy, Premium, and Enterprise tiers. For these organizations, use Compliance Manager to scan your environment for misconfigurations."* and, for organisations upgraded from Standard, *"You cannot enable Premium or Enterprise tier Security Health Analytics detectors. You must use the Compliance Manager frameworks available with Premium and Enterprise tiers to configure detections."* ([SHA overview](https://docs.cloud.google.com/security-command-center/docs/concepts-security-health-analytics)). The `FAILED_PRECONDITION` seen from the API and the console is that rule. **Compliance Manager is Enabled** on the project (`scc-services.txt`: Compliance Manager / the Security Essentials framework, into which Google maps the SHA detectors). Misconfiguration posture is handled there, as a separate posture-remediation item; it is not part of the IDS/IPS control. |

## What went wrong on the way, and the fix

1. The project-level "Start a Premium free trial" flow refused to start:
   `SecurityCenterManagement.GenerateServiceAccounts` answered
   `FAILED_PRECONDITION: project 145308107004 is already onboarded` — the
   `securitycenter` API had been enabled by hand (scc.sh) before the console
   flow, which left the backend counting the project as onboarded while the
   console still required its own onboarding call. Disabling the APIs did not
   clear it. Resolution: activate Standard at the organisation (free), which
   makes every project "already active", then change this project's tier.
2. The tier change then reported *Members belonging to the external domain
   cannot be added as domain restricted sharing is enforced*: the
   organisation enforces `iam.allowedPolicyMemberDomains`, so the console
   could not grant Google's service agents their roles on the project (audit
   log: `SetIamPolicy … One or more users named in the policy do not belong
   to a permitted customer`). Resolution, per Google's documented remedy and
   confined to this project: `infra/amazon/scc-agents.sh` set a project-level
   override (`allowAll`), waited for it to be enforced (≈95 s), bound the four
   agents — `securitycenter.serviceAgent → service-project-145308107004@security-center-api`,
   `containerthreatdetection.serviceAgent`, `cloudsecuritycompliance.serviceAgent`,
   `dspm.serviceAgent` — and deleted the override, reading back that the
   organisation value (`C01ygiscq`) was in force again before exiting
   (`scc-agents.txt` re-checks both on every pack).

Lesson recorded in `scc.sh`: never enable the Security Command Center API by
hand ahead of the console activation.

## Delivery chain — synthetic check, 2026-09-05 04:05 UTC

With no Security Command Center finding yet to carry, the part of the chain
that is ours was exercised once with a synthetic message published to the
`scc-findings` topic (`{"test":"delivery-chain-check", "finding":{"category":
"TEST: delivery chain check (synthetic, not a Security Command Center
finding)"}}`, messageId 21472771944709115):

- the evidence subscription `scc-findings-evidence` received and retains it
  (pulled without acknowledgement, category shown above);
- the Cloud Monitoring alert "Amazon zone: SCC finding published" watches the
  topic's publish count and emails `amazon-security-email`
  (contact@eggcraft.co.uk) — the email is the last link and lands in the
  operator's inbox; the incident closes on its own once the count returns to
  zero, so a later real finding raises a fresh alert.

This proves Pub/Sub → subscription → alert → email. It does not prove that
Security Command Center publishes into the topic; that needs a real finding
(the notification config and the notification agent's role on the topic are
read live in `scc-notification.json`).

## Why the two detection tests showed nothing on 5 September — what Google documents

- Cloud Run Threat Detection: *"activation … up to 3.5 hours for newly
  onboarded projects or organizations"*, then *"detection latency of minutes"*
  ([when to expect findings](https://docs.cloud.google.com/security-command-center/docs/concepts-scan-latency-overview)).
  The detector was switched on at 02:21 UTC and the documented test job ran
  at 03:01 UTC — inside that window. A job's process activity is observed at
  execution time, so the 03:01 execution cannot be detected retroactively:
  the official test has to run **once more after ~05:50 UTC** (a morning
  decision, not done overnight).
- Event Threat Detection: *"activation occurs within seconds"*, *"detection
  latencies are generally less than 15 minutes from the time a log is
  written"*. The VM procedure's DNS queries were logged at 03:13–03:14 UTC
  under the VM's name; no finding by 04:20 UTC. That is not latency.
  "Malware: Bad Domain" is not among the rules Google lists as
  organisation-only ([project-level limitations](https://docs.cloud.google.com/security-command-center/docs/activate-scc-project-level-limitations)),
  and the module `MALWARE_BAD_DOMAIN` reads effective ENABLED. The remaining
  hypothesis is the project's Logging routing: the `_Default` sink is
  disabled by design (every log goes to the regional `amazon-audit` bucket
  instead), and Google does not document whether Event Threat Detection reads
  the log stream before or after that sink. Testing it means re-enabling the
  `_Default` sink temporarily (regional bucket, 30-day retention, no security
  relaxation) and running the VM procedure once — a morning decision.
