# ClamAV scanner service

A scanning service for NivaDesk uploads. It is called by the Cloud Storage
finalize trigger in `functions/malwareScanTrigger.js`, which has already taken
the file's download token away before it gets here.

## Why it is scaled to zero

ClamAV loads a signature database on boot, which takes the better part of a
minute, so the first request after an idle period is slow. That is acceptable
here in a way it would not be in a request path: the file is unreachable while
we wait, because its token is held. Latency costs patience, not safety.

Keeping an instance warm would cost roughly $75 a month for uploads that arrive
a few times a day. Scaled to zero, with the trigger retrying through the cold
start, it costs pennies.

## What it must never do

- **Never answer "clean" because it could not reach clamd.** An unreachable
  scanner is a 503, and the caller holds the file.
- **Never answer before the signature database is loaded.** `/healthz` returns
  503 until clamd replies to a PING, so Cloud Run keeps traffic away from a
  scanner that would find nothing. A scanner with an empty database calls
  everything clean, which is the worst failure available here.

## Deploying (staging first)

Two settings here are the difference between a control and a decoration, so the
service is defined in `service.yaml` rather than assembled from flags, and
deployed in two steps.

**1. Build the image**

```bash
gcloud builds submit services/clamav-scanner \
  --tag europe-west2-docker.pkg.dev/<project>/cloud-run-source-deploy/clamav-scanner:v1 \
  --project <project>
```

**2. Deploy the service from the spec**

```bash
sed 's|IMAGE_PLACEHOLDER|europe-west2-docker.pkg.dev/<project>/cloud-run-source-deploy/clamav-scanner:v1|' \
  services/clamav-scanner/service.yaml > /tmp/clamav-service.yaml

gcloud run services replace /tmp/clamav-service.yaml \
  --region europe-west2 --project <project>
```

`service.yaml` carries the setting that matters most: an **HTTP startup probe on
`/healthz`**, not Cloud Run's default TCP probe. The default succeeds the moment
this server binds its port — which happens long before clamd has loaded its
signatures. An instance marked ready at that moment would scan with an empty
database, find nothing, and call every file clean. The HTTP probe returns 503
until clamd answers a PING, and `failureThreshold: 30` at `periodSeconds: 10`
gives the database five minutes to load.

**3. Keep it private, and grant the invoker role narrowly**

```bash
# No public access. Ever. This service accepts arbitrary bytes.
gcloud run services remove-iam-policy-binding clamav-scanner \
  --region europe-west2 --member=allUsers --role=roles/run.invoker \
  --project <project> 2>/dev/null || true

# Only the identity that runs the scan trigger, and only on THIS service.
gcloud run services add-iam-policy-binding clamav-scanner \
  --region europe-west2 \
  --member="serviceAccount:<functions service account>" \
  --role=roles/run.invoker \
  --project <project>
```

The binding is on the service, not the project: `roles/run.invoker` at project
level would let that identity invoke every Cloud Run service there is.

**4. Confirm it is not open**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST <service url> --data-binary 'x'
# 401 or 403. Anything else means the previous step did not take.
```

## Verifying before enabling anything

```bash
SCANNER_URL=<the Cloud Run URL> ./staging-check.sh
```

It checks four things against the bytes route, and the fourth is the one that gets skipped: a clean file
comes back clean, EICAR comes back infected, an oversized file comes back
`too_large` rather than clean, and an unreachable scanner does not produce a
pass. The EICAR string is assembled at runtime so this repository never contains
it — checking it in would have every scanner on every developer machine
quarantine the checkout.

## Scanning is by reference, so the cap is the rules' cap

The trigger does not send bytes. It POSTs `{bucket, name, generation}` to
`/scan`, and the scanner fetches the object from Cloud Storage itself — with
the runtime service account's own credentials (it already holds
`storage.objectAdmin` on the bucket) — and streams it into clamd. Nothing
about the file's size passes through a Cloud Run request body, so the old
32 MiB ceiling is gone, and nothing passes through the function's memory, so
the function runs in 512 MiB whatever the file weighs.

That is why the cap is **210 MiB**: the largest upload `storage.rules`
accepts. A file the rules allow but the scanner refuses is a held file for
ever, and holding every large upload is an outage, not a control. Four places
have to agree, and `functions/test/qa/malware-scan-trigger.test.js` pins all
four:

- `maxScanBytes` in `functions/malwareScanTrigger.js` (checked before the
  scanner is called; must be ≥ the rules' largest size)
- `MAX_SCAN_BYTES` in `service.yaml` and the fallback in `server.js`
- clamd's own `StreamMaxLength` / `MaxFileSize` in the Dockerfile, which sit
  *above* the cap so clamd is never the one refusing a permitted file

The scanner counts inflated bytes as they stream — Cloud Storage decompresses
a gzip-encoded object on the way out — so a small object that inflates past
the cap is `too_large`, not an out-of-memory kill.

`POST /` with raw bytes still works and is what `staging-check.sh` uses to
prove the scanner without a bucket. `/scan` answers `gone` for a generation
that no longer exists, `too_large` past the cap, and never logs the object's
name: a customer's filename is usually the name of a person.

Capacity: `containerConcurrency` × `maxScale` in `service.yaml` is the most
scans in flight; the trigger's `concurrency` × `maxInstances` must not exceed
it (the test checks), and clamd's `MaxThreads` must cover
`containerConcurrency`.

One related trap, since it cost an afternoon: do **not** call `req.destroy()`
when a request body exceeds a cap. That closes the socket the response has to
travel on, and the caller sees a dropped connection instead of the verdict.
Stop buffering, answer, and hang up afterwards.

## Only then

Set the scanner endpoint and turn the trigger's flag on. Not before: with the
flag on and no scanner, every upload has its token stripped and never gets it
back. The code refuses to do that — `shouldHandle` returns false without a
configured scanner — and the order is still worth respecting.
