# Cloud Run Threat Detection — fifth test, the specialist's corrected command (10 September 2026)

Case 75151719. Google's Product Specialist replied on 10 September asking for the `sleep 660` variant again with the
task timeout and retries set explicitly, keeping the VPC settings. Run **once**, on the operator's instruction, with
nothing else changed: no IAM, no policy, no other job touched, no second attempt.

## 1. Environment, read live before the run

| | |
|---|---|
| Project | `nivadesk-amazon` (145308107004), ACTIVE |
| Region | `europe-west2` |
| Network / subnet | `amazon-vpc` / `amazon-subnet` (10.60.0.0/24) — the only network in the project |
| Effective org policy | `run.allowedVPCEgress`: allowedValues `[all-traffic]` (a job without VPC egress cannot be created here — the 9 Sep refusal) |
| Existing jobs (untouched) | `amazon-bridge-test`, `amazon-diag`, `amazon-crtd-verify-0907`, `ktd-test-base64-elf-2026-09-09-19-31-33-utc`, `crtd-test-base64-elf-2026-09-09-20-16-16-utc` |
| APIs | `run`, `logging`, `securitycenter`, `securitycentermanagement` enabled |

## 2. The command, as the specialist asked

Google's `crtd-test` command from the 7 Sep e-mail (image, `sh -c`, command string, job-name prefix), plus what the 10 Sep e-mail
made explicit, plus the three VPC flags the project's own policy forces (identical to the 9 Sep runs):

```bash
JOB_NAME="crtd-test-base64-elf-$(date -u +%Y-%m-%d-%H-%M-%S-utc)"
gcloud run jobs create "$JOB_NAME" --project nivadesk-amazon --region europe-west2 \
  --image marketplace.gcr.io/google/ubuntu2404:latest \
  --command sh \
  --args "-c","sleep 660; base64 -d f0VMRgIB; sleep 10" \
  --vpc-egress all-traffic --network amazon-vpc --subnet amazon-subnet \
  --task-timeout 900s --max-retries 0
gcloud run jobs execute "$JOB_NAME" --project nivadesk-amazon --region europe-west2     # once, separately, no --wait
```

Creation and execution were separated: `jobs create` started nothing (`latestCreatedExecution` empty on read-back), then
one `jobs execute`.

## 3. Identities and effective settings (read back, not assumed)

| | |
|---|---|
| Job | `crtd-test-base64-elf-2026-09-10-09-28-57-utc`, created 2026-09-10T09:28:57Z |
| Execution | `crtd-test-base64-elf-2026-09-10-09-28-57-utc-8fmzk`, uid `4e3f6d1e-0f7c-4181-9baf-79f61c66a3ec` |
| Execute issued / created / started | 09:29:34Z / 09:29:35.770806Z / **09:29:38.979057Z** |
| Execution reached the base64 command (container log) | **2026-09-10T09:40:44.030644Z** — the log recorded `base64: f0VMRgIB: No such file or directory` (665 s after start; no "maximum timeout" line). That is the whole observation: no successful decode and no file execution is claimed; `f0VMRgIB` is not a file in the image |
| Container exit / completion | `Container called exit(0).` 09:40:54.061416Z; execution completed **09:40:57.318314Z**, succeeded 1 / failed 0 — the base64 line was logged 235 s before the 900 s limit |
| Image (resolved digest) | `marketplace.gcr.io/google/ubuntu2404@sha256:1492cf11140e5aed3cb371956fd80ebb5919296ed3f5c739c11753227c2f1d0c` (the same digest as the 9 Sep runs) |
| Command / args | `sh` / `-c`, `sleep 660; base64 -d f0VMRgIB; sleep 10` |
| Effective task timeout / max retries | **900 s / 0** (read from the execution spec; the 9 Sep `sleep 660` run had the 600 s / 3 defaults and never reached the base64 command) |
| Service account | `145308107004-compute@developer.gserviceaccount.com` (default; unchanged) |
| Execution environment | gen2 |
| VPC | direct VPC egress `all-traffic`, `amazon-vpc` / `amazon-subnet` |

## 4. Observation method

