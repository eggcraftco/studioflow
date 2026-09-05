#!/usr/bin/env bash
# Cloud Run Threat Detection — Google's documented harmless test, run in
# THIS project on the zone's own image (second-generation execution
# environment, which every Amazon service and job already uses):
#   "Defense Evasion: Base64 ELF File Command Line"
#   command: sleep 60; base64 -d f0VMRgIB; sleep 10
# (decoding a base64 string that begins with the ELF magic is the trigger;
# nothing is written, executed or contacted). Google documents these tests as
# Cloud Run JOBS created with `gcloud run jobs create … --wait`; the detector
# covers every Cloud Run resource of the project, services included.
# Creating the job impersonates amazon-deploy@; executing it is the operator's
# act. Like every Cloud Run resource here it must route through amazon-vpc:
# the project's run.allowedVPCEgress policy refused the first attempt without
# it — the control working as designed.
# Then the finding is awaited on the v2 API and the Pub/Sub copy pulled.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
export CLOUDSDK_CORE_PROJECT="$PROJECT"
REGION="europe-west2"
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
DEPLOY_SA="amazon-deploy@$PROJECT.iam.gserviceaccount.com"
CATEGORY="Defense Evasion: Base64 ELF File Command Line"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/security/evidence/amazon/scc-crtd-test-$(date -u +%Y-%m-%d).txt"
IMAGE="${IMAGE:-$(gcloud run services describe amazon-admin --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.containers[0].image)')}"
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

verb=create; gcloud run jobs describe amazon-crtd-test --project="$PROJECT" --region="$REGION" >/dev/null 2>&1 && verb=update
gcloud run jobs "$verb" amazon-crtd-test --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
  --command=bash --args="-c,sleep 60; base64 -d f0VMRgIB; sleep 10" \
  --network=amazon-vpc --subnet=amazon-subnet --vpc-egress=all-traffic \
  --service-account="amazon-sync@$PROJECT.iam.gserviceaccount.com" --max-retries=0 --task-timeout=180s \
  --impersonate-service-account="$DEPLOY_SA" >/dev/null 2>&1 || { echo "could not $verb the job"; exit 2; }
out=$(mktemp); gcloud run jobs execute amazon-crtd-test --project="$PROJECT" --region="$REGION" --wait >"$out" 2>&1; rc=$?
EXEC=$(grep -o 'amazon-crtd-test-[a-z0-9]*' "$out" | head -1); rm -f "$out"
{
  echo "# $STAMP — Cloud Run Threat Detection test: Google's documented harmless trigger ($CATEGORY)"
  echo "# Cloud Run job amazon-crtd-test, image $IMAGE (gen2), as amazon-sync@; command: sleep 60; base64 -d f0VMRgIB; sleep 10; execution $EXEC (exit $rc)"
  echo "# live config: $(gcloud scc manage services describe cloud-run-threat-detection --project="$PROJECT" --format='value(name.basename(),intendedEnablementState,effectiveEnablementState)' | tr '\t' ' ')"
  echo
} | tee "$OUT"
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
{
  if [ -n "$found" ]; then echo "finding: $found"; else echo "finding: NOT seen within 30 minutes (category \"$CATEGORY\")"; fi
  echo
  echo "== delivery: messages kept on subscription scc-findings-evidence (pulled, not acked)"
  gcloud pubsub subscriptions pull scc-findings-evidence --project="$PROJECT" --limit=10 --format='value(message.publishTime,message.data.decode(base64))' 2>&1 | python3 -c "
import sys,json
for line in sys.stdin:
    parts=line.rstrip('\n').split('\t',1)
    if len(parts)==2:
        try: j=json.loads(parts[1]); f=j.get('finding',{}); print('  '+parts[0]+' | '+f.get('category','?')+' | '+f.get('severity','?'))
        except Exception: print('  '+parts[0]+' | (unparsed message)')
    elif line.strip(): print('  '+line.rstrip())"
} | tee -a "$OUT"
echo "record: $OUT"
[ -n "$found" ]
