# Reply to Google Cloud support case 75151719 — ready to paste, NOT sent

**Status: not posted.** The case detail page renders inside a **cross-origin iframe**
(992x770, `sameOrigin: false`), so the reply box cannot be reached by automation: the outer
document has no scroll (`scrollHeight == clientHeight == 823`), no textarea and no reply button —
everything lives inside the isolated frame. This is the same isolation already recorded on this case
when file attachment failed at creation, not a new problem.

Paste the text below into the case's reply box at
`console.cloud.google.com/support/cases/detail/v2/75151719?project=nivadesk-amazon`.
The case currently shows **"Needs your follow up"**.

---

```
Thank you for the analysis. It resolved several of our hypotheses, and we have now run the one test your answer told us was missing.

PART 1 — CRTD retest, run outside the 24-hour propagation window

Your note that initial CRTD watcher propagation may take up to 24 hours invalidated both of our earlier tests: they ran +40 minutes and +10 hours 18 minutes after enablement. We therefore ran a third test, once, on a brand-new job.

  Project              nivadesk-amazon (145308107004)
  Region               europe-west2
  CRTD effective       ENABLED, updateTime 2026-09-05T02:17:51Z
  Module               BASE64_ELF_FILE_CMDLINE, effective ENABLED
  Job name             amazon-crtd-verify-0907   (created for this test; the earlier job was deleted)
  Job created          2026-09-07T07:28:08.601104Z
  Execution ID         amazon-crtd-verify-0907-sl6mf
  Execution started    2026-09-07T07:28:27.355698Z
  Trigger executed     2026-09-07T07:29:33.694378Z
  Execution completed  2026-09-07T07:29:45.674080Z  (succeeded)
  Elapsed since CRTD enablement: 53 hours 12 minutes

Command, exactly as documented:
  bash -c "sleep 60; base64 -d f0VMRgIB; sleep 10"

Container log line confirming the trigger ran:
  2026-09-07T07:29:33.694378Z  base64: f0VMRgIB: No such file or directory

Execution environment gen2; network amazon-vpc / amazon-subnet with vpc-egress all-traffic (the project's org policy constraints/run.allowedVPCEgress requires this shape).

RESULT: no Cloud Run Threat Detection finding of any category.

We polled every two minutes for forty minutes, from 2026-09-07T07:30:26Z to 08:10:52Z, twenty polls, via:
  GET https://securitycenter.googleapis.com/v2/projects/145308107004/sources/-/findings

Every poll returned the same two findings and no CRTD finding:
  2026-09-07T07:07:30  Increasing Deny Ratio  ACTIVE
  2026-09-05T11:39:18  OS_LOGIN_DISABLED      ACTIVE

We want to be clear that this is a real absence rather than a failed query: the same call returns those two unrelated findings on every poll, so it is reaching SCC and reading this project correctly.

With propagation, region support, project-level Premium activation, the onboarding FAILED_PRECONDITION, and the delivery chain all now excluded, we have no remaining hypothesis. Could you tell us what else determines whether the CRTD watcher attaches to a Cloud Run job execution in this configuration, and where the detector's own telemetry (resource type threat_detector) should be visible so we can confirm the watcher attached at all? No log entries of that resource type exist in this project's log bucket.

PART 2 — ETD Malware: Bad Domain, a question rather than another test

You noted that Bad Domain may be promoted to organization level when project metadata is absent, and may therefore not surface because our organization is on the Standard tier.

Rather than generate further Bad Domain test traffic, we would like that point confirmed directly, because it determines whether any test we run could ever succeed:

  Can a project-only Premium deployment, inside an organization whose SCC tier is Standard, ever expose this promoted finding?

  Or does surfacing it require Premium at the organization level?

If organization-level Premium is required, please say so plainly and we will stop testing this detector and record it as unobtainable in our current configuration. That is a legitimate answer for us; what we cannot do is keep generating malicious-domain lookups against a detector that is structurally unable to report.

For context on why this matters to us: both detectors are evidence for an IDS/IPS control in a compliance review. We are not treating the control as passed, and we would rather record "not obtainable in this configuration, per Google" than leave it open indefinitely.
```