A background monitor (`monitor.sh`, PID 92397, started 09:29Z) polls the execution every minute until it completes, reads
the job's container log for the expected base64 error line `base64: f0VMRgIB: No such file or directory` (and any "maximum timeout"
line), then reads the project's findings through `GET https://securitycenter.googleapis.com/v2/projects/145308107004/sources/-/findings`
every five minutes for forty minutes, writing each response to disk and a summary line to `monitor.log`. No token or
credential is written anywhere.

**Correction at 09:43Z:** the monitor's first findings poll (09:42:01Z) was not a valid read — the API answered
HTTP 403 "requires a quota project" for the local user credentials (raw response kept as `findings-1.json`; it names no
findings at all, not even the two pre-existing ones). The poller was replaced by one that sends the
`x-goog-user-project: nivadesk-amazon` header (a request header, not an IAM or policy change); a direct call with that
header answered HTTP 200 with the two pre-existing findings (*Increasing Deny Ratio*, *OS_LOGIN_DISABLED*), the same
two every earlier run saw. Valid polls ran from 09:43:28Z to 10:23:50Z (the last poll fires once the 10:22Z window end has passed); nothing about the job or its
execution changed. The gap 09:40:44–09:43 is covered by the later polls, since a finding created in it would still be
listed.

## 5. Result — no finding; detection not confirmed

| | |
|---|---|
| Execution | completed 09:40:57.318Z, succeeded 1 / failed 0, retried 0 — the task ran to its own end; nothing was cut off |
| base64 command | reached at **09:40:44.030644Z** (665 s after start, 235 s before the 900 s limit); the log recorded `base64: f0VMRgIB: No such file or directory`. No successful decode, no file executed |
| Findings polls | **9 valid polls, HTTP 200 each**, 09:43:28Z → 10:23:50Z (every ~5 min): every poll returned the same two pre-existing findings — *Increasing Deny Ratio* (Cloud Armor, eventTime 06:35Z today, the load balancer backend) and *OS_LOGIN_DISABLED* (5 Sep) — and **no finding with an eventTime at or after the execution, none in any threat / execution / ELF / base64 / container category** (`crtd-2026-09-10-raw/findings-2.json` … `findings-10.json`, byte-identical) |
| `resource.type="threat_detector"` log entries since 09:29Z | none |
| Observation after the base64 line | 43 minutes (09:40:44Z → 10:23:50Z), longer than the 40-minute window used on 7 and 9 September |

**Reading.** This is the first `sleep 660` run in which the execution reached the base64 command inside the task's
lifetime: the previous 600-second task-timeout obstacle was removed, and this execution completed within the configured
900-second timeout. Still no Cloud Run Threat Detection finding was created. The two unrelated findings on every poll show
the query reached Security Command Center and read this project correctly. Recorded as **"detection not confirmed"** —
not as "the detector works", and not as "the detector is broken": a job that finishes is not evidence of detection, and
three things cannot be seen from this side and are put to Google in the reply draft — whether the detector's watcher
attached to this execution, whether the logged base64 error is the behaviour the test expects, and whether another timing
condition applies. No finding can be tied to execution `…-8fmzk`.

**Raw records:** `crtd-2026-09-10-raw/` (20 files, SHA-256 in its `MANIFEST.md`): gcloud outputs, both execution
read-backs, the container log, both scripts, the observation log and all ten findings responses.

**What was not done, by instruction:** no second attempt, no timeout change, no automatic re-run, no IAM or policy
change, no change to the earlier jobs; the OpenAI review surface and every production function untouched.

**Control 3 (IDS / IPS / threat detection):** still not closable on CRTD evidence. Five executions of Google's documented
test across three configurations (default and explicit timeouts, `sleep 60` and `sleep 660`, 5 Sep → 10 Sep) produced
no finding; ETD *Malware: Bad Domain* was closed by Google as a tier limitation on 8 Sep. Recommendation: keep the
control open (the reply is sent, §6) and record the control as "not obtainable in this configuration" only if Google says
so in writing.

## 6. Status

**Sent to Google.** The operator sent the reply from the existing e-mail thread of case 75151719 on 10 September (the
draft in `google-case-75151719-reply-draft-2026-09-10.md` was its basis): the last attempt's times, the base64 error
line, no new finding across nine reads, and the two questions. **Awaiting the Product Specialist's reply.** Control 3
stays open; no further message and no new test until Google answers.
