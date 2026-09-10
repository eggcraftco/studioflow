#!/usr/bin/env bash
# Observe one CRTD test execution: completion, the payload log line, then SCC findings for 40 minutes. Never prints a token.
P=nivadesk-amazon; R=europe-west2; PN=145308107004; JOB="$1"; EXEC="$2"; D="$3"; OUT="$D/monitor.log"
log(){ echo "$(date -u +%FT%TZ) $*" >> "$OUT"; }
log "monitor start job=$JOB exec=$EXEC pid=$$"
DONE=""; for i in $(seq 1 25); do
  J=$(gcloud run jobs executions describe "$EXEC" --project $P --region $R --format=json 2>/dev/null)
  C=$(printf '%s' "$J" | python3 -c 'import json,sys; e=json.load(sys.stdin); s=e.get("status",{}); print(s.get("completionTime",""), s.get("succeededCount",0), s.get("failedCount",0), s.get("startTime",""))' 2>/dev/null)
  log "exec status: completion/succeeded/failed/start = $C"
  case "$C" in 20*) DONE=1; printf '%s' "$J" > "$D/execution-final.json"; break;; esac
  sleep 60
done
[ -z "$DONE" ] && log "execution not complete after 25 polls; continuing to logs/findings anyway"
START=$(sed -n 's/^execute issued //p' "$D/job.txt" | head -1)
gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\" AND timestamp>=\"$START\"" --project $P --limit 300 --format='value(timestamp,severity,textPayload)' > "$D/container.log" 2>&1
log "container log lines: $(wc -l < "$D/container.log"); payload line: $(grep -c 'base64: f0VMRgIB' "$D/container.log"); timeout line: $(grep -ci 'maximum timeout' "$D/container.log")"
PAYLOAD_TS=$(grep 'base64: f0VMRgIB' "$D/container.log" | head -1 | cut -f1)
log "payload timestamp: ${PAYLOAD_TS:-none}"
END=$(( $(date +%s) + 2400 )); log "findings window until $(date -u -r $END +%FT%TZ)"
n=0; while [ $(date +%s) -lt $END ]; do
  n=$((n+1)); F="$D/findings-$n.json"
  curl -s -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" "https://securitycenter.googleapis.com/v2/projects/$PN/sources/-/findings?pageSize=200" -o "$F"
  SUMMARY=$(python3 - "$F" "$START" <<'PY'
import json,sys,re
raw=open(sys.argv[1],'rb').read().decode('utf-8','replace'); raw=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',' ',raw)
try: d=json.loads(raw)
except Exception as e: print("parse-error", str(e)[:60]); sys.exit()
rows=[x.get('finding',x) for x in d.get('listFindingsResults',[])]
tot=len(rows); since=sys.argv[2]
new=[(f.get('category'),f.get('eventTime'),f.get('state')) for f in rows if (f.get('eventTime') or '')>=since]
cats=sorted(set(f.get('category','?') for f in rows))
print(f"total={tot} categories={cats} newSinceExecute={new}")
PY
)
  log "findings poll $n: $SUMMARY"
  sleep 300
done
log "monitor done"
