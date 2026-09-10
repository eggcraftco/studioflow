# Case 75151719 — reply draft, 10 September 2026 (NOT SENT)

Filled from `crtd-investigation-2026-09-10.md` §5. Sent only on the operator's word.

---

Hello Murali,

Thank you for the corrected command. We ran it once, exactly as you specified, on a new job:

  Project              nivadesk-amazon (145308107004)
  Region               europe-west2
  Job                  crtd-test-base64-elf-2026-09-10-09-28-57-utc  (new; the earlier jobs are untouched)
  Execution            crtd-test-base64-elf-2026-09-10-09-28-57-utc-8fmzk  (uid 4e3f6d1e-0f7c-4181-9baf-79f61c66a3ec)
  Image                marketplace.gcr.io/google/ubuntu2404@sha256:1492cf11140e5aed3cb371956fd80ebb5919296ed3f5c739c11753227c2f1d0c
  Command              sh -c "sleep 660; base64 -d f0VMRgIB; sleep 10"
  Task timeout         900s (explicit)      Max retries  0 (explicit)
  VPC                  direct VPC egress all-traffic, network amazon-vpc, subnet amazon-subnet (as before; required by our org policy)
  Service account      145308107004-compute@developer.gserviceaccount.com (default)
  Execution started    2026-09-10T09:29:38.979057Z
  Payload executed     2026-09-10T09:40:44.030644Z   (container log: "base64: f0VMRgIB: No such file or directory")
  Execution completed  2026-09-10T09:40:57.318314Z (succeeded 1 / failed 0 / retried 0)

RESULT: no Cloud Run Threat Detection finding of any category appeared. We read the project's findings through
GET https://securitycenter.googleapis.com/v2/projects/145308107004/sources/-/findings every five minutes from
2026-09-10T09:43:28Z to 10:23:50Z (9 polls, HTTP 200 each). Each poll returned the same pre-existing, unrelated findings
(Cloud Armor "Increasing Deny Ratio" and "OS_LOGIN_DISABLED") and nothing in a threat, execution, ELF, base64 or container category. The payload demonstrably ran
inside the task's lifetime this time (log line above, 13 s before the task ended, 235 s inside the 900 s timeout),
so the timing objection to the previous attempt no longer applies.
Could you check from the backend whether the CRTD watcher attached to execution
crtd-test-base64-elf-2026-09-10-09-28-57-utc-8fmzk (uid above) at 2026-09-10T09:40:44Z, and if it did not, what
determines attachment for a second-generation Cloud Run job under a project-level Premium activation?

The job, its execution and its logs remain in place for your inspection; we have not deleted or re-run anything.

Best regards,
EGGcraft Team
