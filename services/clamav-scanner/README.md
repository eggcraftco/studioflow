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

```bash
gcloud run deploy clamav-scanner \
  --source services/clamav-scanner \
  --region europe-west2 \
  --memory 4Gi --cpu 2 \
  --min-instances 0 --max-instances 3 \
  --timeout 300 \
  --no-allow-unauthenticated \
  --project <staging project>
```

`--no-allow-unauthenticated` matters: the scanner takes arbitrary bytes and must
not be an open endpoint. The trigger calls it with the function's service
account identity.

4 GiB is not generosity — ClamAV's in-memory signature database is around 2 GiB
and the scan needs headroom above it.

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
