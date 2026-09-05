#!/usr/bin/env bash
# Fallback for the Event Threat Detection test, exactly as Google documents it
# ("Malware: Bad Domain"): a VM in a VPC whose Cloud DNS server policy logs
# queries runs `curl etd-malware-trigger.goog`. Used only if the Cloud Run
# resolver (scc-test.sh) did not produce the finding — do not loop the Cloud
# Run test instead.
#
# The VM is the smallest there is, has NO external address (the project's
# compute.vmExternalIpAccess policy forbids one; Cloud NAT is not even needed,
# the DNS query is the event), no service account, lives in amazon-subnet, and
# is deleted at the end of this script whatever happens.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
export CLOUDSDK_CORE_PROJECT="$PROJECT"
REGION="europe-west2"; ZONE="europe-west2-a"
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
CATEGORY="Malware: Bad Domain"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/security/evidence/amazon/scc-test-$(date -u +%Y-%m-%d).txt"
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VM="amazon-etd-vm-test"
cleanup() { gcloud compute instances delete "$VM" --zone="$ZONE" --project="$PROJECT" --quiet >/dev/null 2>&1 && echo "  VM deleted" || true; }
trap cleanup EXIT

echo "══ VM with Google's documented trigger as its startup script ══"
gcloud compute instances create "$VM" --project="$PROJECT" --zone="$ZONE" --machine-type=e2-micro \
  --network=amazon-vpc --subnet=amazon-subnet --no-address --no-service-account --no-scopes \
  --image-family=debian-12 --image-project=debian-cloud \
  --metadata=startup-script='#!/bin/bash
for i in 1 2 3; do curl -s -m 10 etd-malware-trigger.goog >/dev/null 2>&1; getent hosts etd-malware-trigger.goog; sleep 20; done' \
  --labels=purpose=scc-test >/dev/null 2>&1 || { echo "could not create the VM"; exit 2; }
echo "  created; the startup script resolves etd-malware-trigger.goog three times"
sleep 120
{
  echo "# $STAMP — Event Threat Detection test, Google's documented VM procedure (Malware: Bad Domain): e2-micro $VM in amazon-subnet (no external address, no service account), startup script curl/getent etd-malware-trigger.goog"
  echo "== the DNS queries as Cloud DNS logged them"
  gcloud logging read 'resource.type="dns_query" AND jsonPayload.queryName:"etd-malware-trigger"' \
    --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=10m --limit=5 --format='value(timestamp,jsonPayload.queryName,jsonPayload.sourceIP,jsonPayload.vmInstanceName,jsonPayload.responseCode)'
} | tee -a "$OUT"
cleanup; trap - EXIT
echo "waiting for the finding (up to 30 minutes, polling every 60 s)…"
found=""
for i in $(seq 1 30); do
  T=$(gcloud auth print-access-token)
  found=$(curl -s -H "Authorization: Bearer $T" -H "x-goog-user-project: $PROJECT" -G --data-urlencode "filter=category=\"$CATEGORY\"" \
    "https://securitycenter.googleapis.com/v2/projects/$PN/sources/-/locations/global/findings" | python3 -c "
import json,sys; d=json.load(sys.stdin)
for r in d.get('listFindingsResults',[]):
    f=r['finding']; print(f['name']+' | '+f.get('severity','')+' | '+f.get('eventTime','')+' | '+f.get('state','')+' | '+f.get('resourceName','')); break")
  [ -n "$found" ] && break
  sleep 60
done
{ if [ -n "$found" ]; then echo "finding: $found"; else echo "finding: NOT seen within 30 minutes (category \"$CATEGORY\")"; fi; } | tee -a "$OUT"
[ -n "$found" ]
