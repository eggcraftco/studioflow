#!/usr/bin/env bash
# One benign detection for the evidence pack, from Google's own test guidance
# for Event Threat Detection: resolving the test domain
# etd-malware-trigger.goog from inside a VPC whose Cloud DNS server policy
# logs queries raises "Malware: Bad Domain". Nothing is contacted — the
# resolution is the event; the egress firewall would drop the connection
# anyway (only TCP/443 leaves, and only to the allowlist).
#
# The resolver is a Cloud Run JOB on the zone's own image (ROLE-less
# one-liner), in amazon-vpc with direct VPC egress, run as amazon-sync@.
# Creating/updating the job impersonates amazon-deploy@; executing it is the
# operator's act. Then the finding is awaited on the v2 API, the copy Pub/Sub
# kept on the evidence subscription is pulled, and the record is written to
# docs/security/evidence/amazon/scc-test-<date>.txt.
set -uo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
export CLOUDSDK_CORE_PROJECT="$PROJECT"
REGION="europe-west2"
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
DEPLOY_SA="amazon-deploy@$PROJECT.iam.gserviceaccount.com"
CATEGORY="Malware: Bad Domain"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/docs/security/evidence/amazon/scc-test-$(date -u +%Y-%m-%d).txt"
IMAGE="${IMAGE:-$(gcloud run services describe amazon-admin --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.containers[0].image)')}"
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# gcloud splits --args on commas, so the one-liner travels base64-encoded.
SCRIPT_B64=$(printf '%s' "const d=require('dns').promises;d.resolve4('etd-malware-trigger.goog').then(a=>console.log('etdtest resolved '+a.join(' '))).catch(e=>console.log('etdtest resolve error '+e.code));" | base64 | tr -d '\n')

verb=create; gcloud run jobs describe amazon-etd-test --project="$PROJECT" --region="$REGION" >/dev/null 2>&1 && verb=update
gcloud run jobs "$verb" amazon-etd-test --project="$PROJECT" --region="$REGION" --image="$IMAGE" --command=node --args="-e,eval(atob('$SCRIPT_B64'))" \
  --network=amazon-vpc --subnet=amazon-subnet --vpc-egress=all-traffic --service-account="amazon-sync@$PROJECT.iam.gserviceaccount.com" \
  --max-retries=0 --task-timeout=60s --impersonate-service-account="$DEPLOY_SA" >/dev/null 2>&1 || { echo "could not $verb the job"; exit 2; }
out=$(mktemp); gcloud run jobs execute amazon-etd-test --project="$PROJECT" --region="$REGION" --wait >"$out" 2>&1; rc=$?
EXEC=$(grep -o 'amazon-etd-test-[a-z0-9]*' "$out" | head -1); rm -f "$out"
{
  echo "# $STAMP — Event Threat Detection test: Google's documented benign trigger (Malware: Bad Domain)"
  echo "# Cloud Run job amazon-etd-test (image $IMAGE, amazon-vpc, as amazon-sync@) resolves etd-malware-trigger.goog; execution $EXEC (exit $rc)"
  echo
  sleep 15
  echo "== the job's own line"
  gcloud logging read "resource.type=\"cloud_run_job\" AND labels.\"run.googleapis.com/execution_name\"=\"$EXEC\" AND textPayload:\"etdtest\"" \
    --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=15m --limit=3 --format='value(textPayload)'
  echo "== the DNS query as Cloud DNS logged it"
  gcloud logging read 'resource.type="dns_query" AND jsonPayload.queryName:"etd-malware-trigger"' \
    --project="$PROJECT" --bucket=amazon-audit --location="$REGION" --view=_AllLogs --freshness=15m --limit=3 --format='value(timestamp,jsonPayload.queryName,jsonPayload.sourceIP,jsonPayload.responseCode)'
} | tee "$OUT"

echo "waiting for the finding (up to 30 minutes, polling every 60 s)…"
found=""
for i in $(seq 1 30); do
  T=$(gcloud auth print-access-token)
  found=$(curl -s -H "Authorization: Bearer $T" -H "x-goog-user-project: $PROJECT" -G --data-urlencode "filter=category=\"$CATEGORY\"" \
    "https://securitycenter.googleapis.com/v2/projects/$PN/sources/-/locations/global/findings" | python3 -c "
import json,sys; d=json.load(sys.stdin)
for r in d.get('listFindingsResults',[]):
    f=r['finding']; print(f['name']+' | '+f.get('severity','')+' | '+f.get('eventTime','')+' | '+f.get('state','')); break")
  [ -n "$found" ] && break
  sleep 60
done
{
  echo
  if [ -n "$found" ]; then echo "finding: $found"; else echo "finding: NOT seen within 30 minutes (category \"$CATEGORY\")"; fi
  echo
  echo "== delivery: messages kept on subscription scc-findings-evidence (pulled, not acked)"
  gcloud pubsub subscriptions pull scc-findings-evidence --project="$PROJECT" --limit=5 --format='value(message.publishTime,message.data.decode(base64))' 2>&1 | python3 -c "
import sys,json
for line in sys.stdin:
    parts=line.rstrip('\n').split('\t',1)
    if len(parts)==2:
        try: j=json.loads(parts[1]); f=j.get('finding',{}); print('  '+parts[0]+' | '+f.get('category','?')+' | '+f.get('severity','?'))
        except Exception: print('  '+parts[0]+' | (unparsed message)')
    elif line.strip(): print('  '+line.rstrip())"
  echo
  echo "== alert policy that emails the operator"
  gcloud alpha monitoring policies list --project="$PROJECT" --filter='displayName="Amazon zone: SCC finding published"' --format='value(displayName,enabled,notificationChannels)' 2>&1 | tr '\t' ' '
} | tee -a "$OUT"
echo "record: $OUT"
[ -n "$found" ]
