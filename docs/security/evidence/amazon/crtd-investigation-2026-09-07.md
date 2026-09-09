# Cloud Run Threat Detection — third test, run after Google's 24-hour propagation answer

The two tests on 5 September were both run inside the propagation window Google later described, so
neither was a fair test of the detector. This is the one test that was not.

**One test only.** The operator's instruction was explicit: do not repeat it if no finding appears.
It was run once and is not being re-run.

## Why this test is different from the two before it

| | Test 1 (5 Sep) | Test 2 (5 Sep) | **Test 3 (7 Sep)** |
|---|---|---|---|
| Job | `amazon-crtd-test-895jz` | `amazon-crtd-test-cf7xf` | **`amazon-crtd-verify-0907-sl6mf`** |
| Elapsed since CRTD enablement | +40 min | +10 h 18 min | **+53 h 12 min** |
| Inside Google's stated 24 h propagation window? | yes | yes | **no — comfortably past it** |
| Job created before or after enablement | after | after | **after; brand-new job, created for this test** |
| Finding | none | none | **none** |

Google's own answer on case 75151719 is what invalidates the first two: *initial CRTD watcher
propagation may take up to 24 hours*. Both earlier executions fall inside that window. This one does
not, which is the whole point of running it.

## Configuration, read live before the test

```
project            nivadesk-amazon (145308107004), region europe-west2
CRTD effective     ENABLED, updateTime 2026-09-05T02:17:51Z   (securitycentermanagement v1)
module             BASE64_ELF_FILE_CMDLINE -> effective ENABLED  (55 modules present)
```

Read with `GET https://securitycentermanagement.googleapis.com/v1/projects/nivadesk-amazon/locations/global/securityCenterServices/container-threat-detection`,
names and states only.

## The job, and Google's documented test used exactly

Brand-new job, created for this test — the 5 September job had been deleted, so nothing was reused:

```
name                 amazon-crtd-verify-0907
created              2026-09-07T07:28:08.601104Z
image                europe-west2-docker.pkg.dev/nivadesk-amazon/amazon/nivadesk-amazon:be1dd111
service account      amazon-sync@nivadesk-amazon.iam.gserviceaccount.com
execution env        gen2
network              amazon-vpc / amazon-subnet, vpc-egress all-traffic
command              bash -c "sleep 60; base64 -d f0VMRgIB; sleep 10"
```

The VPC settings are not decoration: `constraints/run.allowedVPCEgress` refused the first create
attempt outright, so the job was created with the same network shape the project's existing jobs use.

**Production Amazon services were not modified.** `amazon-sync`, `amazon-oauth` and `amazon-admin`
were untouched; this is a separate job that merely runs as the same identity, exactly as the two
earlier tests did, so the three are comparable.

| Event | UTC |
|---|---|
| Job created | **2026-09-07T07:28:08.601104Z** |
| Execution `amazon-crtd-verify-0907-sl6mf` started | **2026-09-07T07:28:27.355698Z** |
| **Trigger command executed** — container log `base64: f0VMRgIB: No such file or directory` | **2026-09-07T07:29:33.694378Z** |
| Execution completed, succeeded | **2026-09-07T07:29:45.674080Z** |

That log line is the expected outcome of Google's command: the argument is the trigger, not a file.

## The result: no finding

Polled every two minutes for **forty minutes**, 07:30:26Z → 08:10:52Z, twenty polls, all sources:

```
GET https://securitycenter.googleapis.com/v2/projects/145308107004/sources/-/findings
```

Every poll: **2 active findings, 0 of them Cloud Run Threat Detection.**

```
2026-09-07T07:07:30 | Increasing Deny Ratio | ACTIVE
2026-09-05T11:39:18 | OS_LOGIN_DISABLED    | ACTIVE
```

**The absence is real, not a broken query.** The same call returns two unrelated findings on every
poll, so it is reaching Security Command Center and reading this project. An empty CRTD result from a
query that returns nothing at all would prove nothing; this one is positive-controlled.

## What this does and does not establish

- It **does** remove propagation as the explanation. 53 hours is more than double the window Google
  named, on a job created after enablement, with the documented command, in a supported region, on a
  project-level Premium activation Google has confirmed is supported.
- It **does not** mark control 3 as passed. No detector has fired. Control 3 stays **In Progress**.
- The test job `amazon-crtd-verify-0907` was left in place rather than deleted, so Google can inspect
  it if the case needs it. Deleting it is a one-line follow-up once the case closes.
