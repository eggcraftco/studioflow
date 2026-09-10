#!/bin/zsh
# Watch the three scheduler jobs' first attempts and the sweeps' own log lines for up to 22 minutes. Read-only.
P=eggcraft-studio; R=europe-west2; stamp(){ date -u +%FT%TZ; }
T0=2026-09-10T11:45:54Z
for i in {1..22}; do
  sleep 60
  echo "--- $(stamp) poll $i"
  gcloud scheduler jobs list --location=$R --project=$P --format=json 2>/dev/null | python3 -c "
import json,sys
for j in json.load(sys.stdin):
    n=j['name'].split('/')[-1]
    if 'ebay' not in n.lower(): continue
    print('  job',n.replace('firebase-schedule-','').replace('-europe-west2',''),'| lastAttempt:',j.get('lastAttemptTime','-'),'| status.code:',j.get('status',{}).get('code','(none = OK)'),'| scheduleTime:',j.get('scheduleTime','-'))"
  gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"^reconcileebay\" AND timestamp>=\"$T0\"" --project=$P --limit=30 --format=json 2>/dev/null | python3 -c "
import json,sys
rows=json.load(sys.stdin)
for r in sorted(rows,key=lambda x:x.get('timestamp','')):
    h=r.get('httpRequest') or {}
    print('  ',r.get('timestamp'),r['resource']['labels']['service_name'],r.get('severity'),('HTTP '+str(h.get('status'))) if h else '',str(r.get('textPayload') or (r.get('jsonPayload') or {}).get('message') or '')[:120].replace('\n',' '))
print('   (log rows:',len(rows),')')"
  n=$(gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"^reconcileebay\" AND timestamp>=\"$T0\" AND httpRequest.status>0" --project=$P --limit=10 --format='value(resource.labels.service_name)' 2>/dev/null | sort -u | wc -l | tr -d ' ')
  if [ "$n" -ge 2 ]; then echo "=== $(stamp) both frequent sweeps have been invoked at least once; stopping the watch"; break; fi
done
echo "=== $(stamp) watch done"
