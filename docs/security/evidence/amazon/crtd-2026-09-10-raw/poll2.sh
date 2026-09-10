#!/usr/bin/env bash
# Findings poller, corrected: quota-project header. Every 5 minutes until the window end. Never prints a token.
PN=145308107004; D="$1"; ENDTS="$2"; OUT="$D/monitor.log"
log(){ echo "$(date -u +%FT%TZ) $*" >> "$OUT"; }
log "poll2 start pid=$$ window until $(date -u -r $ENDTS +%FT%TZ)"
n=1; while :; do
  n=$((n+1)); F="$D/findings-$n.json"
  CODE=$(curl -s -o "$F" -w '%{http_code}' -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" -H "x-goog-user-project: nivadesk-amazon" "https://securitycenter.googleapis.com/v2/projects/$PN/sources/-/findings?pageSize=200")
  SUMMARY=$(python3 - "$F" <<'PY'
import json,sys,re
raw=open(sys.argv[1],'rb').read().decode('utf-8','replace'); raw=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',' ',raw)
try: d=json.loads(raw)
except Exception as e: print("parse-error", str(e)[:60]); sys.exit()
if 'error' in d: print("api-error", d['error'].get('code'), (d['error'].get('message') or '')[:80]); sys.exit()
rows=[x.get('finding',x) for x in d.get('listFindingsResults',[])]
since="2026-09-10T09:29:34Z"
new=[(f.get('category'),f.get('eventTime'),f.get('state'),(f.get('resourceName') or '')[-60:]) for f in rows if (f.get('eventTime') or '')>=since]
threat=[(f.get('category'),f.get('eventTime')) for f in rows if re.search(r'base64|elf|execution|defense|malicious|container|threat', (f.get('category') or ''), re.I)]
print(f"total={len(rows)} totalSize={d.get('totalSize')} categories={sorted(set(f.get('category','?') for f in rows))} newSinceExecute={new} threatLike={threat}")
PY
)
  log "findings poll $n: HTTP $CODE $SUMMARY"
  [ $(date +%s) -ge $ENDTS ] && break
  sleep 300
done
log "poll2 done"
