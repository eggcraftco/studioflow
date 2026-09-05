# Security Command Center — activation record, 2026-09-05

| | |
|---|---|
| Organisation `eggcraft.co.uk` | **Standard** tier activated in the console (organisation selector → Get Standard → Activate), free of charge. Needed `roles/securitycenter.admin` on the organisation for the operator (granted by the operator for this, listed for later reduction). |
| Project `nivadesk-amazon` | **Premium** tier: Settings → Setup details → Manage project tier → Premium 30-day free trial → Update. Console readback: *Tier: Security Command Center Premium — Billing status: Trial ending on Oct 5, 2026*; after the trial the project moves to Premium pay-as-you-go by itself (usage-based; the console: "Pricing will be based on the usage of certain Google Cloud services and you can cancel at any time"). |
| Detectors (project, effective) | Event Threat Detection ENABLED; Cloud Run Threat Detection ENABLED (switched on with `gcloud scc manage services update cloud-run-threat-detection`; every service already runs the second-generation execution environment); Web Security Scanner, Container Threat Detection, VM Threat Detection, Artifact Analysis, External Exposure ENABLED (`scc-services.txt`). |
| Finding delivery | Notification config `amazon-findings` (API v2, `locations/global`), filter `state = "ACTIVE"`, → Pub/Sub topic `scc-findings`; the SCC notification agent holds `securitycenter.notificationServiceAgent` on the topic; pull subscription `scc-findings-evidence` keeps 7 days for the pack; Cloud Monitoring alert "Amazon zone: SCC finding published" → email channel `amazon-security-email` (`scc-alerting.txt`). |
| Open | Security Health Analytics: enabling it at project level fails with `FAILED_PRECONDITION` from both the API and the console ("Something went wrong"); it stays Disabled (Inherited from the organisation's Standard tier). Not one of the three controls this activation was for (ETD, CRTD, delivery); to be raised with Google if needed. |

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
