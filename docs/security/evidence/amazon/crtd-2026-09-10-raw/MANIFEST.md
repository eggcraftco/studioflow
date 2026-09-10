# Raw observation records — CRTD test of 10 September 2026 (case 75151719)

The unprocessed files behind `../crtd-investigation-2026-09-10.md`, copied verbatim from the session's scratch
directory after the observation window closed (10:23:50Z). Nothing was edited; the two empty `*.nohup` files were not
copied. Total 96,659 bytes (20 files), small enough to live here in the repository — no external archive.

Checked before copying: no access token, password, key or credential in any file (the two scripts contain the *command*
`gcloud auth print-access-token`, never its output); no customer data. The two execution records carry the operator's
own account address in Cloud Run's `creator` / `lastModifier` annotations, as other files in this folder already do.

Polls 2–10 are byte-identical (same hash): the findings list did not change during the window. Poll 1 is kept because
it is the invalid read the investigation's correction note refers to.

| File | Bytes | SHA-256 | What it is |
|---|---:|---|---|
| `job.txt` | 305 | `8b567ed87d63db40ce80de3d8aa19620bdd4b8f5cb3aba0050e417bd399b6bdd` | operator-side timeline: job name, create/execute issue times, execution name, monitor PIDs, poller restart |
| `create.log` | 321 | `9acda1d56563d3aa353152ca3ee9a8ef9920d6880d438f2b4d7b42da6b0b749a` | `gcloud run jobs create` stdout/stderr (09:28:57Z) |
| `execute.err` | 461 | `0ee84f38d2928ad5598a1157bf7dae5b4d12e87c06d593496335e1b5ad00bff0` | `gcloud run jobs execute` stderr (09:29:34Z) — the execution name and console link |
| `describe-before-execute.txt` | 465 | `7bf9282e9d2f9887efb069ada29514f4080d60684f3fb590fe0dadf5ce8c8b1a` | job read-back between create and execute (image, command, args, timeout 900, retries 0, SA, VPC annotations) |
| `execution-at-start.json` | 4,141 | `265fc54abc63ef8b098a7043dd39635df6b48919e231fde81f96ca9925b43255` | `executions describe` right after execute (spec + status at 09:29Z) |
| `execution-final.json` | 3,910 | `f45fadccdfd5958651298e864d1e7f4e50c7f3b7e4070d5a8d8ad3798785e98d` | `executions describe` after completion (09:40:57Z, succeeded 1) |
| `container.log` | 166 | `f065a3a66f0f9918baf31bc56d3587f6363e96c91da24600a0b0fc4aec334782` | the job's three container log lines, incl. the base64 line at 09:40:44.030644Z |
| `monitor.sh` | 2,563 | `e2cef1be45d79a995c2e2dfab3b2122d23bccf12b0c1e6d9da1c07b2eda6a212` | the first monitor (PID 92397): execution poll, container-log read, findings poll — its findings poll lacked the quota-project header |
| `poll2.sh` | 1,675 | `849c94056bf55367a8455f8882696601587f0a6b5e50a33225c5161c57c0920e` | the corrected findings poller (PID 93907) with `x-goog-user-project: nivadesk-amazon` |
| `monitor.log` | 3,344 | `2e5ed3db247d19484d93c5d5f79d476fd829a43c5a1aefbcd901cd242cd89271` | one line per observation from both scripts, 09:29:46Z → 10:23:50Z |
| `findings-1.json` | 1,125 | `31b6108f1bf4e0f75c44619c32fe19d1fb1d2ff1620dcfa9a496318bcfc23939` | poll 1 (09:42:01Z) — INVALID: HTTP 403 "requires a quota project"; lists nothing |
| `findings-2.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 2 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-3.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 3 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-4.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 4 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-5.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 5 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-6.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 6 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-7.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 7 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-8.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 8 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-9.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 9 — valid HTTP 200 body of the SCC v2 findings list |
| `findings-10.json` | 8,687 | `d44ce0bc758e68b616ad4c5ab2699c9e8dbdcd3abef685f85441048291e568ff` | poll 10 — valid HTTP 200 body of the SCC v2 findings list |
