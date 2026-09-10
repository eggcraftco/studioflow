#!/bin/zsh
# Delivery tests through the real queue. Each task is created by the OPERATOR (user credentials, roles/owner) —
# that is the CreateTask caller. The OIDC token on the task names the identity Cloud Run authorises at the door.
# What each test proves: dispatch + run.invoker for the OIDC identity + the handler reaching application code.
# What it does NOT prove: the runtime SA's own enqueue permission (cloudtasks.enqueuer) — the caller here is the operator.
set -u
PROJECT=eggcraft-studio; REGION=europe-west2; SA=ebay-connector@$PROJECT.iam.gserviceaccount.com; COMPUTE=477037475099-compute@developer.gserviceaccount.com
URL='https://europe-west2-eggcraft-studio.cloudfunctions.net/ebayEventWorker'
stamp() { date -u +%FT%TZ; }
run_one() {
  local label="$1" oidc="$2" key="$3"
  local T0=$(stamp)
  echo "=== Test $label: CreateTask caller = $(gcloud config get-value account 2>/dev/null) (user, roles/owner); OIDC identity = $oidc; T0=$T0"
  gcloud tasks create-http-task "preflight-${label}-$(date -u +%H%M%S)" --project=$PROJECT --location=$REGION --queue=ebayEventWorker \
    --url="$URL" --method=POST --header='Content-Type: application/json' \
    --body-content="{\"data\":{\"key\":\"${key}\",\"provider\":\"ebay\",\"connectionId\":\"preflight-missing-20260910\",\"companyId\":\"preflight-missing-20260910\",\"entityType\":\"order\",\"externalId\":\"0\",\"eventType\":\"preflight\",\"attempt\":1}}" \
    --oidc-service-account-email="$oidc" --format='value(name,scheduleTime,dispatchCount,responseCount)' 2>&1 | sed 's/^/  created: /'
  sleep 25
  echo "  --- worker application log since $T0"
  gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"ebayeventworker\" AND timestamp>=\"$T0\"" --project=$PROJECT --limit 30 --format=json 2>/dev/null | python3 -c "
import json,sys
rows=json.load(sys.stdin)
for r in sorted(rows,key=lambda x:x.get('timestamp','')):
    hr=r.get('httpRequest') or {}
    msg=r.get('textPayload') or (r.get('jsonPayload') or {}).get('message') or ''
    err=(r.get('jsonPayload') or {}).get('error') or (r.get('jsonPayload') or {}).get('stack') or ''
    s=str(err)
    print('   ',r.get('timestamp'),r.get('severity'),('HTTP '+str(hr.get('status'))) if hr else '',str(msg)[:110].replace('\n',' '),('| err: '+s[:120].replace('\n',' ')) if s else '')
print('    (rows:',len(rows),')')"
  echo "  --- queue depth now: $(gcloud tasks list --queue=ebayEventWorker --location=$REGION --project=$PROJECT --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')"
}
run_one A2 "$SA" 'ebay|preflight|A2'
run_one A2-compute "$COMPUTE" 'ebay|preflight|A2-compute'
echo "=== $(stamp) Firestore side-effect check (must be zero)"
echo "  (read-only) ebayConnections/preflight-missing-20260910 exists? and commerceEvents rows for the preflight keys:"
(cd /Users/gocmen/Developer/studioflow-app/functions && node -e '
const admin=require("firebase-admin");admin.initializeApp({projectId:"eggcraft-studio"});const db=admin.firestore();
(async()=>{const c=await db.collection("ebayConnections").doc("preflight-missing-20260910").get();console.log("  ebayConnections/preflight-missing-20260910 exists:",c.exists);
const keys=["ebay|preflight|A2","ebay|preflight|A2-compute"];const ev=require("/Users/gocmen/Developer/studioflow-app/functions/commerce/events.js");
for(const k of keys){const d=await db.collection("commerceEvents").doc(ev.eventDocId(k)).get();console.log("  commerceEvents for",k,"exists:",d.exists)}
const h=await db.collection("commerceHealth").where("connectionId","==","preflight-missing-20260910").limit(1).get();console.log("  commerceHealth rows for preflight-missing-20260910:",h.size);process.exit(0)})().catch(e=>{console.log("  check error:",e.message);process.exit(1)})') 2>&1 | grep -v 'Warning'
