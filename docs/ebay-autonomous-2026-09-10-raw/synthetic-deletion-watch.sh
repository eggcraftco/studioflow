#!/bin/zsh
# Observe the synthetic ledger row through the 13:45Z reconcileEbayDeletions run: sweep log, Cloud Tasks records,
# worker request/app log, row state; then delete the row ONLY if it reached done. Read-only apart from that delete.
P=eggcraft-studio; ID=preflight-synthetic-20260910T134031Z; T0=2026-09-10T13:44:30Z; stamp(){ date -u +%FT%TZ; }
cd /Users/gocmen/Developer/studioflow-app/functions
rowstate(){ node -e '
const admin=require("firebase-admin");admin.initializeApp({projectId:"eggcraft-studio"});
admin.firestore().collection("ebayDeletionRequests").doc(process.argv[1]).get().then(s=>{const d=s.data()||{};console.log(JSON.stringify({exists:s.exists,status:d.status,attempts:d.attempts,leaseUntilMs:d.leaseUntilMs,reconciledAtMs:d.reconciledAtMs,lastRedeliveryAtMs:d.lastRedeliveryAtMs,finishedAtMs:d.finishedAtMs,ordersScrubbed:d.ordersScrubbed,restrictedDocsDeleted:d.restrictedDocsDeleted,connectionsDisconnected:d.connectionsDisconnected,indexRowsDeleted:d.indexRowsDeleted,sanitizedError:d.sanitizedError}));process.exit(0)})' "$ID" 2>/dev/null | grep -v Warning; }
for i in {1..14}; do
  sleep 30
  st=$(rowstate)
  echo "--- $(stamp) poll $i row: $st"
  echo "$st" | grep -q '"status":"done"' && break
done
echo "=== $(stamp) sweep + worker logs since $T0"
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"^(reconcileebaydeletions|ebayeventworker)$\" AND timestamp>=\"$T0\"" --project=$P --limit=40 --format=json 2>/dev/null | python3 -c "
import json,sys
for r in sorted(json.load(sys.stdin),key=lambda x:x.get('timestamp','')):
    h=r.get('httpRequest') or {}
    print('  ',r.get('timestamp'),r['resource']['labels']['service_name'],r.get('severity'),('HTTP '+str(h.get('status'))+' '+str(h.get('userAgent',''))[:26]) if h else '',str(r.get('textPayload') or (r.get('jsonPayload') or {}).get('message') or '')[:140].replace('\n',' '))"
echo "=== $(stamp) Cloud Tasks records since $T0"
gcloud logging read "logName=\"projects/eggcraft-studio/logs/cloudtasks.googleapis.com%2Ftask_operations_log\" AND timestamp>=\"$T0\"" --project=$P --limit=20 --format=json 2>/dev/null | python3 -c "
import json,sys
for r in sorted(json.load(sys.stdin),key=lambda x:x.get('timestamp','')):
    j=r.get('jsonPayload',{});k=[x for x in j if x.endswith('Log')];d=j.get(k[0],{}) if k else {}
    print('  ',r.get('timestamp'),'|',j.get('task','').split('/')[-1][:60],'|',k[0] if k else '?','| status:',d.get('status','-'),'| target:',str(d.get('targetAddress',''))[-40:])"
echo "=== $(stamp) final row state: $(rowstate)"
if rowstate | grep -q '"status":"done"'; then
  node -e 'const admin=require("firebase-admin");admin.initializeApp({projectId:"eggcraft-studio"});admin.firestore().collection("ebayDeletionRequests").doc(process.argv[1]).delete().then(()=>{console.log("  synthetic row deleted");process.exit(0)})' "$ID" 2>/dev/null | grep -v Warning
  echo "  ledger count after cleanup: $(node -e 'const admin=require("firebase-admin");admin.initializeApp({projectId:"eggcraft-studio"});admin.firestore().collection("ebayDeletionRequests").count().get().then(s=>{console.log(s.data().count);process.exit(0)})' 2>/dev/null | grep -v Warning)"
else
  echo "  row NOT done — left in place for diagnosis (no delete)"
fi
echo "=== $(stamp) TTL policy states"; gcloud firestore fields ttls list --project=$P --format='value(name,ttlConfig.state)' | sed -E 's#projects/[^/]+/databases/[^/]+/collectionGroups/##; s#/fields/# . #' | grep -i ebay | sed 's/^/  /'
echo "=== $(stamp) watch done"
