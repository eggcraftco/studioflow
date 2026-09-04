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
  --tag europe-west2-docker.pkg.dev/<project>/nivadesk/clamav-scanner:v1 \
  --project <project>
```

**2. Deploy the service from the spec**

```bash
sed 's|IMAGE_PLACEHOLDER|europe-west2-docker.pkg.dev/<project>/nivadesk/clamav-scanner:v1|' \
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

It checks four things, and the fourth is the one that gets skipped: a clean file
comes back clean, EICAR comes back infected, an oversized file comes back
`too_large` rather than clean, and an unreachable scanner does not produce a
pass. The EICAR string is assembled at runtime so this repository never contains
it — checking it in would have every scanner on every developer machine
quarantine the checkout.

## Only then

Set the scanner endpoint and turn the trigger's flag on. Not before: with the
flag on and no scanner, every upload has its token stripped and never gets it
back. The code refuses to do that — `shouldHandle` returns false without a
configured scanner — and the order is still worth respecting.
